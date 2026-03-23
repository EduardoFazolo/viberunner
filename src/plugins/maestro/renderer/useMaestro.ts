/**
 * useMaestro — hand-as-mouse control hook (system cursor)
 *
 * Toggle:    Two high-up claps (both arms raised) → enable/disable gesture mode
 * Right hand = system mouse cursor:
 *   Move hand          → move system cursor
 *   Quick close + open → left click
 *   Close and hold     → drag
 *   Double close/open within 800ms → right click
 *
 * Hands with wrists in the lower portion of the frame are considered idle
 * and ignored (arm must be raised to be active).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { GestureRecognizer, GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { useMaestroStore } from '../maestroStore'

// ─── Preload bridge type ─────────────────────────────────────────────────────

declare global {
  interface Window {
    maestro: {
      mouseMove(x: number, y: number): Promise<void>
      mouseClick(button?: string): Promise<void>
      mouseToggle(down: boolean, button?: string): Promise<void>
      getMousePos(): Promise<{ x: number; y: number }>
    }
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

/** Wrist y must be below this to count as "arms raised high" for clap toggle (0 = top of frame). */
const CLAP_ARMS_UP_Y = 0.40
/** Wrist y must be below this for the hand to be considered active (not idle). */
const ACTIVE_ARM_Y = 0.60
/** Normalized palm-center distance for clap detection. */
const CLAP_THRESHOLD = 0.15
/** Minimum ms between individual clap detections. */
const CLAP_COOLDOWN_MS = 400
/** Window for two claps to register as a toggle. */
const DOUBLE_CLAP_WINDOW_MS = 1500
/** Minimum ms between toggles to prevent rapid re-toggling. */
const TOGGLE_COOLDOWN_MS = 2000
/** ms the hand must stay closed before transitioning from click to drag. */
const DRAG_THRESHOLD_MS = 300
/** Window for two quick close-opens to register as right-click. */
const RIGHT_CLICK_WINDOW_MS = 800
/** Consecutive frames needed to confirm a hand open/close state change. */
const STATE_CONFIRM_FRAMES = 2
/** Exponential smoothing factor for cursor position (higher = more smoothing). */
const MOUSE_SMOOTHING = 0.35

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
export type MaestroMode = 'disabled' | 'idle' | 'moving' | 'clicking' | 'dragging'

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

