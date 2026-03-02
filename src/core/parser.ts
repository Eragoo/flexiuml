import type { ArrowType, Block, BlockType, Connection, Diagram } from './types'

// ── Arrow token used to split lines ──────────────────────────────────────────
// Order matters: longer tokens first to avoid partial matches
const ARROW_TOKENS = [
  '<|--', '--|>', '<|..', '..|>',
  '===>', '==>', '<===', '<==', '<==>',
  '--->', '-->', '<---', '<--',
  '-.->', '<-.-', '-.-',
  '..>', '<..',  '..',
  '*--', '--*', 'o--', '--o',
  '--',
] as const

// Flowchart labeled arrow: A -->|text| B  or  A --> |text| B
const FLOWCHART_PIPE_LABEL = /^(.+?)\s+(-->|---?>|==>|===?>|-\.->?)\s*\|([^|]*)\|\s+(.+)$/

// Flowchart text arrow: A -- text --> B
const FLOWCHART_TEXT_ARROW = /^(.+?)\s+--\s+(.+?)\s+(-->)\s+(.+)$/

// ── Block shape patterns (flowchart) ─────────────────────────────────────────
// A[Label], A(Label), A{Label}, A((Label)), A([Label]), A[[Label]], A>Label], A{{Label}}
const FLOWCHART_NODE_SHAPE =
  /^([A-Za-z_][\w-]*)(\(\[|\[\[|\({1,2}|\[{1,2}|>|\{\{?)([^}\]>)]+?)(\]\)|\]\]|\){1,2}|\]{1,2}|\]|\}\}?)$/

// ── State diagram patterns ───────────────────────────────────────────────────
const STATE_OPEN_PATTERN = /^state\s+(?:"([^"]+)"\s+as\s+)?(\S+)\s*\{$/
const PSEUDO_STATE_TOKEN = '[*]'

// ── Class diagram patterns ───────────────────────────────────────────────────
const CLASS_DECL_PATTERN = /^class\s+(\S+)\s*(?:\{|$)/

// ── Diagram type constants ───────────────────────────────────────────────────
const DIAGRAM_HEADER_PATTERNS: Array<{ pattern: RegExp; type: DiagramType }> = [
  { pattern: /^graph\s+(TD|TB|BT|RL|LR)$/i, type: 'flowchart' },
  { pattern: /^flowchart\s+(TD|TB|BT|RL|LR)$/i, type: 'flowchart' },
  { pattern: /^stateDiagram(?:-v2)?$/i, type: 'state' },
  { pattern: /^classDiagram$/i, type: 'class' },
]

type DiagramType = 'flowchart' | 'state' | 'class' | 'unknown'

// ── Skip patterns ────────────────────────────────────────────────────────────
const SKIP_PATTERNS = [/^\s*$/, /^\s*%%/]

// ── Internal types ───────────────────────────────────────────────────────────
interface ParsedBlockRef {
  id: string
  label: string
  type: BlockType
}

interface ParseScope {
  blockMap: Map<string, Block>
  connections: Connection[]
  pseudoCounter: { start: number; end: number }
  diagramType: DiagramType
}

// ── Public API ───────────────────────────────────────────────────────────────

export function parseMermaid(input: string): Diagram {
  const lines = input.split('\n').map((l) => l.trim())
  const diagramType = detectDiagramType(lines)

  const scope: ParseScope = {
    blockMap: new Map(),
    connections: [],
    pseudoCounter: { start: 0, end: 0 },
    diagramType,
  }

  // Skip the header line(s)
  const startIdx = diagramType !== 'unknown' ? 1 : 0
  parseLines(lines, startIdx, scope)

  return {
    blocks: Array.from(scope.blockMap.values()),
    connections: scope.connections,
  }
}

// ── Diagram type detection ───────────────────────────────────────────────────

function detectDiagramType(lines: string[]): DiagramType {
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('%%')) continue
    for (const { pattern, type } of DIAGRAM_HEADER_PATTERNS) {
      if (pattern.test(trimmed)) return type
    }
    break // first non-empty, non-comment line determines type
  }
  return 'unknown'
}

// ── Line-by-line parsing ─────────────────────────────────────────────────────

