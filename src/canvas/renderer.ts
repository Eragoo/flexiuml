import type { Connection, LayoutBlock, LayoutDiagram } from '../core/types'

const BLOCK_FILL = '#e2e8f0'
const BLOCK_STROKE = '#475569'
const BLOCK_TEXT_COLOR = '#1e293b'
const ARROW_COLOR = '#475569'
const LABEL_COLOR = '#64748b'
const ARROWHEAD_SIZE = 10
const FONT = '14px sans-serif'
const LABEL_FONT = '12px sans-serif'

export function renderDiagram(
  ctx: CanvasRenderingContext2D,
  diagram: LayoutDiagram,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // Build a lookup map for O(1) block access by id
  const blockMap = new Map<string, LayoutBlock>()
  for (const block of diagram.blocks) {
    blockMap.set(block.id, block)
  }

  // Draw connections first (behind blocks)
  for (const conn of diagram.connections) {
    const from = blockMap.get(conn.fromId)
    const to = blockMap.get(conn.toId)
    if (!from || !to) continue

    drawConnection(ctx, from, to, conn)
  }

  // Draw blocks on top
  for (const block of diagram.blocks) {
    drawBlock(ctx, block)
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, block: LayoutBlock): void {
  // Fill
  ctx.fillStyle = BLOCK_FILL
  ctx.fillRect(block.x, block.y, block.width, block.height)

  // Stroke
  ctx.strokeStyle = BLOCK_STROKE
  ctx.lineWidth = 1
  ctx.strokeRect(block.x, block.y, block.width, block.height)

  // Label
  ctx.fillStyle = BLOCK_TEXT_COLOR
  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(block.label, block.x + block.width / 2, block.y + block.height / 2)
}

function drawConnection(
  ctx: CanvasRenderingContext2D,
  from: LayoutBlock,
  to: LayoutBlock,
  conn: Connection,
): void {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }

  // Compute edge intersection points
  const startPt = getEdgePoint(from, toCenter)
  const endPt = getEdgePoint(to, fromCenter)

  const isDashed = conn.arrowType === '..' || conn.arrowType === '..>' || conn.arrowType === '<..'

  ctx.beginPath()
  ctx.strokeStyle = ARROW_COLOR
  ctx.lineWidth = 1.5
  ctx.setLineDash(isDashed ? [6, 4] : [])
  ctx.moveTo(startPt.x, startPt.y)
  ctx.lineTo(endPt.x, endPt.y)
  ctx.stroke()
  ctx.setLineDash([])

  // Draw arrowhead if directional
  const hasForwardHead = conn.arrowType === '-->' || conn.arrowType === '..>'
  const hasBackwardHead = conn.arrowType === '<--' || conn.arrowType === '<..'

  if (hasForwardHead) {
    drawArrowhead(ctx, startPt, endPt)
  }
  if (hasBackwardHead) {
    drawArrowhead(ctx, endPt, startPt)
  }

  // Draw connection label if present
  if (conn.label) {
    const midX = (startPt.x + endPt.x) / 2
    const midY = (startPt.y + endPt.y) / 2
    ctx.fillStyle = LABEL_COLOR
    ctx.font = LABEL_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(conn.label, midX, midY - 4)
  }
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)

  ctx.save()
  ctx.translate(to.x, to.y)
  ctx.rotate(angle)

  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-ARROWHEAD_SIZE, -ARROWHEAD_SIZE / 2)
  ctx.lineTo(-ARROWHEAD_SIZE, ARROWHEAD_SIZE / 2)
  ctx.closePath()

  ctx.fillStyle = ARROW_COLOR
  ctx.fill()
  ctx.restore()
}

function getEdgePoint(
  block: LayoutBlock,
  target: { x: number; y: number },
): { x: number; y: number } {
  const cx = block.x + block.width / 2
  const cy = block.y + block.height / 2
  const hw = block.width / 2
  const hh = block.height / 2

  const dx = target.x - cx
  const dy = target.y - cy

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  // Determine which edge the line from center to target intersects
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (absDx * hh > absDy * hw) {
    // Intersects left or right edge
    const sign = dx > 0 ? 1 : -1
    return { x: cx + sign * hw, y: cy + (dy * hw) / absDx }
  } else {
    // Intersects top or bottom edge
    const sign = dy > 0 ? 1 : -1
    return { x: cx + (dx * hh) / absDy, y: cy + sign * hh }
  }
}
