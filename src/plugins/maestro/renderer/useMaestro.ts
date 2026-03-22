/**
 * useMaestro — hand gesture navigation hook
 *
 * Gesture → action mapping:
 *   Closed_Fist                           → pan (grab and drag)
 *   Open_Palm + palm toward camera        → zoom IN continuously
 *   Open_Palm / None + back toward camera → zoom OUT continuously
 *   Pinch (thumb+index tips close) 1s    → focus / zoomFitNode on node under hand
 *   Clap (both hands close)              → switch active controlling hand
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { GestureRecognizer, GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useSettingsStore } from '../../../renderer/src/stores/settingsStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { zoomFitNode } from '../../../renderer/src/utils/zoomFocus'

// ─── Constants ───────────────────────────────────────────────────────────────

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

const CLAP_THRESHOLD    = 0.18    // normalized palm-center distance for clap
const CLAP_COOLDOWN_MS  = 1500
const PAN_SENSITIVITY   = 1.4
const ZOOM_IN_DELTA     = -32     // passed to zoomAt (negative = zoom in)
const ZOOM_OUT_DELTA    = 32

/**
 * Consecutive frames the same zoom gesture must be held before zoom starts.
 * At ~60fps this is ~200ms — enough to filter out accidental/transitional poses.
 */
const ZOOM_STABLE_FRAMES = 12

/**
 * Minimum absolute value of the wrist→indexMCP→pinkyMCP cross-product before
 * we treat the palm orientation as unambiguous.  Low values mean the hand is
 * nearly edge-on to the camera and flipping between palm/back is noisy.
 *
 * Typical cross-product magnitude for a clearly palm-facing hand in normalized
 * [0,1] image coords is ~0.03–0.04, so this threshold must stay well below that.
 */
const PALM_ORIENT_MIN_CROSS = 0.012

/** Thumb-tip (lm4) to index-tip (lm8) distance threshold for pinch. */
const PINCH_THRESHOLD        = 0.06
/** Min wrist-to-tip distance for a finger to count as "extended". */
const FINGER_EXTENDED_MIN    = 0.15
/** Max ms between first-pinch release and second pinch to register double-pinch. */
const DOUBLE_PINCH_WINDOW_MS = 850
/** How long (ms) the second pinch must be held to trigger focus. */
const PINCH_DWELL_MS         = 1000
/** Cooldown after a successful focus to prevent re-triggering. */
const FOCUS_COOLDOWN_MS      = 1000

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
export type MaestroMode   = 'idle' | 'pan' | 'zoom-in' | 'zoom-out' | 'pinching'

export interface HandLandmark { x: number; y: number; z: number }

export interface DetectedHand {
  landmarks: HandLandmark[]
  handedness: 'Left' | 'Right'
  gesture: string
  score: number
  /** true = palm toward camera, false = back toward camera, null = ambiguous/edge-on */
  palmFacing: boolean | null
  index: number
}

export interface PinchState {
  /**
   * 'primed'          — first pinch detected, waiting for release
   * 'awaiting-second' — released after first pinch, window open for second pinch
   * 'dwelling'        — second pinch held, arc filling toward focus
   */
  phase: 'primed' | 'awaiting-second' | 'dwelling'
  /** Progress 0–1, only meaningful in 'dwelling' phase. */
  progress: number
  screenX: number
  screenY: number
  nodeId: string | null
}

