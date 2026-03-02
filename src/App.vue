<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { parseMermaid } from './core/parser'
import { computeLayout } from './canvas/layout'
import { renderDiagram } from './canvas/renderer'
import { startDrag, moveDrag, endDrag, IDLE_STATE } from './interaction/drag'
import type { LayoutDiagram } from './core/types'
import type { DragState } from './interaction/drag'

const SAMPLE = `graph TD
  A[Web App] --> B[API Gateway]
  B --> C[Auth Service]
  B --> D[User Service]
  D --> E[Database]
  C --> E`

const mermaidInput = ref(SAMPLE)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const layoutDiagram = ref<LayoutDiagram>({ blocks: [], connections: [] })
let dragState: DragState = { ...IDLE_STATE }
let rafId = 0

function parseAndLayout() {
  const diagram = parseMermaid(mermaidInput.value)
  layoutDiagram.value = computeLayout(diagram)
  redraw()
}

function redraw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const displayWidth = canvas.clientWidth
  const displayHeight = canvas.clientHeight
  const bufferWidth = Math.round(displayWidth * dpr)
  const bufferHeight = Math.round(displayHeight * dpr)

  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth
    canvas.height = bufferHeight
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  renderDiagram(ctx, layoutDiagram.value, displayWidth, displayHeight)
}

function scheduleRedraw() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    redraw()
  })
}

function onMouseDown(e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  dragState = startDrag(layoutDiagram.value, x, y)

  if (dragState.dragging && canvasRef.value) {
    canvasRef.value.style.cursor = 'grabbing'
  }
}

function onMouseMove(e: MouseEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  if (dragState.dragging) {
    layoutDiagram.value = moveDrag(layoutDiagram.value, dragState, x, y)
    scheduleRedraw()
  }
}

function onMouseUp() {
  dragState = endDrag(dragState)
  if (canvasRef.value) {
    canvasRef.value.style.cursor = 'default'
  }
}

function handleResize() {
  scheduleRedraw()
}

watch(mermaidInput, () => {
  parseAndLayout()
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
  nextTick(() => parseAndLayout())
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>FlexiMaid</h1>
      <span class="subtitle">Paste Mermaid &middot; Drag blocks to rearrange</span>
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

      <section class="canvas-panel">
        <canvas
          ref="canvasRef"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
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

.canvas-panel {
  flex: 1;
  position: relative;
  background: #f8fafc;
}

.canvas-panel canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: default;
}
</style>
