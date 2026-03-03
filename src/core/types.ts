/** Position delta for SVG translate transforms */
export interface Point {
  x: number
  y: number
}

/** Viewport state for pan and zoom (maps to panZoomLayer transform) */
export interface ViewportState {
  /** Translate X of the panZoomLayer in SVG units */
  panX: number
  /** Translate Y of the panZoomLayer in SVG units */
  panY: number
  /** Zoom level (1 = 100%, >1 = zoomed in, <1 = zoomed out) */
  zoom: number
}

/** State machine for LayoutMap-driven group drag */
export interface DragState {
  /** Whether a drag operation is in progress */
  dragging: boolean
  /** IDs of all elements being dragged */
  draggedIds: Set<string>
  /** Anchor point in world coords at drag start */
  anchorWorldX: number
  anchorWorldY: number
  /** Snapshot of each dragged element's starting position (from LayoutMap) */
  startPositions: ReadonlyMap<string, Point>
}

/** State for node + container selection */
export interface SelectionState {
  /** Currently selected node IDs */
  selectedNodeIds: Set<string>
  /** Currently selected container IDs */
  selectedContainerIds: Set<string>
}

/** Panning state (tracked during a pan gesture) */
export interface PanState {
  panning: boolean
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
}

/** State for rubber-band box selection */
export interface BoxSelectState {
  active: boolean
  /** Start point in world (diagram) coordinates */
  startWorldX: number
  startWorldY: number
  /** Current point in world (diagram) coordinates */
  currentWorldX: number
  currentWorldY: number
}

export const IDLE_DRAG: DragState = {
  dragging: false,
  draggedIds: new Set(),
  anchorWorldX: 0,
  anchorWorldY: 0,
  startPositions: new Map(),
}

export const DEFAULT_VIEWPORT: ViewportState = {
  panX: 0,
  panY: 0,
  zoom: 1,
}

export const EMPTY_SELECTION: SelectionState = {
  selectedNodeIds: new Set(),
  selectedContainerIds: new Set(),
}

export const IDLE_PAN: PanState = {
  panning: false,
  startClientX: 0,
  startClientY: 0,
  startPanX: 0,
  startPanY: 0,
}

export const IDLE_BOX_SELECT: BoxSelectState = {
  active: false,
  startWorldX: 0,
  startWorldY: 0,
  currentWorldX: 0,
  currentWorldY: 0,
}
