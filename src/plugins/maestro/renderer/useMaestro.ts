/**
 * useMaestro — hand-as-mouse control hook (system cursor)
 *
 * Toggle:    Two high-up claps (both arms raised) → enable/disable gesture mode
 * Right hand = system mouse cursor:
 *   Open hand             → idle (cursor stays still)
 *   Pinch (thumb+index)   → cursor snaps to pinch point
 *     release quickly     → left click
 *     hold past threshold → canvas drag (pan), release = stop drag
 *   Double pinch (800ms)  → right click
 *
 * Peace sign (V gesture)  → voice dictate (index + middle up, rest curled)
 * Pointing (index only)   → voice command  (index up, rest curled)
 *
 * Buffer: once in pinch/drag mode, only exit when hand is fully open
 * (a closed fist does NOT break out — must open hand).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { GestureRecognizer, GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useVoiceStore } from '../../../renderer/src/stores/voiceStore'
import { useMaestroStore } from '../maestroStore'

// ─── Preload bridge type ─────────────────────────────────────────────────────

declare global {
  interface Window {
    maestro: {
      mouseMove(x: number, y: number): Promise<void>
      mouseClick(button?: string): Promise<void>
      mouseToggle(down: boolean, button?: string): Promise<void>
      getMousePos(): Promise<{ x: number; y: number }>
      keyToggle(key: string, down: boolean): Promise<void>
    }
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

/** ms both open palms must be held to toggle. */
const TOGGLE_HOLD_MS = 1500
/** Minimum ms between toggles. */
const TOGGLE_COOLDOWN_MS = 2000
/** ms the pinch must be held before transitioning to drag (system mouse down). */
const DRAG_THRESHOLD_MS = 300
/** Consecutive frames needed to confirm pinch START. */
const PINCH_CONFIRM_FRAMES = 2
/** Per-frame confidence decay when pinch is NOT detected during drag. */
const DRAG_CONFIDENCE_DECAY = 0.03
/** Below this → drag stops immediately. */
const DRAG_CONFIDENCE_HARD_STOP = 0.80
/** Between HARD_STOP and this → drag stops after 500ms delay. */
const DRAG_CONFIDENCE_SOFT_STOP = 0.90
/** Above this → considered fully confident, resets any pending soft-stop timer. */
const DRAG_CONFIDENCE_RECOVER = 0.96
/** ms in the soft-stop zone before drag ends. */
const DRAG_SOFT_STOP_MS = 500
/** Interpolation speed per 60fps frame (0 = instant, 1 = never). Lower = faster tracking. */
const CURSOR_LERP = 0.15
/** Thumb-tip (lm4) to index-tip (lm8) distance threshold for pinch START, relative to palm size. */
const PINCH_THRESHOLD = 0.28
/** Wider threshold used during drag — fingers can separate more during fast movement. */
const PINCH_THRESHOLD_DRAG = 0.50
/** Zoom sensitivity: multiplier for vertical hand movement → zoom delta. */
const ZOOM_SENSITIVITY = 3.0


const PALM_LM = [0, 5, 9, 13, 17]

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaestroStatus = 'off' | 'loading' | 'ready' | 'error'
export type MaestroMode = 'disabled' | 'idle' | 'moving' | 'clicking' | 'dragging' | 'zooming'

export interface HandLandmark { x: number; y: number; z: number }

export interface DetectedHand {
  landmarks: HandLandmark[]
  handedness: 'Left' | 'Right'
  gesture: string
  score: number
  index: number
}

