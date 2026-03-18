export interface ClientPointLike {
  clientX: number
  clientY: number
}

export interface ElementMetricsLike {
  left: number
  top: number
  width: number
  height: number
  clientWidth: number
  clientHeight: number
}

function resolveScale(renderedSize: number, layoutSize: number): number {
  if (!Number.isFinite(renderedSize) || !Number.isFinite(layoutSize)) return 1
  if (renderedSize <= 0 || layoutSize <= 0) return 1
  const scale = renderedSize / layoutSize
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

export function normalizeClientPointForMetrics(
  point: ClientPointLike,
  metrics: ElementMetricsLike,
): ClientPointLike {
  const scaleX = resolveScale(metrics.width, metrics.clientWidth)
  const scaleY = resolveScale(metrics.height, metrics.clientHeight)

  return {
    clientX: metrics.left + (point.clientX - metrics.left) / scaleX,
    clientY: metrics.top + (point.clientY - metrics.top) / scaleY,
  }
}

export function normalizeClientPointForElement(
  point: ClientPointLike,
  element: HTMLElement,
): ClientPointLike {
  const rect = element.getBoundingClientRect()
  return normalizeClientPointForMetrics(point, {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  })
}
