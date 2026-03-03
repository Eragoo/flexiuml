/** Position delta for SVG translate transforms */
export interface Point {
  x: number
  y: number
}

/** Viewport state for pan and zoom (maps to SVG viewBox) */
export interface ViewportState {
  /** Top-left x of the visible area in SVG coordinates */
  panX: number
  /** Top-left y of the visible area in SVG coordinates */
  panY: number
  /** Zoom level (1 = 100%, >1 = zoomed in, <1 = zoomed out) */
  zoom: number
}

/** State machine for dragging SVG nodes */
export interface DragState {
  /** Whether a drag operation is in progress */
  dragging: boolean
  /** The SVG element currently being dragged, or null */
  nodeId: string | null
  /** Mouse offset from the node's current translate at drag start */
  offsetX: number
  offsetY: number
  /** The node's translate at drag start */
  startTranslateX: number
  startTranslateY: number
}

/** State for node selection */
export interface SelectionState {
  /** Currently selected node IDs */
  selectedIds: Set<string>
}

/** Panning state (tracked during a pan gesture) */
export interface PanState {
  panning: boolean
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
}

export const IDLE_DRAG: DragState = {
  dragging: false,
  nodeId: null,
  offsetX: 0,
  offsetY: 0,
  startTranslateX: 0,
  startTranslateY: 0,
}

export const DEFAULT_VIEWPORT: ViewportState = {
  panX: 0,
  panY: 0,
  zoom: 1,
}

export const EMPTY_SELECTION: SelectionState = {
  selectedIds: new Set(),
}

export const IDLE_PAN: PanState = {
  panning: false,
  startClientX: 0,
  startClientY: 0,
  startPanX: 0,
  startPanY: 0,
}
