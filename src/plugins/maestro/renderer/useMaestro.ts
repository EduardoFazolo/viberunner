/**
 * useMaestro — hand gesture navigation hook
 *
 * Gesture → action mapping:
 *   Closed_Fist (grab)            → pan canvas by tracking palm movement delta
 *   Open_Palm + palm toward camera → zoom IN continuously
 *   Open_Palm + back toward camera → zoom OUT continuously
 *   Clap (both hands close)        → switch active controlling hand
 *
 * Palm orientation is detected via the cross-product (winding order) of the
 * wrist → indexMCP → pinkyMCP triangle.  The sign encodes which face is toward
 * the camera, accounting for MediaPipe's image-space handedness convention.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { GestureRecognizer, GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useSettingsStore } from '../../../renderer/src/stores/settingsStore'

// ─── Constants ───────────────────────────────────────────────────────────────

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

const CLAP_THRESHOLD = 0.18      // normalized distance for both-hands-close detection
const CLAP_COOLDOWN_MS = 1500    // ms between hand switches

/**
 * How much of the viewport a full normalized-unit palm movement pans.
 * Higher = faster pan.
 */
const PAN_SENSITIVITY = 1.4

/**
 * Zoom step applied per animation frame while zoom gesture is held.
 * 1.008^60fps ≈ 1.6× per second.  Negative delta = zoom in (see zoomAt formula).
 */
const ZOOM_IN_DELTA = -8   // passed to cameraStore.zoomAt delta (negative = zoom in)
const ZOOM_OUT_DELTA = 8   // positive = zoom out

/** Landmarks used to compute palm center. */
const PALM_LM = [0, 5, 9, 13, 17]

/** Standard MediaPipe hand skeleton connections. */
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
export type MaestroMode = 'idle' | 'pan' | 'zoom-in' | 'zoom-out'

export interface HandLandmark {
  x: number  // normalized [0,1] in raw (unmirrored) image space
  y: number
  z: number
}

export interface DetectedHand {
  landmarks: HandLandmark[]
  handedness: 'Left' | 'Right'   // MediaPipe image-space handedness
  gesture: string
  score: number
  palmFacing: boolean             // true = palm toward camera, false = back toward camera
  index: number                   // index in result arrays
}

