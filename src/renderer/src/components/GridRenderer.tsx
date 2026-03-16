import React, { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import { Camera } from '../stores/cameraStore'

interface Props {
  camera: Camera
}

export function GridRenderer({ camera }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const gridRef = useRef<Graphics | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    let cancelled = false

    const app = new Application()

    app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0d0d0d,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (cancelled) { try { app.destroy(true) } catch {} return }

      const canvas = app.canvas as HTMLCanvasElement
      canvas.style.position = 'absolute'
      canvas.style.inset = '0'
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.pointerEvents = 'none'
      container.appendChild(canvas)

      const grid = new Graphics()
      app.stage.addChild(grid)
      gridRef.current = grid
      appRef.current = app

      drawGrid(grid, window.innerWidth, window.innerHeight, camera)
    })

    return () => {
      cancelled = true
      if (appRef.current) {
        try { appRef.current.destroy(true) } catch {}
        appRef.current = null
        gridRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!appRef.current || !gridRef.current) return
    const app = appRef.current
    const grid = gridRef.current
    drawGrid(grid, app.screen.width, app.screen.height, camera)
  }, [camera])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
}

// pixi.js v8 drawing API: build path with g.circle(), then g.fill()
function drawGrid(g: Graphics, width: number, height: number, camera: Camera) {
  g.clear()

  const baseSize = 40
  const zoom = camera.zoom

  let step = baseSize
  while (step * zoom < 20) step *= 4
  while (step * zoom > 120) step /= 2

  const dotRadius = zoom > 0.5 ? 1 : 0.5

  const offsetX = ((camera.x % (step * zoom)) + step * zoom) % (step * zoom)
  const offsetY = ((camera.y % (step * zoom)) + step * zoom) % (step * zoom)

  const cols = Math.ceil(width / (step * zoom)) + 2
  const rows = Math.ceil(height / (step * zoom)) + 2

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const x = offsetX + col * step * zoom - step * zoom
      const y = offsetY + row * step * zoom - step * zoom
      g.circle(x, y, dotRadius)
    }
  }
  g.fill({ color: 0x444444 })
}
