import type { ArrowType, Block, BlockType, Connection, Diagram } from './types'

const ARROW_PATTERN = /^(.+?)\s*(-->|<--|--|\.\.>|<\.\.|\.\.)\s*(.+?)(?:\s*:\s*(.+))?$/

const COMPONENT_PATTERN = /^\[("?)(.+?)\1\]$/

const KEYWORD_BLOCK_PATTERN = /^(class|actor|usecase|package)\s+(?:"([^"]+)"\s+as\s+)?(\S+)$/

const SKIP_PATTERNS = [/^\s*$/, /^\s*'/, /^\s*@startuml\s*$/, /^\s*@enduml\s*$/]

export function parsePlantUml(input: string): Diagram {
  const blockMap = new Map<string, Block>()
  const connections: Connection[] = []

  const lines = input.split('\n').map((l) => l.trim())

  for (const line of lines) {
    if (shouldSkipLine(line)) continue

    const arrowMatch = tryParseConnection(line)
    if (arrowMatch) {
      const { from, to, arrowType, label } = arrowMatch
      ensureBlock(blockMap, from)
      ensureBlock(blockMap, to)
      const conn: Connection = {
        fromId: from.id,
        toId: to.id,
        arrowType,
      }
      if (label) conn.label = label
      connections.push(conn)
      continue
    }

    const block = tryParseSingleBlock(line)
    if (block) {
      ensureBlock(blockMap, block)
      continue
    }

    // Malformed line - skip silently
  }

  return {
    blocks: Array.from(blockMap.values()),
    connections,
  }
}

function shouldSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(line))
}

interface ParsedBlockRef {
  id: string
  label: string
  type: BlockType
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
  // Try component syntax: [Name] or ["Name"]
  const compMatch = token.match(COMPONENT_PATTERN)
  if (compMatch) {
    const label = compMatch[2] ?? token
    return { id: label, label, type: 'component' }
  }

  // Try keyword syntax: class Foo, actor User, etc.
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

  // Keyword block: class Foo, actor User, usecase "Login" as UC1
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