export interface MaestroState {
  status: MaestroStatus
  mode: MaestroMode
  gesturesActive: boolean
  hands: DetectedHand[]
  mousePos: { x: number; y: number } | null
  videoRef: React.RefObject<HTMLVideoElement>
  connections: typeof HAND_CONNECTIONS
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function palmCenter(lms: HandLandmark[]): { x: number; y: number } {
  let x = 0, y = 0
  for (const i of PALM_LM) { x += lms[i].x; y += lms[i].y }
  return { x: x / PALM_LM.length, y: y / PALM_LM.length }
}

function dist2D(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function dist3D(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function distXY(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Palm size = dist(wrist, middle-finger MCP). Normalizes thresholds across distances. */
function palmSize(lms: HandLandmark[]): number {
  return dist2D(lms[0], lms[9])
}

/** Pinch = thumb tip (lm4) touching index tip (lm8), normalized by palm size.
 *  Uses 3D distance so tilted hands are detected more reliably.
 *  Rejects closed fists — if all fingers are curled, it's a fist, not a pinch. */
function isPinching(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  if (dist3D(lms[4], lms[8]) >= ps * PINCH_THRESHOLD) return false
  // Reject if it's actually a fist (middle, ring, pinky all curled in)
  if (isFist(lms)) return false
  return true
}

/** Wider pinch check used during drag — tolerates more finger separation during fast movement.
 *  Also rejects closed fists. */
function isPinchingDrag(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  if (dist3D(lms[4], lms[8]) >= ps * PINCH_THRESHOLD_DRAG) return false
  if (isFist(lms)) return false
  return true
}

/** Midpoint between thumb tip and index tip in normalized coordinates. */
function pinchPoint(lms: HandLandmark[]): { x: number; y: number } {
  return { x: (lms[4].x + lms[8].x) / 2, y: (lms[4].y + lms[8].y) / 2 }
}

/** Fist = at least 3 of 4 non-thumb fingers curled toward wrist. */
function isFist(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  let curled = 0
  for (const t of [8, 12, 16, 20]) {
    if (dist2D(lms[t], lms[0]) < ps * 1.3) curled++
  }
  return curled >= 3
}

/** All 5 fingers extended = open palm. Used for toggle detection. */
function isOpenPalm(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  // All 4 non-thumb fingertips must be far from wrist
  const tips = [8, 12, 16, 20]
  for (const t of tips) {
    if (dist2D(lms[t], lms[0]) < ps * 1.4) return false
  }
  // Thumb tip must be far from index MCP (extended outward)
  if (dist2D(lms[4], lms[5]) < ps * 0.5) return false
  return true
}

/** Peace sign = index (lm8) and middle (lm12) fully erect, ring (lm16) and pinky (lm20) curled,
 *  thumb (lm4) curled or neutral. Used for speech-to-text gesture.
 *  Strict: fingertips must be well above their MCP joints (pointing up). */
function isPeaceSign(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  // Index and middle fingertips must be far from wrist (fully extended)
  if (dist2D(lms[8], lms[0]) < ps * 1.7) return false
  if (dist2D(lms[12], lms[0]) < ps * 1.7) return false
  // Fingertips must be above their MCP joints (y decreases upward in normalized coords)
  // Index tip (8) above index MCP (5), middle tip (12) above middle MCP (9)
  if (lms[8].y >= lms[5].y) return false
  if (lms[12].y >= lms[9].y) return false
  // Ring and pinky must be curled (close to wrist)
  if (dist2D(lms[16], lms[0]) > ps * 1.2) return false
  if (dist2D(lms[20], lms[0]) > ps * 1.2) return false
  // Thumb should not be extended outward (curled or neutral)
  if (dist2D(lms[4], lms[5]) > ps * 0.7) return false
  return true
}

/** Pointing = only index finger (lm8) fully extended, middle (lm12), ring (lm16), pinky (lm20) curled,
 *  thumb (lm4) curled or neutral. Used for voice command gesture. */
function isPointing(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  // Index fingertip must be far from wrist (fully extended)
  if (dist2D(lms[8], lms[0]) < ps * 1.7) return false
  // Index tip must be above its MCP joint (pointing up)
  if (lms[8].y >= lms[5].y) return false
  // Middle, ring, pinky must be curled (close to wrist)
  if (dist2D(lms[12], lms[0]) > ps * 1.2) return false
  if (dist2D(lms[16], lms[0]) > ps * 1.2) return false
  if (dist2D(lms[20], lms[0]) > ps * 1.2) return false
  // Thumb should not be extended outward
  if (dist2D(lms[4], lms[5]) > ps * 0.7) return false
  return true
}

/** Simple binary: pinching or not. */
type HandPose = 'open' | 'pinch'
function classifyPose(lms: HandLandmark[]): HandPose {
  return isPinching(lms) ? 'pinch' : 'open'
}

/**
 * Convert webcam-normalized coordinates to absolute screen coordinates.
 * Maps the hand position to the Electron window's content area on screen.
 */
function toScreenCoords(normX: number, normY: number): { absX: number; absY: number; winX: number; winY: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const winX = (1 - normX) * vw
  const winY = normY * vh
  const titleBarH = window.outerHeight - window.innerHeight
  const absX = window.screenX + winX
  const absY = window.screenY + titleBarH + winY
  return { absX, absY, winX, winY }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMaestro(): MaestroState {
  const maestroEnabled = useMaestroStore((s) => s.settings.enabled)
  const { zoomAt } = useCameraStore()

  const [status, setStatus]               = useState<MaestroStatus>('off')
  const [mode, setMode]                   = useState<MaestroMode>('disabled')
  const [hands, setHands]                 = useState<DetectedHand[]>([])
  const [gesturesActive, setGesturesActive] = useState(false)
  const [mousePos, setMousePos]           = useState<{ x: number; y: number } | null>(null)

  const videoRef      = useRef<HTMLVideoElement>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const rafRef        = useRef<number | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)

  // ── Toggle (both open palms held) ──────────────────────────────────────
  const gesturesActiveRef   = useRef(false)
  const lastToggleRef       = useRef(0)
  const bothOpenSinceRef    = useRef(0)

  // ── Mouse state machine ───────────────────────────────────────────────
  // idle     → hand open or not pinching, cursor stays still
  // pinching → thumb+index touching, cursor at pinch point, waiting for click-vs-drag
  // dragging → pinch held past threshold, canvas panning via delta
  //
  // Buffer: pinching/dragging only exit on 'open' (not on 'other'/fist)
  type MousePhase = 'idle' | 'pinching' | 'dragging'
  const mousePhaseRef      = useRef<MousePhase>('idle')
  const pinchStartRef      = useRef(0)
  // Target position (set by MediaPipe at its rate) and current interpolated position
  const targetNormRef      = useRef<{ x: number; y: number } | null>(null)
  const currentNormRef     = useRef<{ x: number; y: number } | null>(null)
  const velocityRef        = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 })
  const cursorRafRef       = useRef<number | null>(null)
  // ── Left fist = Cmd modifier ────────────────────────────────────────
  const cmdActiveRef       = useRef(false)
  // ── Cmd+scroll zoom (left fist + right open palm vertical movement) ──
  const prevZoomYRef       = useRef<number | null>(null)
  // ── Drag confidence (prevents noisy mid-drag drops) ───────────────────
  const dragConfidenceRef     = useRef(1)
  const softStopSinceRef     = useRef(0)
  // ── Voice gestures (edge-triggered toggles: gesture to start, same gesture to stop) ─
  const speechActiveRef      = useRef(false)
  const speechModeRef        = useRef<'dictate' | 'command'>('dictate')
  /** True while the peace sign is considered held (debounced — needs several frames off to release). */
  const peaceHeldRef         = useRef(false)
  const peaceOffFramesRef    = useRef(0)
  /** True while the pointing gesture is considered held (debounced). */
  const pointHeldRef         = useRef(false)
  const pointOffFramesRef    = useRef(0)

  // ── Hand pose confirmation (debounce noise) ───────────────────────────
  const confirmedPoseRef   = useRef<HandPose>('open')
  const rawPoseRef         = useRef<HandPose>('open')
  const rawPoseFramesRef   = useRef(0)

  // ── Teardown ──────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (mousePhaseRef.current === 'dragging') void window.maestro?.mouseToggle(false, 'left')
    mousePhaseRef.current = 'idle'
    targetNormRef.current = null
    currentNormRef.current = null
    confirmedPoseRef.current = 'open'
    rawPoseRef.current = 'open'
    rawPoseFramesRef.current = 0
    setHands([]); setMode('disabled'); setMousePos(null)
  }, [])

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!maestroEnabled) { stopAll(); setStatus('off'); return }
    setStatus('loading')
    let cancelled = false

    async function init(): Promise<void> {
      try {
        const { GestureRecognizer, FilesetResolver } = await import('@mediapipe/tasks-vision')
        if (cancelled) return
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        if (cancelled) return
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        })
        if (cancelled) { recognizer.close(); return }
        recognizerRef.current = recognizer

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); recognizer.close(); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) { stream.getTracks().forEach((t) => t.stop()); recognizer.close(); return }
        video.srcObject = stream
        await video.play()
        setStatus('ready')
        startLoop()
      } catch (err) {
        console.error('[Maestro] init failed:', err)
        if (!cancelled) setStatus('error')
      }
    }

    void init()
    return () => { cancelled = true; stopAll() }
  }, [maestroEnabled, stopAll]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 60fps cursor interpolation loop (decoupled from MediaPipe rate) ──
  // MediaPipe sets targetNormRef; this loop smoothly moves the cursor there.
  useEffect(() => {
    function cursorLoop(): void {
      const target = targetNormRef.current
      const current = currentNormRef.current

      if (mousePhaseRef.current !== 'idle' && current) {
        const vel = velocityRef.current

        if (target) {
          // MediaPipe has data — lerp toward target and track velocity
          const dx = target.x - current.x
          const dy = target.y - current.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const speed = dist > 0.15 ? 0.3 : dist > 0.05 ? 0.6 : (1 - CURSOR_LERP)
          const moveX = dx * speed
          const moveY = dy * speed
          current.x += moveX
          current.y += moveY
          // Smooth velocity estimate (exponential average of per-frame movement)
          vel.vx = vel.vx * 0.5 + moveX * 0.5
          vel.vy = vel.vy * 0.5 + moveY * 0.5
        } else {
          // No MediaPipe data — predict using velocity with friction
          current.x = Math.max(0, Math.min(1, current.x + vel.vx))
          current.y = Math.max(0, Math.min(1, current.y + vel.vy))
          vel.vx *= 0.85  // friction: decelerate
          vel.vy *= 0.85
        }

        const { absX, absY, winX, winY } = toScreenCoords(current.x, current.y)
        void window.maestro?.mouseMove(Math.round(absX), Math.round(absY))
        setMousePos({ x: winX, y: winY })
      } else if (target && mousePhaseRef.current !== 'idle') {
        // First frame — snap
        currentNormRef.current = { ...target }
        velocityRef.current = { vx: 0, vy: 0 }
      }

      cursorRafRef.current = requestAnimationFrame(cursorLoop)
    }
    cursorRafRef.current = requestAnimationFrame(cursorLoop)
    return () => { if (cursorRafRef.current !== null) cancelAnimationFrame(cursorRafRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detection loop ────────────────────────────────────────────────────
  function startLoop(): void {
    let lastTs = -1
    function loop(): void {
      const video = videoRef.current
      const recognizer = recognizerRef.current
      if (!video || !recognizer || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop); return
      }
      const now = performance.now()
      if (now !== lastTs) {
        lastTs = now
        try { processResult(recognizer.recognizeForVideo(video, now)) } catch { /* skip frame */ }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  // ── Voice toggle (shared by peace sign / pointing gestures) ──────────

  function toggleVoice(mode: 'dictate' | 'command'): void {
    if (!speechActiveRef.current) {
      // Start — or switch mode if already recording in the other mode
      speechActiveRef.current = true
      speechModeRef.current = mode
      useVoiceStore.getState().startRecording(mode)
      window.voice?.toggle().catch(() => {
        useVoiceStore.getState().stopRecording()
        speechActiveRef.current = false
      })
    } else if (speechModeRef.current === mode) {
      // Same gesture again → stop
      speechActiveRef.current = false
      useVoiceStore.getState().stopRecording()
      window.voice?.toggle().catch(() => {
        useVoiceStore.getState().startRecording(mode)
        speechActiveRef.current = true
      })
    }
    // Different gesture while active → ignore (only the matching gesture stops it)
  }

  // ── Result processing ─────────────────────────────────────────────────

  function processResult(result: GestureRecognizerResult): void {
    const detectedHands: DetectedHand[] = []
    for (let i = 0; i < result.landmarks.length; i++) {
      const handedness = result.handedness[i]?.[0]?.categoryName as 'Left' | 'Right' | undefined
      const gesture    = result.gestures[i]?.[0]?.categoryName ?? 'None'
      const score      = result.gestures[i]?.[0]?.score ?? 0
      if (!handedness) continue
      const lm = result.landmarks[i] as HandLandmark[]
      detectedHands.push({ landmarks: lm, handedness, gesture, score, index: i })
    }

    // Only update hands state when we actually see hands — don't clear on empty frames
    if (detectedHands.length > 0) setHands(detectedHands)

    // ── Toggle detection (always active, even when gestures disabled) ──
    detectToggle(detectedHands)

    // ── If gestures disabled, reset mouse state ──
    if (!gesturesActiveRef.current) {
      resetMouseState()
      setMode('disabled')
      setMousePos(null)
      return
    }

    const leftHand  = detectedHands.find((h) => h.handedness === 'Left')
    const rightHand = detectedHands.find((h) => h.handedness === 'Right')

    // ── Voice gestures (edge-triggered toggles) ──
    // Peace sign (V) → dictate mode, Pointing (index only) → command mode
    // Gesture triggers on rising edge only (must release fully before re-triggering).
    // Once active, only the SAME gesture (after a full release) can stop it.
    // Checked BEFORE fist/Cmd logic because pointing triggers isFist (3 curled fingers).
    const peaceDetected = detectedHands.some((h) => isPeaceSign(h.landmarks))
    const pointDetected = detectedHands.some((h) => isPointing(h.landmarks))

    // Debounced held state — gesture must be absent for 8+ frames to count as released.
    // This prevents flicker (brief detection drops) from causing double-toggles.
    const RELEASE_FRAMES = 8

    if (peaceDetected) {
      peaceOffFramesRef.current = 0
      if (!peaceHeldRef.current) { peaceHeldRef.current = true; toggleVoice('dictate') }
    } else {
      peaceOffFramesRef.current++
      if (peaceOffFramesRef.current >= RELEASE_FRAMES) peaceHeldRef.current = false
    }

    if (pointDetected) {
      pointOffFramesRef.current = 0
      if (!pointHeldRef.current) { pointHeldRef.current = true; toggleVoice('command') }
    } else {
      pointOffFramesRef.current++
      if (pointOffFramesRef.current >= RELEASE_FRAMES) pointHeldRef.current = false
    }

    // While recording, skip mouse/fist processing so other gestures don't interfere
    if (speechActiveRef.current) return

    // ── Left fist = "Cmd" modifier ──
    // Left fist + right open palm moving up/down = Cmd+scroll = zoom
    // Left fist + right pinch = Cmd+click / Cmd+drag (passes through to normal pinch with Cmd held)
    const leftFist  = !!(leftHand && isFist(leftHand.landmarks))
    if (leftFist !== cmdActiveRef.current) {
      cmdActiveRef.current = leftFist
      void window.maestro.keyToggle('command', leftFist)
    }

    if (leftFist && rightHand) {
      if (isOpenPalm(rightHand.landmarks)) {
        processZoom(rightHand)
        return
      }
    }

    // Not zooming — clear zoom state
    prevZoomYRef.current = null

    // ── Pick the controlling hand (single-hand mode) ──
    // Prefer 'Right' but fall back to whatever hand is visible.
    const controlHand = rightHand ?? detectedHands[0]

    // No hand visible — clear target so the cursor loop uses velocity prediction.
    if (!controlHand) {
      targetNormRef.current = null
      return
    }

    // ── Process hand as mouse ──
    processMouseHand(controlHand)
  }

  // ── Toggle: both hands open palms, held for 1.5s ───────────────────
  //
  // Both hands must be detected with all fingers extended (open palm).
  // Hold for TOGGLE_HOLD_MS to toggle on or off.
  // Can't accidentally trigger during pinch/drag (those use closed fingers).

  function detectToggle(detectedHands: DetectedHand[]): void {
    const now = Date.now()

    // Need 2 hands, both showing open palm
    const bothOpen = detectedHands.length >= 2
      && isOpenPalm(detectedHands[0].landmarks)
      && isOpenPalm(detectedHands[1].landmarks)

    if (!bothOpen) {
      bothOpenSinceRef.current = 0
      return
    }

    if (bothOpenSinceRef.current === 0) {
      bothOpenSinceRef.current = now
    }

    if (now - bothOpenSinceRef.current >= TOGGLE_HOLD_MS) {
      if (now - lastToggleRef.current > TOGGLE_COOLDOWN_MS) {
        gesturesActiveRef.current = !gesturesActiveRef.current
        setGesturesActive(gesturesActiveRef.current)
        lastToggleRef.current = now
        bothOpenSinceRef.current = 0
        if (!gesturesActiveRef.current) resetMouseState()
      }
    }
  }

  // ── Cmd+scroll zoom: left fist held, right hand vertical = zoom ─────

  function processZoom(rightHand: DetectedHand): void {
    const center = palmCenter(rightHand.landmarks)
    const y = center.y  // normalized 0 (top) to 1 (bottom)

    if (prevZoomYRef.current === null) {
      prevZoomYRef.current = y
      setMode('zooming')
      return  // first frame — just record
    }

    const dy = y - prevZoomYRef.current
    prevZoomYRef.current = y

    // Moving hand up (dy < 0) → zoom in, down (dy > 0) → zoom out
    // Like Cmd+scroll: scroll up = zoom in
    if (Math.abs(dy) > 0.002) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      zoomAt(vw / 2, vh / 2, dy * vw * ZOOM_SENSITIVITY)
    }

    setMode('zooming')
  }

  // ── Mouse hand processing ─────────────────────────────────────────────

  function processMouseHand(hand: DetectedHand): void {
    const lms = hand.landmarks

    // ── Debounced pose classification ──
    const rawPose = classifyPose(lms)
    if (rawPose === rawPoseRef.current) {
      rawPoseFramesRef.current++
    } else {
      rawPoseRef.current = rawPose
      rawPoseFramesRef.current = 1
    }
    if (rawPoseFramesRef.current >= PINCH_CONFIRM_FRAMES) {
      confirmedPoseRef.current = rawPose
    }
    const pose = confirmedPoseRef.current

    const now = Date.now()
    const phase = mousePhaseRef.current

    // ── Update target position for the 60fps interpolation loop ──
    // MediaPipe sets the target; the cursor loop smoothly moves there.
    if (phase !== 'idle') {
      targetNormRef.current = { x: lms[8].x, y: lms[8].y }
    }

    // ── IDLE: cursor stays still, wait for pinch ──
    if (phase === 'idle') {
      if (pose === 'pinch') {
        // Snap cursor to finger immediately (no lerp on first frame)
        const raw = lms[8]
        targetNormRef.current = { x: raw.x, y: raw.y }
        currentNormRef.current = { x: raw.x, y: raw.y }
        mousePhaseRef.current = 'pinching'
        pinchStartRef.current = now
        setMode('clicking')
      } else {
        setMode('idle')
      }
      return
    }

    // ── PINCHING: cursor follows index finger, deciding click vs drag ──
    if (phase === 'pinching') {
      if (pose === 'open') {
        // Pinch released → move cursor to final position, then click
        const pos = currentNormRef.current
        if (pos) {
          const { absX, absY } = toScreenCoords(pos.x, pos.y)
          void window.maestro.mouseMove(Math.round(absX), Math.round(absY))
            .then(() => window.maestro.mouseClick('left'))
        } else {
          void window.maestro.mouseClick('left')
        }
        targetNormRef.current = null
        currentNormRef.current = null
        mousePhaseRef.current = 'idle'
        setMode('idle')
        return
      }

      if (now - pinchStartRef.current > DRAG_THRESHOLD_MS) {
        // Held past threshold → ensure cursor is positioned, then mouse down
        const pos = currentNormRef.current
        if (pos) {
          const { absX, absY } = toScreenCoords(pos.x, pos.y)
          void window.maestro.mouseMove(Math.round(absX), Math.round(absY))
            .then(() => window.maestro.mouseToggle(true, 'left'))
        } else {
          void window.maestro.mouseToggle(true, 'left')
        }
        mousePhaseRef.current = 'dragging'
        setMode('dragging')
      } else {
        setMode('clicking')
      }
      return
    }

    // ── DRAGGING: mouse button held, cursor follows index finger ──
    // Uses confidence-based exit: confidence decays when pinch not detected,
    // only exits after confidence stays below threshold for sustained period.
    if (phase === 'dragging') {
      // Debounced pose says open → intentional release, stop immediately
      if (pose === 'open') {
        void window.maestro.mouseToggle(false, 'left')
        dragConfidenceRef.current = 1
        softStopSinceRef.current = 0
        targetNormRef.current = null
    currentNormRef.current = null
        mousePhaseRef.current = 'idle'
        setMode('idle')
        return
      }

      // Raw per-frame pinch check with wider threshold — fingers can separate
      // more during fast drag movement without dropping confidence.
      const rawPinching = isPinchingDrag(lms)

      if (rawPinching) {
        dragConfidenceRef.current = 1
      } else {
        dragConfidenceRef.current = Math.max(0, dragConfidenceRef.current - DRAG_CONFIDENCE_DECAY)
      }

      const conf = dragConfidenceRef.current

      // Hard stop: below 80% → end immediately
      if (conf < DRAG_CONFIDENCE_HARD_STOP) {
        void window.maestro.mouseToggle(false, 'left')
        dragConfidenceRef.current = 1
        softStopSinceRef.current = 0
        targetNormRef.current = null
    currentNormRef.current = null
        mousePhaseRef.current = 'idle'
        setMode('idle')
        return
      }

      // Soft stop: between 80–90% → end after 500ms
      if (conf < DRAG_CONFIDENCE_SOFT_STOP) {
        if (softStopSinceRef.current === 0) softStopSinceRef.current = now
        if (now - softStopSinceRef.current >= DRAG_SOFT_STOP_MS) {
          void window.maestro.mouseToggle(false, 'left')
          dragConfidenceRef.current = 1
          softStopSinceRef.current = 0
          targetNormRef.current = null
    currentNormRef.current = null
          mousePhaseRef.current = 'idle'
          setMode('idle')
          return
        }
      }

      // Recovered above 96% → reset soft-stop timer
      if (conf >= DRAG_CONFIDENCE_RECOVER) {
        softStopSinceRef.current = 0
      }

      setMode('dragging')
      return
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────

  function resetMouseState(): void {
    if (mousePhaseRef.current === 'dragging') void window.maestro?.mouseToggle(false, 'left')
    if (cmdActiveRef.current) { void window.maestro?.keyToggle('command', false); cmdActiveRef.current = false }
    if (speechActiveRef.current) {
      speechActiveRef.current = false
      peaceHeldRef.current = false
      useVoiceStore.getState().stopRecording()
      void window.voice?.toggle()
    }
    mousePhaseRef.current = 'idle'
    targetNormRef.current = null
    currentNormRef.current = null
    confirmedPoseRef.current = 'open'
    rawPoseRef.current = 'open'
    rawPoseFramesRef.current = 0
    dragConfidenceRef.current = 1
    softStopSinceRef.current = 0
    velocityRef.current = { vx: 0, vy: 0 }
  }

  return { status, mode, gesturesActive, hands, mousePos, videoRef, connections: HAND_CONNECTIONS }
}