function parseLines(lines: string[], startIdx: number, scope: ParseScope): number {
  let i = startIdx
  while (i < lines.length) {
    const line = lines[i]!
    if (shouldSkipLine(line)) {
      i++
      continue
    }

    // Closing brace ends current scope
    if (line === '}' || line === 'end') {
      return i + 1
    }

    // Composite state: state Foo { or state "Long Name" as Foo {
    if (scope.diagramType === 'state' || scope.diagramType === 'unknown') {
      const stateOpen = line.match(STATE_OPEN_PATTERN)
      if (stateOpen) {
        const stateLabel = stateOpen[1] ?? stateOpen[2]!
        const stateId = stateOpen[2]!
        const childScope: ParseScope = {
          blockMap: new Map(),
          connections: [],
          pseudoCounter: scope.pseudoCounter,
          diagramType: scope.diagramType,
        }

        i = parseLines(lines, i + 1, childScope)

        const compositeBlock: Block = {
          id: stateId,
          label: stateLabel,
          type: 'state',
          children: Array.from(childScope.blockMap.values()),
          childConnections: childScope.connections,
        }
        scope.blockMap.set(stateId, compositeBlock)
        continue
      }
    }

    // Class declaration: class Foo { (skip body, just register block)
    if (scope.diagramType === 'class') {
      const classDecl = line.match(CLASS_DECL_PATTERN)
      if (classDecl) {
        const id = classDecl[1]!
        ensureBlock(scope.blockMap, { id, label: id, type: 'class' })
        if (line.endsWith('{')) {
          // Skip until closing brace
          i++
          while (i < lines.length && lines[i]!.trim() !== '}') i++
          if (i < lines.length) i++ // skip the '}'
        } else {
          i++
        }
        continue
      }
    }

    // Arrow / connection (try all patterns)
    const arrowMatch = tryParseConnection(line, scope)
    if (arrowMatch) {
      const { from, to, arrowType, label } = arrowMatch
      const resolvedFrom = resolvePseudo(from, 'from', scope)
      const resolvedTo = resolvePseudo(to, 'to', scope)
      ensureBlock(scope.blockMap, resolvedFrom)
      ensureBlock(scope.blockMap, resolvedTo)
      const conn: Connection = {
        fromId: resolvedFrom.id,
        toId: resolvedTo.id,
        arrowType,
      }
      if (label) conn.label = label
      scope.connections.push(conn)
      i++
      continue
    }

    // Standalone node definition (flowchart): A[Label]
    if (scope.diagramType === 'flowchart' || scope.diagramType === 'unknown') {
      const node = tryParseFlowchartNode(line)
      if (node) {
        ensureBlock(scope.blockMap, node)
        i++
        continue
      }
    }

    // Malformed line - skip silently
    i++
  }
  return i
}

function shouldSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(line))
}

// ── Pseudo-state resolution (state diagrams) ────────────────────────────────

function resolvePseudo(
  ref: ParsedBlockRef,
  role: 'from' | 'to',
  scope: ParseScope,
): ParsedBlockRef {
  if (ref.id !== '*') return ref

  if (role === 'from') {
    scope.pseudoCounter.start++
    const id = `__start_${scope.pseudoCounter.start}`
    return { id, label: '[*]', type: 'pseudostate' }
  } else {
    scope.pseudoCounter.end++
    const id = `__end_${scope.pseudoCounter.end}`
    return { id, label: '[*]', type: 'pseudostate' }
  }
}

// ── Connection parsing ───────────────────────────────────────────────────────

function tryParseConnection(
  line: string,
  scope: ParseScope,
): { from: ParsedBlockRef; to: ParsedBlockRef; arrowType: ArrowType; label?: string } | null {
  // Try flowchart pipe-labeled arrow: A -->|text| B
  const flowLabelMatch = line.match(FLOWCHART_PIPE_LABEL)
  if (flowLabelMatch) {
    const rawFrom = flowLabelMatch[1]!
    const arrow = flowLabelMatch[2]!
    const label = flowLabelMatch[3]
    const rawTo = flowLabelMatch[4]!
    const from = parseBlockRef(rawFrom.trim(), scope)
    const to = parseBlockRef(rawTo.trim(), scope)
    if (from && to) {
      return { from, to, arrowType: normalizeArrow(arrow), label: label?.trim() || undefined }
    }
  }

  // Try flowchart text arrow: A -- text --> B
  const flowTextMatch = line.match(FLOWCHART_TEXT_ARROW)
  if (flowTextMatch) {
    const rawFrom = flowTextMatch[1]!
    const label = flowTextMatch[2]
    const arrow = flowTextMatch[3]!
    const rawTo = flowTextMatch[4]!
    const from = parseBlockRef(rawFrom.trim(), scope)
    const to = parseBlockRef(rawTo.trim(), scope)
    if (from && to) {
      return { from, to, arrowType: normalizeArrow(arrow), label: label?.trim() || undefined }
    }
  }

  // Try splitting by arrow token
  const split = splitByArrowToken(line)
  if (!split) return null

  const { rawFrom, arrow, rest } = split
  // rest may contain ": label" suffix
  let rawTo = rest
  let label: string | undefined
  const colonIdx = rest.indexOf(' : ')
  if (colonIdx !== -1) {
    rawTo = rest.slice(0, colonIdx)
    label = rest.slice(colonIdx + 3).trim()
  }

  const from = parseBlockRef(rawFrom.trim(), scope)
  const to = parseBlockRef(rawTo.trim(), scope)
  if (!from || !to) return null

  return {
    from,
    to,
    arrowType: normalizeArrow(arrow),
    label: label || undefined,
  }
}

