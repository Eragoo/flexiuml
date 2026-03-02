import type { ArrowType, Block, BlockType, Connection, Diagram } from './types'

const ARROW_PATTERN = /^(.+?)\s*(-->|<--|--|\.\.>|<\.\.|\.\.)\s*(.+?)(?:\s*:\s*(.+))?$/

const COMPONENT_PATTERN = /^\[("?)(.+?)\1\]$/

const KEYWORD_BLOCK_PATTERN =
  /^(class|actor|usecase|package|state)\s+(?:"([^"]+)"\s+as\s+)?(\S+)$/

const SKIP_PATTERNS = [/^\s*$/, /^\s*'/, /^\s*@startuml\s*$/, /^\s*@enduml\s*$/]

const PSEUDO_STATE_TOKEN = '[*]'

const STATE_OPEN_PATTERN = /^state\s+(\S+)\s*\{$/

interface ParsedBlockRef {
  id: string
  label: string
  type: BlockType
}

interface ParseScope {
  blockMap: Map<string, Block>
  connections: Connection[]
  pseudoCounter: { start: number; end: number }
}

export function parsePlantUml(input: string): Diagram {
  const lines = input.split('\n').map((l) => l.trim())
  const scope: ParseScope = {
    blockMap: new Map(),
    connections: [],
    pseudoCounter: { start: 0, end: 0 },
  }

  parseLines(lines, 0, scope)

  return {
    blocks: Array.from(scope.blockMap.values()),
    connections: scope.connections,
  }
}

/**
 * Parse lines starting at `startIdx` into the given scope.
 * Returns the index of the first line NOT consumed (i.e. after a closing `}`).
 */
function parseLines(lines: string[], startIdx: number, scope: ParseScope): number {
  let i = startIdx
  while (i < lines.length) {
    const line = lines[i]!
    if (shouldSkipLine(line)) {
      i++
      continue
    }

    // Closing brace ends current scope (handled by caller for composite states)
    if (line === '}') {
      return i + 1
    }

    // Composite state: state Foo {
    const stateOpen = line.match(STATE_OPEN_PATTERN)
    if (stateOpen) {
      const stateId = stateOpen[1]!
      const childScope: ParseScope = {
        blockMap: new Map(),
        connections: [],
        pseudoCounter: scope.pseudoCounter, // share counter for globally unique IDs
      }

      i = parseLines(lines, i + 1, childScope)

      const compositeBlock: Block = {
        id: stateId,
        label: stateId,
        type: 'state',
        children: Array.from(childScope.blockMap.values()),
        childConnections: childScope.connections,
      }
      scope.blockMap.set(stateId, compositeBlock)
      continue
    }

    // Arrow / connection
    const arrowMatch = tryParseConnection(line)
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

    // Standalone block declaration
    const block = tryParseSingleBlock(line)
    if (block) {
      ensureBlock(scope.blockMap, block)
      i++
      continue
    }

    // Malformed line - skip silently
    i++
  }
  return i
}

function shouldSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(line))
}

/**
 * Resolve a [*] pseudo-state reference into a unique start or end pseudo-state.
 * `role` indicates whether this token appeared as the source ('from') or target ('to') of a connection.
 */
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

function tryParseConnection(
  line: string,
): { from: ParsedBlockRef; to: ParsedBlockRef; arrowType: ArrowType; label?: string } | null {
  const match = line.match(ARROW_PATTERN)
  if (!match) return null

  const rawFrom = match[1]
  const arrow = match[2]
  const rawTo = match[3]
  const label = match[4]
  if (!rawFrom || !arrow || !rawTo) return null

  const from = parseBlockRef(rawFrom.trim())
  const to = parseBlockRef(rawTo.trim())
  if (!from || !to) return null

  return {
    from,
    to,
    arrowType: arrow as ArrowType,
    label: label?.trim(),
  }
}

function parseBlockRef(token: string): ParsedBlockRef | null {
  // Pseudo-state [*]
  if (token === PSEUDO_STATE_TOKEN) {
    return { id: '*', label: '[*]', type: 'pseudostate' }
  }

  // Try component syntax: [Name] or ["Name"]
  const compMatch = token.match(COMPONENT_PATTERN)
  if (compMatch) {
    const label = compMatch[2] ?? token
    return { id: label, label, type: 'component' }
  }

  // Try keyword syntax: class Foo, actor User, state X, etc.
  const kwMatch = token.match(KEYWORD_BLOCK_PATTERN)
  if (kwMatch) {
    const type = (kwMatch[1] ?? 'component') as BlockType
    const label = kwMatch[2] ?? kwMatch[3] ?? token
    const id = kwMatch[3] ?? token
    return { id, label, type }
  }

  // Plain identifier (used inside connections referencing already-known keyword blocks)
  if (/^\w+$/.test(token)) {
    return { id: token, label: token, type: 'component' }
  }

  return null
}

function tryParseSingleBlock(line: string): ParsedBlockRef | null {
  // Standalone component: [Foo]
  const compMatch = line.match(COMPONENT_PATTERN)
  if (compMatch) {
    const label = compMatch[2] ?? line
    return { id: label, label, type: 'component' }
  }

  // Keyword block: class Foo, actor User, state X, usecase "Login" as UC1
  const kwMatch = line.match(KEYWORD_BLOCK_PATTERN)
  if (kwMatch) {
    const type = (kwMatch[1] ?? 'component') as BlockType
    const label = kwMatch[2] ?? kwMatch[3] ?? line
    const id = kwMatch[3] ?? line
    return { id, label, type }
  }

  return null
}

function ensureBlock(map: Map<string, Block>, ref: ParsedBlockRef): void {
  const existing = map.get(ref.id)
  if (!existing) {
    map.set(ref.id, { id: ref.id, label: ref.label, type: ref.type })
  } else if (ref.type !== 'component' && existing.type === 'component') {
    // Upgrade from default 'component' to an explicitly declared type
    map.set(ref.id, { ...existing, type: ref.type, label: ref.label })
  }
}
