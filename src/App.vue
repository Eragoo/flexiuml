<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { renderMermaidSvg, NODE_SELECTOR, CONTAINER_SELECTOR, extractNodeId } from './core/mermaid-config'
import type { DragState, ViewportState, PanState, SelectionState, BoxSelectState } from './core/types'
import { IDLE_DRAG, DEFAULT_VIEWPORT, IDLE_PAN, IDLE_BOX_SELECT } from './core/types'
import type { LayoutMap } from './core/layout-map'
import { createEmptyLayout, computeMermaidHash } from './core/layout-map'
import type { SvgStructure } from './core/svg-structure'
import { restructureSvgDom, clearInteractionLayer } from './core/svg-structure'
import type { DiagramIndex } from './core/index-diagram'
import { indexDiagramElements } from './core/index-diagram'
import {
  findNodeGroup,
  beginDrag,
  updateDrag,
  endDrag,
  getTranslate,
  applyLayoutToDOM,
  seedLayoutFromDOM,
} from './interaction/svg-drag'
import {
  applyPanZoom,
  startPan,
  movePan,
  endPan,
  zoomAtPoint,
  fitToView,
  screenToWorld,
} from './interaction/svg-pan-zoom'
import {
  toggleNodeSelect,
  toggleContainerSelect,
  clearSelection,
  allSelectedIds,
  renderSelectionOverlays,
  clearSelectionOverlays,
  startBoxSelect,
  updateBoxSelect,
  renderBoxSelectRect,
  clearBoxSelectRect,
  endBoxSelect,
  resetBoxSelect,
  mergeSelections,
} from './interaction/svg-select'
import { buildEdgeMap, collectNodeIds, updateEdgesForNode } from './interaction/svg-edges'
import type { EdgeMapData } from './interaction/svg-edges'
import { exportLayout, importLayout, resetLayout, saveToLocalStorage, loadFromLocalStorage } from './interaction/persistence'
import { hitTestContainer, reparentNode } from './interaction/reparent'
import { computeContainerFit, updateResize } from './interaction/svg-containers'
import type { ResizeState } from './interaction/svg-containers'

const SAMPLE = `graph TD
  A[Web App] --> B[API Gateway]
  B --> C[Auth Service]
  B --> D[User Service]
  D --> E[Database]
  C --> E`

const mermaidInput = ref(SAMPLE)
const svgContainerRef = ref<HTMLDivElement | null>(null)
const errorMessage = ref<string | null>(null)
const editorWidth = ref(320)
let renderCounter = 0
let renderDebounceTimer: ReturnType<typeof setTimeout> | undefined

// ── Core state ──────────────────────────────────────────────────────────────

let structure: SvgStructure | null = null
let diagramIndex: DiagramIndex = { nodes: new Map(), containers: new Map() }
let layoutMap: LayoutMap = createEmptyLayout()

// ── Interaction state (non-reactive for 60fps performance) ──────────────────

let dragState: DragState = { ...IDLE_DRAG }
let viewport: ViewportState = { ...DEFAULT_VIEWPORT }
let panState: PanState = { ...IDLE_PAN }
let selectionState: SelectionState = { selectedNodeIds: new Set(), selectedContainerIds: new Set() }
let boxSelectState: BoxSelectState = { ...IDLE_BOX_SELECT }
// TODO: resizeState is handled in onPointerMove/onPointerUp but nothing sets it
// to non-null. Add entry point (e.g. resize handles on containers) to activate.
let resizeState: ResizeState | null = null

// Track whether a drag actually moved (to distinguish click from drag)
let dragMoved = false
// Track which element was clicked (for deselect-others on click-up)
let clickedId: string | null = null
let clickedIsContainer = false
// Track space key for pan mode
let spaceHeld = false

// Edge map: rebuilt after each render
let edgeMapData: EdgeMapData = { edges: new Map(), initialTranslates: new Map() }

// Persistence debounce
let persistDebounceTimer: ReturnType<typeof setTimeout> | undefined

// ── Helper accessors ────────────────────────────────────────────────────────

function getSvg(): SVGSVGElement | null {
  return structure?.svg ?? null
}

function getPanZoomLayer(): SVGGElement | null {
  return structure?.panZoomLayer ?? null
}