/**
 * Split a line by the first matching arrow token.
 * Returns the raw left side, the arrow, and the raw right side.
 */
function splitByArrowToken(
  line: string,
): { rawFrom: string; arrow: string; rest: string } | null {
  for (const token of ARROW_TOKENS) {
    // Require whitespace or start/end around the arrow to avoid matching inside words
    const idx = line.indexOf(` ${token} `)
    if (idx !== -1) {
      return {
        rawFrom: line.slice(0, idx),
        arrow: token,
        rest: line.slice(idx + token.length + 2),
      }
    }
  }
  return null
}

/**
 * Normalize Mermaid arrow syntax to our ArrowType union.
 */
function normalizeArrow(arrow: string): ArrowType {
  // Directed forward arrows (solid, dotted variants)
  if (/^-+->$/.test(arrow) || arrow === '-.->' || arrow === '-.->') return '-->'
  // Directed backward arrows
  if (/^<-+$/.test(arrow) || arrow === '<-.-') return '<--'
  // Thick arrows (treat as directed)
  if (/^=+>$/.test(arrow)) return '-->'
  if (/^<=+$/.test(arrow)) return '<--'
  if (arrow === '<==>') return '--'
  // Dotted arrows
  if (arrow === '..>' || arrow === '..|>') return '..>'
  if (arrow === '<..' || arrow === '<|..') return '<..'
  if (arrow === '..' || arrow === '-.-') return '..'
  // Class diagram arrows
  if (arrow === '<|--') return '<--'
  if (arrow === '--|>') return '-->'
  if (arrow === '*--' || arrow === '--*') return '--'
  if (arrow === 'o--' || arrow === '--o') return '--'
  // Plain lines
  if (arrow === '--') return '--'
  return '-->'
}

// ── Block reference parsing ──────────────────────────────────────────────────

function parseBlockRef(token: string, scope: ParseScope): ParsedBlockRef | null {
  // Pseudo-state [*]
  if (token === PSEUDO_STATE_TOKEN) {
    return { id: '*', label: '[*]', type: 'pseudostate' }
  }

  // Flowchart node with shape: A[Label], A(Label), A{Label}, A((Label)), etc.
  const nodeMatch = token.match(FLOWCHART_NODE_SHAPE)
  if (nodeMatch) {
    const id = nodeMatch[1]!
    const label = nodeMatch[3] ?? id
    const type = shapeToBlockType(nodeMatch[2] ?? '[', scope)
    return { id, label, type }
  }

  // Plain identifier (supports hyphens, e.g. my-node)
  if (/^[\w][\w-]*$/.test(token)) {
    const defaultType = defaultBlockType(scope)
    return { id: token, label: token, type: defaultType }
  }

  return null
}

function tryParseFlowchartNode(line: string): ParsedBlockRef | null {
  const match = line.match(FLOWCHART_NODE_SHAPE)
  if (!match) return null
  const id = match[1]!
  const label = match[3] ?? id
  const openBracket = match[2] ?? '['
  const type = shapeToBlockTypeFlowchart(openBracket)
  return { id, label, type }
}

/**
 * Map flowchart shape brackets to our BlockType (no diagram context).
 */
function shapeToBlockTypeFlowchart(openBracket: string): BlockType {
  if (openBracket === '(' || openBracket === '((' || openBracket === '([') return 'usecase'
  if (openBracket === '{' || openBracket === '{{') return 'package'
  return 'component'
}

/**
 * Map flowchart shape brackets to our BlockType, considering diagram context.
 */
function shapeToBlockType(openBracket: string, scope: ParseScope): BlockType {
  if (scope.diagramType === 'class') return 'class'
  if (scope.diagramType === 'state') return 'state'
  return shapeToBlockTypeFlowchart(openBracket)
}

/**
 * Default block type when only a plain ID is used (no shape brackets).
 */
function defaultBlockType(scope: ParseScope): BlockType {
  switch (scope.diagramType) {
    case 'class':
      return 'class'
    case 'state':
      return 'state'
    default:
      return 'component'
  }
}

function ensureBlock(map: Map<string, Block>, ref: ParsedBlockRef): void {
  const existing = map.get(ref.id)
  if (!existing) {
    map.set(ref.id, { id: ref.id, label: ref.label, type: ref.type })
  } else if (ref.type !== 'component' && existing.type === 'component') {
    // Upgrade from default 'component' to an explicitly declared type
    map.set(ref.id, { ...existing, type: ref.type, label: ref.label })
  } else if (ref.label !== ref.id && existing.label === existing.id) {
    // Upgrade label when a shaped ref provides a real label (e.g. A[Web App])
    map.set(ref.id, { ...existing, label: ref.label })
  }
}
