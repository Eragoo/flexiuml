<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { renderMermaidSvg, NODE_SELECTOR, extractNodeId } from './core/mermaid-config'
import type { DragState, ViewportState, PanState, SelectionState } from './core/types'
import { IDLE_DRAG, DEFAULT_VIEWPORT, IDLE_PAN } from './core/types'
import { findNodeGroup, startDrag, moveDrag, endDrag, getTranslate } from './interaction/svg-drag'
import { applyViewport, startPan, movePan, endPan, zoomAtPoint, fitToView } from './interaction/svg-pan-zoom'
import { toggleSelect, clearSelection, applySelectionStyles } from './interaction/svg-select'
import { buildEdgeMap, collectNodeIds, updateEdgesForNode } from './interaction/svg-edges'
import type { EdgeMap } from './interaction/svg-edges'

const SAMPLE = `graph TD
  A[Web App] --> B[API Gateway]
  B --> C[Auth Service]
  B --> D[User Service]
  D --> E[Database]
  C --> E`

const mermaidInput = ref(SAMPLE)
const svgContainerRef = ref<HTMLDivElement | null>(null)
const errorMessage = ref<string | null>(null)
let renderCounter = 0
let renderDebounceTimer: ReturnType<typeof setTimeout> | undefined

// Interaction state
let dragState: DragState = { ...IDLE_DRAG }
let viewport: ViewportState = { ...DEFAULT_VIEWPORT }
let panState: PanState = { ...IDLE_PAN }
let selectionState: SelectionState = { selectedIds: new Set() }

// Track whether a drag actually moved (to distinguish click from drag)
let dragMoved = false

// Edge map: rebuilt after each render to track which edges connect to each node
let edgeMap: EdgeMap = new Map()

function getSvgElement(): SVGSVGElement | null {
  return svgContainerRef.value?.querySelector('svg') ?? null
}