function getInteractionLayer(): SVGGElement | null {
  return structure?.interactionLayer ?? null
}

function getDiagramContent(): SVGGElement | null {
  return structure?.diagramContent ?? null
}

// ── Render pipeline ─────────────────────────────────────────────────────────

async function renderDiagram() {
  const container = svgContainerRef.value
  if (!container) return

  renderCounter++
  const thisRender = renderCounter
  const id = `mermaid-svg-${thisRender}`

  try {
    errorMessage.value = null
    const svgMarkup = await renderMermaidSvg(mermaidInput.value, id)

    // Discard stale render results
    if (thisRender !== renderCounter) return

    container.innerHTML = svgMarkup

    // Restructure SVG into target DOM shape
    structure = restructureSvgDom(container)
    if (!structure) return

    const { svg, panZoomLayer, diagramContent, interactionLayer } = structure

    // Make SVG fill the container
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.removeAttribute('height')
    // Remove viewBox — we use panZoomLayer transform for pan/zoom
    svg.removeAttribute('viewBox')

    // Index diagram elements (nodes + containers)
    diagramIndex = indexDiagramElements(diagramContent)

    // Seed layout from DOM positions (first render) or reapply existing layout
    const hash = computeMermaidHash(mermaidInput.value)
    if (layoutMap.mermaidHash === hash && Object.keys(layoutMap.nodes).length > 0) {
      // Mermaid text unchanged — reapply stored positions
      applyLayoutToDOM(layoutMap, diagramIndex)
    } else {
      // New/changed diagram — seed layout from Mermaid's default positions
      layoutMap = seedLayoutFromDOM(layoutMap, diagramIndex)
      layoutMap = { ...layoutMap, mermaidHash: hash }
    }

    // Fit to view
    await nextTick()
    viewport = fitToView(svg, diagramContent)
    applyPanZoom(panZoomLayer, viewport)

    // Reset selection
    selectionState = clearSelection()
    clearInteractionLayer(interactionLayer)

    // Build edge map for edge following
    const knownNodeIds = collectNodeIds(svg, NODE_SELECTOR, extractNodeId)
    edgeMapData = buildEdgeMap(svg, knownNodeIds, getTranslate)

    // Make node groups show grab cursor
    setupNodeCursors()
  } catch (err) {
    if (thisRender !== renderCounter) return
    errorMessage.value = err instanceof Error ? err.message : String(err)
    container.innerHTML = ''
    structure = null
  }
}

function setupNodeCursors(): void {
  const content = getDiagramContent()
  if (!content) return

  const nodes = content.querySelectorAll(NODE_SELECTOR)
  for (const node of nodes) {
    if (node instanceof SVGGElement) {
      node.style.cursor = 'grab'
    }
  }

  const containers = content.querySelectorAll(CONTAINER_SELECTOR)
  for (const container of containers) {
    if (container instanceof SVGGElement) {
      container.style.cursor = 'grab'
    }
  }
}

// ── Pointer event handlers ──────────────────────────────────────────────────