export interface MaestroState {
  status: MaestroStatus
  mode: MaestroMode
  hands: DetectedHand[]
  activeHandIndex: number | null
  videoRef: React.RefObject<HTMLVideoElement>
  connections: typeof HAND_CONNECTIONS
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function palmCenter(landmarks: HandLandmark[]): { x: number; y: number } {
  let x = 0, y = 0
  for (const i of PALM_LM) { x += landmarks[i].x; y += landmarks[i].y }
  return { x: x / PALM_LM.length, y: y / PALM_LM.length }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Returns true if the fingers are open/spread (average fingertip-to-wrist distance
 * is above a threshold).  Used to distinguish an open back-of-hand from a fist
 * when the gesture is classified as "None".
 */
function fingersSpread(landmarks: HandLandmark[]): boolean {
  const wrist = landmarks[0]
  let total = 0
  for (const tip of [4, 8, 12, 16, 20]) {
    const dx = landmarks[tip].x - wrist.x
    const dy = landmarks[tip].y - wrist.y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  // Average fingertip distance > 0.13 (normalized) = fingers reasonably spread
  return total / 5 > 0.13
}

/**
 * Detects whether the palm is facing the camera using the signed cross-product
 * (winding order) of the triangle: wrist(0) → indexMCP(5) → pinkyMCP(17).
 *
 * MediaPipe passes the raw (unmirrored) camera image, so:
 *   "Left"  in image space = user's right hand (mirrored)
 *   "Right" in image space = user's left hand  (mirrored)
 *
 * Verified orientation:
 *   Right-hand user, palm toward camera → MediaPipe "Left" → crossZ < 0 → palmFacing
 *   Right-hand user, back toward camera → MediaPipe "Left" → crossZ > 0 → !palmFacing
 */
function detectPalmFacing(landmarks: HandLandmark[], handedness: 'Left' | 'Right'): boolean {
  const wrist    = landmarks[0]
  const indexMCP = landmarks[5]
  const pinkyMCP = landmarks[17]

  const v1x = indexMCP.x - wrist.x,  v1y = indexMCP.y - wrist.y
  const v2x = pinkyMCP.x - wrist.x,  v2y = pinkyMCP.y - wrist.y
  const crossZ = v1x * v2y - v1y * v2x

  // "Left" image-space hand → palm facing when crossZ > 0
  // "Right" image-space hand → palm facing when crossZ < 0
  return handedness === 'Left' ? crossZ > 0 : crossZ < 0
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMaestro(): MaestroState {
  const maestroEnabled = useSettingsStore((s) => s.settings.maestroEnabled)
  const { pan, zoomAt } = useCameraStore()

  const [status, setStatus]             = useState<MaestroStatus>('off')
  const [mode, setMode]                 = useState<MaestroMode>('idle')
  const [hands, setHands]               = useState<DetectedHand[]>([])
  const [activeHandIndex, setActiveHandIndex] = useState<number | null>(null)

  const videoRef      = useRef<HTMLVideoElement>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const rafRef        = useRef<number | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)

  /** Previous frame's mirrored palm center for delta pan. */
  const prevPalmRef   = useRef<{ x: number; y: number } | null>(null)
  /** Handedness string of the active controller. */
  const activeHandednessRef = useRef<'Left' | 'Right' | null>(null)
  /** Timestamp of last clap (for cooldown). */
  const lastClapRef   = useRef<number>(0)
  /** Whether both hands were close last frame (edge detection). */
  const wasClappingRef = useRef<boolean>(false)

  // ── Teardown ─────────────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    prevPalmRef.current = null
    setHands([]); setActiveHandIndex(null); setMode('idle')
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
      const gesture = result.gestures[i]?.[0]?.categoryName ?? 'None'
      const score   = result.gestures[i]?.[0]?.score ?? 0
      if (!handedness) continue
      const lm = result.landmarks[i] as HandLandmark[]
      detectedHands.push({ landmarks: lm, handedness, gesture, score, palmFacing: detectPalmFacing(lm, handedness), index: i })
    }

    // ── Clap detection ───────────────────────────────────────────────────────
    if (detectedHands.length === 2) {
      const centerA = palmCenter(detectedHands[0].landmarks)
      const centerB = palmCenter(detectedHands[1].landmarks)
      const isClapping = dist(centerA, centerB) < CLAP_THRESHOLD
      const now = Date.now()

      if (isClapping && !wasClappingRef.current && now - lastClapRef.current > CLAP_COOLDOWN_MS) {
        lastClapRef.current = now
        const cur = activeHandednessRef.current
        const next = cur === null
          ? detectedHands[0].handedness
          : detectedHands.find((h) => h.handedness !== cur)?.handedness ?? detectedHands[0].handedness
        activeHandednessRef.current = next
        prevPalmRef.current = null
      }
      wasClappingRef.current = isClapping
    } else {
      wasClappingRef.current = false
    }

    // ── Active hand assignment ───────────────────────────────────────────────
    if (detectedHands.length === 0) {
      prevPalmRef.current = null
      setHands([]); setActiveHandIndex(null); setMode('idle')
      return
    }

    if (activeHandednessRef.current === null) {
      activeHandednessRef.current = detectedHands[0].handedness
    }

    const activeHand = detectedHands.find((h) => h.handedness === activeHandednessRef.current)
      ?? detectedHands[0]
    const activeIdx = detectedHands.indexOf(activeHand)

    // ── Apply gesture ────────────────────────────────────────────────────────
    const nextMode = applyGesture(activeHand)

    setHands(detectedHands)
    setActiveHandIndex(activeIdx)
    setMode(nextMode)
  }

  function applyGesture(hand: DetectedHand): MaestroMode {
    const vw = window.innerWidth
    const vh = window.innerHeight

    switch (hand.gesture) {
      case 'Closed_Fist': {
        // Pan: track palm center delta (mirrored x for natural feel)
        const center = palmCenter(hand.landmarks)
        const mx = 1 - center.x   // mirror x
        const my = center.y

        if (prevPalmRef.current) {
          const dx = (mx - prevPalmRef.current.x) * vw * PAN_SENSITIVITY
          const dy = (my - prevPalmRef.current.y) * vh * PAN_SENSITIVITY
          if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            pan(dx, dy)
          }
        }
        prevPalmRef.current = { x: mx, y: my }
        return 'pan'
      }

      case 'Open_Palm': {
        prevPalmRef.current = null

        // Zoom center: map palm center to screen coords (mirrored x)
        const center = palmCenter(hand.landmarks)
        const sx = (1 - center.x) * vw
        const sy = center.y * vh

        if (hand.palmFacing) {
          // Palm toward camera → zoom IN
          zoomAt(sx, sy, ZOOM_IN_DELTA)
          return 'zoom-in'
        } else {
          // Back of hand → zoom OUT
          zoomAt(sx, sy, ZOOM_OUT_DELTA)
          return 'zoom-out'
        }
      }

      case 'None': {
        prevPalmRef.current = null

        // The angled back-of-hand zoom-out pose is often classified as "None" by
        // MediaPipe (fingers slightly curved, hand tilted — not a clean Open_Palm).
        // Detect it via palm orientation + spread fingers so we don't accidentally
        // zoom on any random unrecognised gesture.
        if (!hand.palmFacing && fingersSpread(hand.landmarks)) {
          const center = palmCenter(hand.landmarks)
          const sx = (1 - center.x) * vw
          const sy = center.y * vh
          zoomAt(sx, sy, ZOOM_OUT_DELTA)
          return 'zoom-out'
        }
        return 'idle'
      }

      default: {
        prevPalmRef.current = null
        return 'idle'
      }
    }
  }

  return { status, mode, hands, activeHandIndex, videoRef, connections: HAND_CONNECTIONS }
}