export interface MaestroState {
  status: MaestroStatus
  mode: MaestroMode
  hands: DetectedHand[]
  activeHandIndex: number | null
  pinch: PinchState | null
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
 * True when fingers are reasonably spread (avg fingertip–wrist dist > threshold).
 * Used to distinguish an open back-of-hand from a fist when gesture = "None".
 */
function fingersSpread(lms: HandLandmark[]): boolean {
  const w = lms[0]; let total = 0
  for (const tip of [4, 8, 12, 16, 20]) {
    const dx = lms[tip].x - w.x, dy = lms[tip].y - w.y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total / 5 > 0.13
}

/**
 * Detects palm-vs-back orientation via signed cross-product of the
 * wrist → indexMCP → pinkyMCP triangle (accounts for MediaPipe's
 * image-space handedness convention with a mirrored webcam feed).
 *
 * Returns null when the magnitude is too small (hand nearly edge-on)
 * so callers can treat ambiguous orientations as non-actionable.
 */
function detectPalmFacing(lms: HandLandmark[], handedness: 'Left' | 'Right'): boolean | null {
  const w = lms[0], i = lms[5], p = lms[17]
  const v1x = i.x - w.x, v1y = i.y - w.y
  const v2x = p.x - w.x, v2y = p.y - w.y
  const crossZ = v1x * v2y - v1y * v2x

  if (Math.abs(crossZ) < PALM_ORIENT_MIN_CROSS) return null  // too ambiguous

  return handedness === 'Left' ? crossZ > 0 : crossZ < 0
}

/**
 * Returns the pinch midpoint in screen space (mirrored x), or null if not pinching.
 *
 * Strict pinch = thumb tip (lm4) and index tip (lm8) touching AND middle (lm12),
 * ring (lm16), and pinky (lm20) all clearly extended upward.  This matches the
 * gesture in the screenshot and rules out fists and loose half-curled hands.
 */
function detectPinchPoint(lms: HandLandmark[], vw: number, vh: number): { x: number; y: number } | null {
  if (dist2D(lms[4], lms[8]) >= PINCH_THRESHOLD) return null

  // All three remaining fingers must be extended
  const w = lms[0]
  for (const tip of [12, 16, 20]) {
    const dx = lms[tip].x - w.x, dy = lms[tip].y - w.y
    if (Math.sqrt(dx * dx + dy * dy) < FINGER_EXTENDED_MIN) return null
  }

  const mx = (lms[4].x + lms[8].x) / 2
  const my = (lms[4].y + lms[8].y) / 2
  return { x: (1 - mx) * vw, y: my * vh }
}

/** Hit-test world nodes at a window-space coordinate; returns the topmost node id. */
function hitTestNode(windowX: number, windowY: number): string | null {
  // Mirror the same transform Canvas.tsx uses for double-tap hit-testing:
  // subtract the canvas element's client rect before applying the camera offset.
  const canvasEl = document.getElementById('canvas-viewport')
  const rect = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 }

  const { camera } = useCameraStore.getState()
  const { nodes }  = useNodeStore.getState()

  const localX = windowX - rect.left
  const localY = windowY - rect.top
  const wx = (localX - camera.x) / camera.zoom
  const wy = (localY - camera.y) / camera.zoom

  let hitId: string | null = null
  let maxZ = -Infinity
  for (const node of nodes.values()) {
    if (wx >= node.x && wx <= node.x + node.width &&
        wy >= node.y && wy <= node.y + node.height &&
        node.zIndex > maxZ) {
      maxZ = node.zIndex
      hitId = node.id
    }
  }
  return hitId
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMaestro(): MaestroState {
  const maestroEnabled = useSettingsStore((s) => s.settings.maestroEnabled)
  const { pan, zoomAt } = useCameraStore()

  const [status,          setStatus]          = useState<MaestroStatus>('off')
  const [mode,            setMode]            = useState<MaestroMode>('idle')
  const [hands,           setHands]           = useState<DetectedHand[]>([])
  const [activeHandIndex, setActiveHandIndex] = useState<number | null>(null)
  const [pinch,           setPinch]           = useState<PinchState | null>(null)

  const videoRef      = useRef<HTMLVideoElement>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const rafRef        = useRef<number | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)

  const prevPalmRef         = useRef<{ x: number; y: number } | null>(null)
  const activeHandednessRef = useRef<'Left' | 'Right' | null>(null)
  const lastClapRef         = useRef<number>(0)
  const wasClappingRef      = useRef<boolean>(false)

  // Double-pinch state machine
  type PinchPhase = 'idle' | 'primed' | 'awaiting-second' | 'dwelling'
  const pinchPhaseRef     = useRef<PinchPhase>('idle')
  const pinchPhaseTimeRef = useRef<number>(0)   // when current phase started
  const pinchNodeRef      = useRef<string | null>(null)
  const lastFocusRef      = useRef<number>(0)

  /**
   * Zoom gesture stability buffer.
   * Tracks how many consecutive frames the current zoom intent has been held.
   * Resets to 0 whenever the gesture or orientation changes.
   */
  const zoomStableRef = useRef<{ gesture: string; palmFacing: boolean | null; frames: number }>({
    gesture: '', palmFacing: null, frames: 0,
  })

  // ── Teardown ─────────────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    prevPalmRef.current = null
    pinchPhaseRef.current = 'idle'
    pinchNodeRef.current = null
    setHands([]); setActiveHandIndex(null); setMode('idle'); setPinch(null)
    activeHandednessRef.current = null
  }, [])

  // ── Init ─────────────────────────────────────────────────────────────────

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

  // ── Detection loop ────────────────────────────────────────────────────────

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

  // ── Result processing ─────────────────────────────────────────────────────

  function processResult(result: GestureRecognizerResult): void {
    const detectedHands: DetectedHand[] = []
    for (let i = 0; i < result.landmarks.length; i++) {
      const handedness = result.handedness[i]?.[0]?.categoryName as 'Left' | 'Right' | undefined
      const gesture    = result.gestures[i]?.[0]?.categoryName ?? 'None'
      const score      = result.gestures[i]?.[0]?.score ?? 0
      if (!handedness) continue
      const lm = result.landmarks[i] as HandLandmark[]
      detectedHands.push({ landmarks: lm, handedness, gesture, score,
        palmFacing: detectPalmFacing(lm, handedness), index: i })
    }

    // ── Clap detection ───────────────────────────────────────────────────────
    if (detectedHands.length === 2) {
      const cA = palmCenter(detectedHands[0].landmarks)
      const cB = palmCenter(detectedHands[1].landmarks)
      const isClapping = distXY(cA, cB) < CLAP_THRESHOLD
      const now = Date.now()
      if (isClapping && !wasClappingRef.current && now - lastClapRef.current > CLAP_COOLDOWN_MS) {
        lastClapRef.current = now
        const cur = activeHandednessRef.current
        const next = cur === null
          ? detectedHands[0].handedness
          : (detectedHands.find((h) => h.handedness !== cur)?.handedness ?? detectedHands[0].handedness)
        activeHandednessRef.current = next
        prevPalmRef.current = null
      }
      wasClappingRef.current = isClapping
    } else {
      wasClappingRef.current = false
    }

    // ── No hands ─────────────────────────────────────────────────────────────
    if (detectedHands.length === 0) {
      prevPalmRef.current = null
      pinchStartRef.current = null; pinchNodeRef.current = null
      setHands([]); setActiveHandIndex(null); setMode('idle'); setPinch(null)
      return
    }

    if (activeHandednessRef.current === null) {
      activeHandednessRef.current = detectedHands[0].handedness
    }

    const activeHand = detectedHands.find((h) => h.handedness === activeHandednessRef.current)
      ?? detectedHands[0]
    const activeIdx = detectedHands.indexOf(activeHand)

    // ── Double-pinch state machine (takes priority over all other gestures) ───
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pinchPt = detectPinchPoint(activeHand.landmarks, vw, vh)
    const isPinching = pinchPt !== null
    const now = Date.now()

    // During focus cooldown, block pinch entirely
    if (isPinching && now - lastFocusRef.current <= FOCUS_COOLDOWN_MS) {
      setPinch(null)
      setHands(detectedHands); setActiveHandIndex(activeIdx); setMode('idle')
      return
    }

    // Run the state machine
    const phase = pinchPhaseRef.current

    if (isPinching) {
      prevPalmRef.current = null
      zoomStableRef.current = { gesture: '', palmFacing: null, frames: 0 }

      if (phase === 'idle') {
        // First pinch → primed
        pinchPhaseRef.current     = 'primed'
        pinchPhaseTimeRef.current = now
        pinchNodeRef.current      = hitTestNode(pinchPt.x, pinchPt.y)
        setPinch({ phase: 'primed', progress: 0, screenX: pinchPt.x, screenY: pinchPt.y, nodeId: pinchNodeRef.current })

      } else if (phase === 'primed') {
        // Still holding first pinch — keep showing primed, no action yet
        setPinch({ phase: 'primed', progress: 0, screenX: pinchPt.x, screenY: pinchPt.y, nodeId: pinchNodeRef.current })

      } else if (phase === 'awaiting-second') {
        if (now - pinchPhaseTimeRef.current <= DOUBLE_PINCH_WINDOW_MS) {
          // Second pinch within window → start dwelling
          pinchPhaseRef.current     = 'dwelling'
          pinchPhaseTimeRef.current = now
          pinchNodeRef.current      = hitTestNode(pinchPt.x, pinchPt.y)
          setPinch({ phase: 'dwelling', progress: 0, screenX: pinchPt.x, screenY: pinchPt.y, nodeId: pinchNodeRef.current })
        } else {
          // Window expired — treat this as a fresh first pinch
          pinchPhaseRef.current     = 'primed'
          pinchPhaseTimeRef.current = now
          pinchNodeRef.current      = hitTestNode(pinchPt.x, pinchPt.y)
          setPinch({ phase: 'primed', progress: 0, screenX: pinchPt.x, screenY: pinchPt.y, nodeId: pinchNodeRef.current })
        }

      } else if (phase === 'dwelling') {
        const progress = Math.min(1, (now - pinchPhaseTimeRef.current) / PINCH_DWELL_MS)
        if (progress >= 1 && pinchNodeRef.current) {
          // Dwell complete — fire focus
          zoomFitNode(pinchNodeRef.current)
          lastFocusRef.current  = now
          pinchPhaseRef.current = 'idle'
          pinchNodeRef.current  = null
          setPinch(null)
          setHands(detectedHands); setActiveHandIndex(activeIdx); setMode('idle')
          return
        }
        setPinch({ phase: 'dwelling', progress, screenX: pinchPt.x, screenY: pinchPt.y, nodeId: pinchNodeRef.current })
      }

      setHands(detectedHands); setActiveHandIndex(activeIdx); setMode('pinching')
      return
    }

    // ── Not pinching ─────────────────────────────────────────────────────────
    if (phase === 'primed') {
      // First pinch released → open the window for the second pinch
      pinchPhaseRef.current     = 'awaiting-second'
      pinchPhaseTimeRef.current = now
      setPinch({ phase: 'awaiting-second', progress: 0,
        screenX: pinch?.screenX ?? 0, screenY: pinch?.screenY ?? 0, nodeId: pinchNodeRef.current })
      setHands(detectedHands); setActiveHandIndex(activeIdx); setMode('pinching')
      return
    }

    if (phase === 'awaiting-second') {
      if (now - pinchPhaseTimeRef.current <= DOUBLE_PINCH_WINDOW_MS) {
        // Still within window, keep showing hint
        setPinch({ phase: 'awaiting-second', progress: 0,
          screenX: pinch?.screenX ?? 0, screenY: pinch?.screenY ?? 0, nodeId: pinchNodeRef.current })
        setHands(detectedHands); setActiveHandIndex(activeIdx); setMode('pinching')
        return
      }
      // Window expired without second pinch — reset
      pinchPhaseRef.current = 'idle'
      pinchNodeRef.current  = null
    }

    if (phase === 'dwelling') {
      // Released during dwell — reset
      pinchPhaseRef.current = 'idle'
      pinchNodeRef.current  = null
    }

    setPinch(null)

    // ── Normal gesture → camera action ────────────────────────────────────────
    const nextMode = applyGesture(activeHand, vw, vh)
    setHands(detectedHands); setActiveHandIndex(activeIdx); setMode(nextMode)
  }

  function applyGesture(hand: DetectedHand, vw: number, vh: number): MaestroMode {
    switch (hand.gesture) {
      case 'Closed_Fist': {
        // Pan doesn't need stability — immediate feel is important for dragging.
        zoomStableRef.current = { gesture: '', palmFacing: null, frames: 0 }
        const center = palmCenter(hand.landmarks)
        const mx = 1 - center.x, my = center.y
        if (prevPalmRef.current) {
          const dx = (mx - prevPalmRef.current.x) * vw * PAN_SENSITIVITY
          const dy = (my - prevPalmRef.current.y) * vh * PAN_SENSITIVITY
          if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) pan(dx, dy)
        }
        prevPalmRef.current = { x: mx, y: my }
        return 'pan'
      }

      case 'Open_Palm': {
        prevPalmRef.current = null
        // Ambiguous orientation → don't zoom
        if (hand.palmFacing === null) {
          zoomStableRef.current = { gesture: '', palmFacing: null, frames: 0 }
          return 'idle'
        }
        return applyZoom(hand, hand.palmFacing, vw, vh)
      }

      case 'None': {
        prevPalmRef.current = null
        // Angled back-of-hand zoom-out pose often classified "None"
        if (hand.palmFacing === false && fingersSpread(hand.landmarks)) {
          return applyZoom(hand, false, vw, vh)
        }
        zoomStableRef.current = { gesture: '', palmFacing: null, frames: 0 }
        return 'idle'
      }

      default:
        prevPalmRef.current = null
        zoomStableRef.current = { gesture: '', palmFacing: null, frames: 0 }
        return 'idle'
    }
  }

  /**
   * Shared zoom logic with stability gating.
   * Zoom only fires after ZOOM_STABLE_FRAMES consecutive frames of the same
   * gesture + orientation, preventing accidental triggers during transitions.
   */
  function applyZoom(hand: DetectedHand, palmFacing: boolean, vw: number, vh: number): MaestroMode {
    const stable = zoomStableRef.current
    const mode: MaestroMode = palmFacing ? 'zoom-in' : 'zoom-out'

    // Key stability on orientation only — gesture name can flicker between
    // Open_Palm and None for the same pose, which would reset the counter.
    if (stable.palmFacing === palmFacing) {
      stable.frames++
    } else {
      zoomStableRef.current = { gesture: hand.gesture, palmFacing, frames: 1 }
      // Show the mode label immediately so the user gets visual feedback,
      // but don't move the canvas yet.
      return mode
    }

    if (stable.frames < ZOOM_STABLE_FRAMES) {
      return mode
    }

    // Stable — apply zoom
    const center = palmCenter(hand.landmarks)
    zoomAt((1 - center.x) * vw, center.y * vh, palmFacing ? ZOOM_IN_DELTA : ZOOM_OUT_DELTA)
    return mode
  }

  return { status, mode, hands, activeHandIndex, pinch, videoRef, connections: HAND_CONNECTIONS }
}