function onPointerDown(e: PointerEvent) {
  const svg = getSvg()
  const panZoomLayer = getPanZoomLayer()
  const interactionLayer = getInteractionLayer()
  if (!svg || !panZoomLayer || !interactionLayer) return

  // Space + click → pan
  if (spaceHeld) {
    panState = startPan(e.clientX, e.clientY, viewport)
    svg.style.cursor = 'grabbing'
    e.preventDefault()
    return
  }

  // Middle mouse → pan
  if (e.button === 1) {
    panState = startPan(e.clientX, e.clientY, viewport)
    svg.style.cursor = 'grabbing'
    e.preventDefault()
    return
  }

  // Only handle left button from here
  if (e.button !== 0) return

  // Check if clicked on a container
  const containerGroup = findNodeGroup(e.target, CONTAINER_SELECTOR)
  // Check if clicked on a node (node check must come first for elements
  // inside containers — we want to select the node, not the container)
  const nodeGroup = findNodeGroup(e.target, NODE_SELECTOR)

  if (nodeGroup) {
    const nodeId = extractNodeId(nodeGroup)
    if (!nodeId) return

    const multi = e.shiftKey || e.metaKey || e.ctrlKey

    // If this node is not selected, select it first
    if (!selectionState.selectedNodeIds.has(nodeId)) {
      selectionState = toggleNodeSelect(selectionState, nodeId, multi)
      renderSelectionOverlays(interactionLayer, diagramIndex, selectionState)
    }

    // Start dragging all selected elements
    const allIds = allSelectedIds(selectionState)
    dragState = beginDrag(svg, panZoomLayer, allIds, layoutMap, e.clientX, e.clientY)
    dragMoved = false
    clickedId = nodeId
    clickedIsContainer = false
    nodeGroup.style.cursor = 'grabbing'
    e.preventDefault()
  } else if (containerGroup && !nodeGroup) {
    // Clicked directly on a container (not a node inside it)
    const containerId = containerGroup.getAttribute('data-id') ?? containerGroup.id
    if (!containerId) return

    const multi = e.shiftKey || e.metaKey || e.ctrlKey

    if (!selectionState.selectedContainerIds.has(containerId)) {
      selectionState = toggleContainerSelect(selectionState, containerId, multi)
      renderSelectionOverlays(interactionLayer, diagramIndex, selectionState)
    }

    const allIds = allSelectedIds(selectionState)
    dragState = beginDrag(svg, panZoomLayer, allIds, layoutMap, e.clientX, e.clientY)
    dragMoved = false
    clickedId = containerId
    clickedIsContainer = true
    containerGroup.style.cursor = 'grabbing'
    e.preventDefault()
  } else {
    // Clicked on empty area → start box select
    const world = screenToWorld(svg, panZoomLayer, e.clientX, e.clientY)
    boxSelectState = startBoxSelect(world.x, world.y)
    e.preventDefault()
  }
}

function onPointerMove(e: PointerEvent) {
  const svg = getSvg()
  const panZoomLayer = getPanZoomLayer()
  const interactionLayer = getInteractionLayer()
  if (!svg || !panZoomLayer || !interactionLayer) return

  if (panState.panning) {
    viewport = movePan(panState, e.clientX, e.clientY, viewport)
    applyPanZoom(panZoomLayer, viewport)
  } else if (dragState.dragging) {
    layoutMap = updateDrag(svg, panZoomLayer, dragState, diagramIndex, layoutMap, e.clientX, e.clientY)
    dragMoved = true

    // Update edges for all dragged nodes
    for (const id of dragState.draggedIds) {
      updateEdgesForNode(svg, id, edgeMapData, getTranslate)
    }

    // Update selection overlays to follow dragged elements
    renderSelectionOverlays(interactionLayer, diagramIndex, selectionState)
  } else if (boxSelectState.active) {
    const world = screenToWorld(svg, panZoomLayer, e.clientX, e.clientY)
    boxSelectState = updateBoxSelect(boxSelectState, world.x, world.y)
    renderBoxSelectRect(interactionLayer, boxSelectState)
  } else if (resizeState) {
    const world = screenToWorld(svg, panZoomLayer, e.clientX, e.clientY)
    const result = updateResize(resizeState, layoutMap, world.x, world.y)
    resizeState = result.state
    layoutMap = result.layout
    // Apply container geometry to DOM
    const entry = diagramIndex.containers.get(resizeState.containerId)
    if (entry) {
      const containerLayout = layoutMap.containers[resizeState.containerId]
      if (containerLayout) {
        const rect = entry.el.querySelector('rect')
        if (rect) {
          rect.setAttribute('width', String(containerLayout.width))
          rect.setAttribute('height', String(containerLayout.height))
        }
      }
    }
  }
}