function distXY(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Palm size = dist(wrist, middle-finger MCP).
 * Used to normalize thresholds so they work at any camera distance.
 */
function palmSize(lms: HandLandmark[]): number {
  return dist2D(lms[0], lms[9])
}

/** Check if hand is in a closed/fist position (at least 3 of 4 fingers curled). */
function isHandClosed(lms: HandLandmark[]): boolean {
  const ps = palmSize(lms)
  if (ps < 0.01) return false
  const tips = [8, 12, 16, 20]
  let curled = 0
  for (const t of tips) {
    if (dist2D(lms[t], lms[0]) < ps * 1.3) curled++
  }
  return curled >= 3
}

/**
 * Convert webcam-normalized coordinates to absolute screen coordinates.
 * Maps the hand position to the Electron window's content area on screen.
 */
function toScreenCoords(normX: number, normY: number): { absX: number; absY: number; winX: number; winY: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Window-relative (for overlay display)
  const winX = (1 - normX) * vw
  const winY = normY * vh
  // Absolute screen coordinates (for system cursor)
  const titleBarH = window.outerHeight - window.innerHeight
  const absX = window.screenX + winX
  const absY = window.screenY + titleBarH + winY
  return { absX, absY, winX, winY }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMaestro(): MaestroState {
  const maestroEnabled = useMaestroStore((s) => s.settings.enabled)

  const [status, setStatus]               = useState<MaestroStatus>('off')
  const [mode, setMode]                   = useState<MaestroMode>('disabled')
  const [hands, setHands]                 = useState<DetectedHand[]>([])
  const [gesturesActive, setGesturesActive] = useState(false)
  const [mousePos, setMousePos]           = useState<{ x: number; y: number } | null>(null)

  const videoRef      = useRef<HTMLVideoElement>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const rafRef        = useRef<number | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)

  // ── Toggle (double high-up clap) ──────────────────────────────────────
  const gesturesActiveRef = useRef(false)
  const wasClappingRef    = useRef(false)
  const lastClapTimeRef   = useRef(0)
  const clapCountRef      = useRef(0)
  const firstClapTimeRef  = useRef(0)
  const lastToggleRef     = useRef(0)

  // ── Mouse state machine ───────────────────────────────────────────────
  type MousePhase = 'idle' | 'grip-pending' | 'dragging'
  const mousePhaseRef      = useRef<MousePhase>('idle')
  const gripStartRef       = useRef(0)
  const lastClickTimeRef   = useRef(0)
  const smoothedNormRef    = useRef<{ x: number; y: number } | null>(null)

  // ── Hand state confirmation (debounce noise) ──────────────────────────
  const confirmedClosedRef = useRef(false)
  const rawClosedFramesRef = useRef(0)
  const rawOpenFramesRef   = useRef(0)

  // ── Teardown ──────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mousePhaseRef.current = 'idle'
    smoothedNormRef.current = null
    confirmedClosedRef.current = false
    rawClosedFramesRef.current = 0
    rawOpenFramesRef.current = 0
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
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) { recognizer.close(); return }
        recognizerRef.current = recognizer

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
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

    setHands(detectedHands)

    // ── Toggle detection (always active, even when gestures disabled) ──
    detectToggleClap(detectedHands)

    // ── If gestures disabled, reset mouse state ──
    if (!gesturesActiveRef.current) {
      resetMouseState()
      setMode('disabled')
      setMousePos(null)
      return
    }

    // ── Find right hand ──
    // MediaPipe 'Right' = user's right hand
    const rightHand = detectedHands.find((h) => h.handedness === 'Right')

    if (!rightHand) {
      releaseDragIfActive()
      resetMouseState()
      setMode('idle')
      setMousePos(null)
      return
    }

    // ── Check if right arm is raised (active) ──
    if (rightHand.landmarks[0].y > ACTIVE_ARM_Y) {
      releaseDragIfActive()
      resetMouseState()
      setMode('idle')
      setMousePos(null)
      return
    }

    // ── Process right hand as mouse ──
    processMouseHand(rightHand)
  }

  // ── Toggle: double high-up clap ───────────────────────────────────────

  function detectToggleClap(detectedHands: DetectedHand[]): void {
    if (detectedHands.length < 2) {
      wasClappingRef.current = false
      return
    }

    // Both wrists must be raised high
    const allArmsUp = detectedHands.every((h) => h.landmarks[0].y < CLAP_ARMS_UP_Y)
    if (!allArmsUp) {
      wasClappingRef.current = false
      return
    }

    const cA = palmCenter(detectedHands[0].landmarks)
    const cB = palmCenter(detectedHands[1].landmarks)
    const isClapping = distXY(cA, cB) < CLAP_THRESHOLD
    const now = Date.now()

    if (isClapping && !wasClappingRef.current && now - lastClapTimeRef.current > CLAP_COOLDOWN_MS) {
      lastClapTimeRef.current = now

      if (clapCountRef.current === 0) {
        clapCountRef.current = 1
        firstClapTimeRef.current = now
      } else if (now - firstClapTimeRef.current <= DOUBLE_CLAP_WINDOW_MS) {
        // Second clap within window → toggle
        if (now - lastToggleRef.current > TOGGLE_COOLDOWN_MS) {
          gesturesActiveRef.current = !gesturesActiveRef.current
          setGesturesActive(gesturesActiveRef.current)
          lastToggleRef.current = now
          releaseDragIfActive()
          resetMouseState()
        }
        clapCountRef.current = 0
      } else {
        // First clap expired, start fresh
        clapCountRef.current = 1
        firstClapTimeRef.current = now
      }
    }

    wasClappingRef.current = isClapping
  }

  // ── Mouse hand processing ─────────────────────────────────────────────

  function processMouseHand(hand: DetectedHand): void {
    const lms = hand.landmarks
    const center = palmCenter(lms)

    // Exponential smoothing on normalized coordinates to reduce jitter
    const prev = smoothedNormRef.current
    const smoothX = prev ? prev.x * MOUSE_SMOOTHING + center.x * (1 - MOUSE_SMOOTHING) : center.x
    const smoothY = prev ? prev.y * MOUSE_SMOOTHING + center.y * (1 - MOUSE_SMOOTHING) : center.y
    smoothedNormRef.current = { x: smoothX, y: smoothY }

    // Convert to screen coordinates (for system cursor) and window coordinates (for overlay)
    const { absX, absY, winX, winY } = toScreenCoords(smoothX, smoothY)

    // ── Debounced hand open/close ──
    const rawClosed = isHandClosed(lms)
    if (rawClosed) { rawClosedFramesRef.current++; rawOpenFramesRef.current = 0 }
    else           { rawOpenFramesRef.current++;   rawClosedFramesRef.current = 0 }

    const wasClosed = confirmedClosedRef.current
    if (!wasClosed && rawClosedFramesRef.current >= STATE_CONFIRM_FRAMES) {
      confirmedClosedRef.current = true
    } else if (wasClosed && rawOpenFramesRef.current >= STATE_CONFIRM_FRAMES) {
      confirmedClosedRef.current = false
    }
    const isClosed = confirmedClosedRef.current

    const now = Date.now()
    const phase = mousePhaseRef.current

    // Update overlay position for all phases
    setMousePos({ x: winX, y: winY })

    if (phase === 'idle') {
      // Move system cursor
      void window.maestro.mouseMove(Math.round(absX), Math.round(absY))

      if (isClosed) {
        mousePhaseRef.current = 'grip-pending'
        gripStartRef.current = now
        setMode('clicking')
      } else {
        setMode('moving')
      }

    } else if (phase === 'grip-pending') {
      // Keep tracking position while deciding click vs drag
      void window.maestro.mouseMove(Math.round(absX), Math.round(absY))

      if (!isClosed) {
        // Hand opened → click
        void window.maestro.mouseClick('left')

        // Check for right-click (second click within window)
        if (now - lastClickTimeRef.current <= RIGHT_CLICK_WINDOW_MS) {
          void window.maestro.mouseClick('right')
          lastClickTimeRef.current = 0
        } else {
          lastClickTimeRef.current = now
        }

        mousePhaseRef.current = 'idle'
        setMode('moving')
      } else if (now - gripStartRef.current > DRAG_THRESHOLD_MS) {
        // Still closed past threshold → start dragging
        void window.maestro.mouseToggle(true, 'left')
        mousePhaseRef.current = 'dragging'
        setMode('dragging')
      } else {
        setMode('clicking')
      }

    } else if (phase === 'dragging') {
      // Move while dragging (button already held down)
      void window.maestro.mouseMove(Math.round(absX), Math.round(absY))

      if (!isClosed) {
        // Hand opened → end drag
        void window.maestro.mouseToggle(false, 'left')
        mousePhaseRef.current = 'idle'
        setMode('moving')
      } else {
        setMode('dragging')
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────

  function releaseDragIfActive(): void {
    if (mousePhaseRef.current === 'dragging') {
      void window.maestro.mouseToggle(false, 'left')
    }
  }

  function resetMouseState(): void {
    mousePhaseRef.current = 'idle'
    smoothedNormRef.current = null
    confirmedClosedRef.current = false
    rawClosedFramesRef.current = 0
    rawOpenFramesRef.current = 0
  }

  return { status, mode, gesturesActive, hands, mousePos, videoRef, connections: HAND_CONNECTIONS }
}