async function renderDiagram() {
  const container = svgContainerRef.value
  if (!container) return

  renderCounter++
  const thisRender = renderCounter
  const id = `mermaid-svg-${thisRender}`

  try {
    errorMessage.value = null
    const svgMarkup = await renderMermaidSvg(mermaidInput.value, id)

    // Discard stale render results (user typed while we were rendering)
    if (thisRender !== renderCounter) return

    container.innerHTML = svgMarkup

    const svg = getSvgElement()
    if (svg) {
      // Make SVG fill the container
      svg.style.width = '100%'
      svg.style.height = '100%'
      svg.removeAttribute('height')
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

      // Reset viewport and fit content
      await nextTick()
      viewport = fitToView(svg)
      applyViewport(svg, viewport)

      // Reset selection
      selectionState = clearSelection()

      // Make node groups interactive
      setupNodeInteractivity(svg)

      // Build edge map so dragging a node also moves its connected edges
      const knownNodeIds = collectNodeIds(svg, NODE_SELECTOR, extractNodeId)
      edgeMap = buildEdgeMap(svg, knownNodeIds)
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    container.innerHTML = ''
  }
}

/**
 * Add pointer cursor and data attributes to Mermaid node groups.
 */
function setupNodeInteractivity(svg: SVGSVGElement): void {
  const nodes = svg.querySelectorAll(NODE_SELECTOR)
  for (const node of nodes) {
    if (!(node instanceof SVGGElement)) continue
    node.style.cursor = 'grab'

    // Ensure each node has a data-id for easy lookup
    const nodeId = extractNodeId(node)
    if (nodeId && !node.getAttribute('data-id')) {
      node.setAttribute('data-id', nodeId)
    }
  }
}

// ── Mouse event handlers ────────────────────────────────────────────────────

function onMouseDown(e: MouseEvent) {
  const svg = getSvgElement()
  if (!svg) return

  const nodeGroup = findNodeGroup(e.target, NODE_SELECTOR)

  if (nodeGroup) {
    // Start dragging a node
    const nodeId = extractNodeId(nodeGroup)
    if (!nodeId) return

    dragState = startDrag(svg, nodeGroup, nodeId, e.clientX, e.clientY)
    dragMoved = false
    nodeGroup.style.cursor = 'grabbing'
    e.preventDefault()
  } else {
    // Start panning (click on empty SVG area)
    panState = startPan(e.clientX, e.clientY, viewport)
    svg.style.cursor = 'grabbing'
    e.preventDefault()
  }
}

function onMouseMove(e: MouseEvent) {
  const svg = getSvgElement()
  if (!svg) return

  if (dragState.dragging && dragState.nodeId) {
    const nodeEl = svg.querySelector(`[data-id="${CSS.escape(dragState.nodeId)}"]`)
    if (nodeEl instanceof SVGGElement) {
      moveDrag(svg, dragState, nodeEl, e.clientX, e.clientY)
      dragMoved = true

      // Update edges connected to the dragged node
      updateEdgesForNode(svg, dragState.nodeId, edgeMap, getTranslate)
    }
  } else if (panState.panning) {
    viewport = movePan(panState, e.clientX, e.clientY, viewport)
    applyViewport(svg, viewport)
  }
}

function onMouseUp(e: MouseEvent) {
  const svg = getSvgElement()

  if (dragState.dragging && dragState.nodeId) {
    // If it was a click (no movement), treat as selection
    if (!dragMoved) {
      selectionState = toggleSelect(selectionState, dragState.nodeId, e.shiftKey || e.metaKey || e.ctrlKey)
      if (svg) {
        applySelectionStyles(svg, selectionState, NODE_SELECTOR)
      }
    }

    // Restore cursor on the node
    if (svg) {
      const nodeEl = svg.querySelector(`[data-id="${CSS.escape(dragState.nodeId)}"]`)
      if (nodeEl instanceof SVGGElement) {
        nodeEl.style.cursor = 'grab'
      }
    }

    dragState = endDrag()
    dragMoved = false
  } else if (panState.panning) {
    panState = endPan()
    if (svg) {
      svg.style.cursor = 'default'
    }
  } else {
    // Click on empty area without panning -> clear selection
    if (svg && !(e.target instanceof Element && e.target.closest(NODE_SELECTOR))) {
      selectionState = clearSelection()
      applySelectionStyles(svg, selectionState, NODE_SELECTOR)
    }
  }
}

function onWheel(e: WheelEvent) {
  const svg = getSvgElement()
  if (!svg) return

  viewport = zoomAtPoint(viewport, svg, e.clientX, e.clientY, e.deltaY)
  applyViewport(svg, viewport)
}

function onFitToView() {
  const svg = getSvgElement()
  if (!svg) return

  viewport = fitToView(svg)
  applyViewport(svg, viewport)
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

watch(mermaidInput, () => {
  clearTimeout(renderDebounceTimer)
  renderDebounceTimer = setTimeout(renderDiagram, 400)
})

onMounted(() => {
  nextTick(() => renderDiagram())
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>FlexiMaid</h1>
      <span class="subtitle">Paste Mermaid &middot; Drag nodes to rearrange</span>
      <button class="fit-btn" @click="onFitToView" title="Fit to view">Fit</button>
    </header>

    <div class="main-layout">
      <aside class="editor-panel">
        <label for="mermaid-input">Mermaid Input</label>
        <textarea
          id="mermaid-input"
          v-model="mermaidInput"
          spellcheck="false"
          placeholder="graph TD&#10;  A[Service] --> B[DB]"
        />
      </aside>

      <section class="diagram-panel">
        <div
          v-if="errorMessage"
          class="error-message"
        >
          {{ errorMessage }}
        </div>
        <div
          ref="svgContainerRef"
          class="svg-container"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
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

html,
body,
#app {
  height: 100%;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
}

/* Selection highlight style (injected globally so Mermaid SVG can use it) */
.fleximaid-selected > rect,
.fleximaid-selected > circle,
.fleximaid-selected > polygon,
.fleximaid-selected > ellipse,
.fleximaid-selected > path {
  stroke: #3b82f6 !important;
  stroke-width: 3 !important;
}
</style>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

.app-header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #38bdf8;
}

.subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
}

.fit-btn {
  margin-left: auto;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  background: #334155;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.fit-btn:hover {
  background: #475569;
}

.main-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-panel {
  width: 320px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  padding: 0.75rem;
  background: #1e293b;
  border-right: 1px solid #334155;
}

.editor-panel label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 0.5rem;
}

.editor-panel textarea {
  flex: 1;
  resize: none;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.75rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  outline: none;
}

.editor-panel textarea:focus {
  border-color: #38bdf8;
}

.diagram-panel {
  flex: 1;
  position: relative;
  background: #f8fafc;
  overflow: hidden;
}

.error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.85rem;
  border-bottom: 1px solid #fecaca;
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