function onPointerUp(e: PointerEvent) {
  const svg = getSvg()
  const panZoomLayer = getPanZoomLayer()
  const interactionLayer = getInteractionLayer()

  if (panState.panning) {
    panState = endPan()
    if (svg) svg.style.cursor = 'default'
    return
  }

  if (resizeState) {
    const containerId = resizeState.containerId
    resizeState = null
    // Update container in layout as manual mode
    if (layoutMap.containers[containerId]) {
      layoutMap = {
        ...layoutMap,
        containers: {
          ...layoutMap.containers,
          [containerId]: { ...layoutMap.containers[containerId]!, mode: 'manual' },
        },
      }
    }
    debouncedPersist()
    return
  }

  if (dragState.dragging) {
    if (!dragMoved && interactionLayer && clickedId) {
      // Was a click, not a drag — if clicking an already-selected element
      // without shift, narrow selection to just that element
      const multi = e.shiftKey || e.metaKey || e.ctrlKey
      if (!multi) {
        if (clickedIsContainer) {
          selectionState = toggleContainerSelect(selectionState, clickedId, false)
        } else {
          selectionState = toggleNodeSelect(selectionState, clickedId, false)
        }
        renderSelectionOverlays(interactionLayer, diagramIndex, selectionState)
      }
    }

    if (dragMoved) {
      // Run edge sync for all affected nodes
      if (svg) {
        for (const id of dragState.draggedIds) {
          updateEdgesForNode(svg, id, edgeMapData, getTranslate)
        }
      }

      // Check reparenting for dragged nodes
      if (svg && panZoomLayer) {
        for (const id of dragState.draggedIds) {
          if (diagramIndex.nodes.has(id)) {
            const entry = diagramIndex.nodes.get(id)!
            let bbox: { x: number; y: number; width: number; height: number }
            try {
              bbox = entry.el.getBBox()
            } catch {
              continue
            }
            const translate = getTranslate(entry.el)
            const center = {
              x: bbox.x + bbox.width / 2 + translate.x,
              y: bbox.y + bbox.height / 2 + translate.y,
            }
            const containerId = hitTestContainer(center, layoutMap, diagramIndex)
            layoutMap = reparentNode(id, containerId, layoutMap)
          }
        }
      }

      // Update fit-mode containers
      for (const [containerId, containerLayout] of Object.entries(layoutMap.containers)) {
        if (containerLayout.mode === 'fit') {
          const fit = computeContainerFit(containerId, layoutMap, diagramIndex)
          if (fit) {
            layoutMap = {
              ...layoutMap,
              containers: {
                ...layoutMap.containers,
                [containerId]: { ...containerLayout, ...fit },
              },
            }
          }
        }
      }

      debouncedPersist()
    }

    // Restore cursors on dragged elements
    for (const id of dragState.draggedIds) {
      const entry = diagramIndex.nodes.get(id) ?? diagramIndex.containers.get(id)
      if (entry) {
        entry.el.style.cursor = 'grab'
      }
    }

    dragState = endDrag()
    dragMoved = false
    clickedId = null
    return
  }

  if (boxSelectState.active && interactionLayer) {
    const boxResult = endBoxSelect(boxSelectState, diagramIndex)
    const multi = e.shiftKey || e.metaKey || e.ctrlKey

    if (multi) {
      selectionState = mergeSelections(selectionState, boxResult)
    } else {
      selectionState = boxResult
    }

    clearBoxSelectRect(interactionLayer)
    renderSelectionOverlays(interactionLayer, diagramIndex, selectionState)
    boxSelectState = resetBoxSelect()
    return
  }

  // Click on empty area → clear selection
  if (svg && interactionLayer) {
    if (!(e.target instanceof Element && (e.target.closest(NODE_SELECTOR) || e.target.closest(CONTAINER_SELECTOR)))) {
      selectionState = clearSelection()
      clearSelectionOverlays(interactionLayer)
    }
  }
}

function onWheel(e: WheelEvent) {
  const svg = getSvg()
  const panZoomLayer = getPanZoomLayer()
  if (!svg || !panZoomLayer) return

  viewport = zoomAtPoint(viewport, svg, e.clientX, e.clientY, e.deltaY)
  applyPanZoom(panZoomLayer, viewport)
}

function onFitToView() {
  const svg = getSvg()
  const panZoomLayer = getPanZoomLayer()
  const diagramContent = getDiagramContent()
  if (!svg || !panZoomLayer || !diagramContent) return

  viewport = fitToView(svg, diagramContent)
  applyPanZoom(panZoomLayer, viewport)
}

// ── Keyboard handlers ───────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
  // Don't intercept keys when user is typing in an input/textarea
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'TEXTAREA' || tag === 'INPUT') return

  if (e.key === ' ' || e.code === 'Space') {
    spaceHeld = true
    const svg = getSvg()
    if (svg) svg.style.cursor = 'grab'
    e.preventDefault()
  }
  if (e.key === 'Escape') {
    const interactionLayer = getInteractionLayer()
    selectionState = clearSelection()
    if (interactionLayer) {
      clearSelectionOverlays(interactionLayer)
    }
    // Cancel any active box select
    if (boxSelectState.active && interactionLayer) {
      clearBoxSelectRect(interactionLayer)
      boxSelectState = resetBoxSelect()
    }
  }
}

function onKeyUp(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'TEXTAREA' || tag === 'INPUT') return

  if (e.key === ' ' || e.code === 'Space') {
    spaceHeld = false
    const svg = getSvg()
    if (svg) svg.style.cursor = 'default'
  }
}

// ── Editor panel resize ─────────────────────────────────────────────────────

const EDITOR_MIN_WIDTH = 180
const EDITOR_MAX_WIDTH = 800

function onGutterPointerDown(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)

  const startX = e.clientX
  const startWidth = editorWidth.value

  function onMove(ev: PointerEvent) {
    const dx = ev.clientX - startX
    editorWidth.value = Math.min(EDITOR_MAX_WIDTH, Math.max(EDITOR_MIN_WIDTH, startWidth + dx))
  }

  function onUp() {
    target.removeEventListener('pointermove', onMove)
    target.removeEventListener('pointerup', onUp)
    target.removeEventListener('lostpointercapture', onUp)
  }

  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('lostpointercapture', onUp)
}

// ── Persistence ─────────────────────────────────────────────────────────────

function debouncedPersist() {
  clearTimeout(persistDebounceTimer)
  persistDebounceTimer = setTimeout(() => {
    saveToLocalStorage(layoutMap)
  }, 500)
}

function onExportLayout() {
  exportLayout(layoutMap)
}

async function onImportLayout(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    layoutMap = await importLayout(file)
    // Reapply to DOM
    applyLayoutToDOM(layoutMap, diagramIndex)

    // Rebuild edge map and sync edges
    const svg = getSvg()
    if (svg) {
      const knownNodeIds = collectNodeIds(svg, NODE_SELECTOR, extractNodeId)
      edgeMapData = buildEdgeMap(svg, knownNodeIds, getTranslate)
      for (const id of diagramIndex.nodes.keys()) {
        updateEdgesForNode(svg, id, edgeMapData, getTranslate)
      }
    }

    // Update selection
    const interactionLayer = getInteractionLayer()
    if (interactionLayer) {
      selectionState = clearSelection()
      clearSelectionOverlays(interactionLayer)
    }
  } catch (err) {
    errorMessage.value = `Failed to import layout: ${err instanceof Error ? err.message : String(err)}`
  }

  // Reset file input so same file can be re-selected
  input.value = ''
}

function onResetLayout() {
  layoutMap = resetLayout()

  // Re-render to get Mermaid default positions
  renderDiagram()
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

watch(mermaidInput, () => {
  clearTimeout(renderDebounceTimer)
  renderDebounceTimer = setTimeout(renderDiagram, 400)
})

onMounted(() => {
  // Try loading layout from localStorage
  const saved = loadFromLocalStorage()
  if (saved) {
    layoutMap = saved
  }

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)

  nextTick(() => renderDiagram())
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  clearTimeout(renderDebounceTimer)
  clearTimeout(persistDebounceTimer)
})
</script>

<template>
  <div class="app-container">
    <div class="scanline" aria-hidden="true"></div>
    <header class="app-header">
      <h1>Flexi<span class="accent">Maid</span></h1>
      <span class="subtitle">paste mermaid &middot; drag to rearrange</span>
      <div class="header-actions">
        <button class="header-btn" @click="onFitToView" title="Fit to view">Fit</button>
        <button class="header-btn" @click="onExportLayout" title="Save layout to file">Save</button>
        <label class="header-btn import-btn" title="Load layout from file">
          Load
          <input type="file" accept=".json" @change="onImportLayout" hidden />
        </label>
        <button class="header-btn" @click="onResetLayout" title="Reset layout to default">Reset</button>
      </div>
    </header>

    <div class="main-layout">
      <aside class="editor-panel" :style="{ width: editorWidth + 'px' }">
        <div class="terminal-header" aria-hidden="true">
          <div class="terminal-dot"></div>
          <div class="terminal-dot"></div>
          <div class="terminal-dot"></div>
        </div>
        <label for="mermaid-input"><span class="prompt">$</span> mermaid input</label>
        <textarea
          id="mermaid-input"
          v-model="mermaidInput"
          spellcheck="false"
          placeholder="graph TD&#10;  A[Service] --> B[DB]"
        />
      </aside>

      <div
        class="resize-gutter"
        @pointerdown.prevent="onGutterPointerDown"
      ></div>

      <section class="diagram-panel">
        <div
          v-if="errorMessage"
          class="error-message"
        >
          {{ errorMessage }}
        </div>
        <div
          ref="svgContainerRef"
          class="svg-container diagram-root"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
          @wheel.prevent="onWheel"
        />
      </section>
    </div>
  </div>
</template>

<style>
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --font-mono: 'JetBrains Mono', 'Courier New', monospace;
  --bg: #0a0a0a;
  --bg-surface: #111111;
  --bg-diagram: #0d0d0d;
  --fg: #e0e0e0;
  --green: #00ff88;
  --dim: #777;
  --border: rgba(255, 255, 255, 0.06);
  --glow: rgba(0, 255, 136, 0.15);
  --error: #ff6b6b;
  --error-bg: rgba(220, 38, 38, 0.1);
  --error-border: rgba(220, 38, 38, 0.2);
}

html,
body,
#app {
  height: 100%;
  font-family: var(--font-mono);
  background: var(--bg);
  color: var(--fg);
}
</style>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
}

.scanline {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(255, 255, 255, 0.015) 2px,
    rgba(255, 255, 255, 0.015) 4px
  );
  z-index: 50;
}

.app-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.app-header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.02em;
}

.app-header h1 .accent {
  color: var(--green);
  text-shadow: 0 0 20px var(--glow);
}

.subtitle {
  font-size: 0.75rem;
  color: var(--dim);
  letter-spacing: 0.05em;
}

.header-actions {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
}

.header-btn {
  padding: 0.25rem 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.02);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, text-shadow 0.15s;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.header-btn:hover {
  background: rgba(0, 255, 136, 0.08);
  border-color: rgba(0, 255, 136, 0.2);
  color: var(--green);
  text-shadow: 0 0 8px var(--glow);
}

.header-btn:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}

.import-btn {
  display: inline-flex;
  align-items: center;
}

.main-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-panel {
  min-width: 180px;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  padding: 0.75rem;
  background: var(--bg-surface);
  flex-shrink: 0;
}

.resize-gutter {
  width: 5px;
  cursor: col-resize;
  background: var(--border);
  transition: background 0.15s;
  flex-shrink: 0;
  position: relative;
}

.resize-gutter::after {
  content: '';
  position: absolute;
  top: 0;
  left: -3px;
  right: -3px;
  bottom: 0;
}

.resize-gutter:hover,
.resize-gutter:active {
  background: var(--green);
  box-shadow: 0 0 8px var(--glow);
}

.terminal-header {
  display: flex;
  gap: 6px;
  margin-bottom: 0.75rem;
}

.terminal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dim);
}

.terminal-dot:nth-child(1) { background: #ff5f57; }
.terminal-dot:nth-child(2) { background: #ffbd2e; }
.terminal-dot:nth-child(3) { background: #28c840; }

.editor-panel label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--dim);
  margin-bottom: 0.5rem;
}

.editor-panel label .prompt {
  color: var(--green);
}

.editor-panel textarea {
  flex: 1;
  resize: none;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.7;
  outline: none;
  caret-color: var(--green);
}

.editor-panel textarea:focus-visible {
  border-color: var(--green);
  box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.3);
}

.diagram-panel {
  flex: 1;
  position: relative;
  background: var(--bg-diagram);
  overflow: hidden;
}

.error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 0.75rem 1rem;
  background: var(--error-bg);
  color: var(--error);
  font-size: 0.8rem;
  border-bottom: 1px solid var(--error-border);
  z-index: 10;
}

.svg-container {
  width: 100%;
  height: 100%;
  cursor: default;
}

.svg-container :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
