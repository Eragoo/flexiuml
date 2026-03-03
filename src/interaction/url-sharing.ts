import type { LayoutMap, NodeLayoutEntry, ContainerLayoutEntry } from '../core/layout-map'
import { validateLayout } from '../core/layout-map'

export interface SharedLayout {
  layout: LayoutMap
  mermaidText: string
}

const HASH_PARAM = 'layout'
const BINARY_VERSION = 0x02

// ── Compression helpers (deflate-raw via Web Streams API) ───────────────────

async function compress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()

  let writeError: unknown = null
  const writePromise = writer.write(data as unknown as BufferSource)
    .then(() => writer.close())
    .catch((e: unknown) => { writeError = e })

  const result = new Uint8Array(await new Response(cs.readable).arrayBuffer())
  await writePromise
  if (writeError) throw writeError
  return result
}

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()

  let writeError: unknown = null
  const writePromise = writer.write(data as unknown as BufferSource)
    .then(() => writer.close())
    .catch((e: unknown) => { writeError = e })

  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value as Uint8Array)
    }
  } finally {
    await writePromise
  }

  if (writeError) throw writeError

  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

// ── Base64url helpers (URL-safe, no padding) ────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)))
  }
  return btoa(parts.join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64Url(str: string): Uint8Array {
  // Restore standard base64 characters and padding
  const base64 = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ── Binary encoding helpers ─────────────────────────────────────────────────
//
// Format v2 (version byte = 0x02):
//   [version: u8]
//   [layout.version: u8]
//   [mermaidHash length: u16LE] [mermaidHash: UTF-8]
//   [mermaidText length: u32LE] [mermaidText: UTF-8]
//   [node count: u16LE]
//     for each node:
//       [key length: u16LE] [key: UTF-8]
//       [x: float64LE] [y: float64LE]
//       [flags: u8]  (bit 0 = hasParentId, bit 1 = locked)
//       if hasParentId: [parentId length: u16LE] [parentId: UTF-8]
//   [container count: u16LE]
//     for each container:
//       [key length: u16LE] [key: UTF-8]
//       [x: float64LE] [y: float64LE] [width: float64LE] [height: float64LE]
//       [flags: u8]  (bit 0 = mode=='manual', bit 1 = locked)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Encode a UTF-8 string and return the bytes. */
function encodeStr(s: string): Uint8Array {
  return encoder.encode(s)
}

/**
 * Pack layout + mermaidText into a compact binary buffer.
 */
export function packBinary(layout: LayoutMap, mermaidText: string): Uint8Array {
  const mermaidHashBytes = layout.mermaidHash ? encodeStr(layout.mermaidHash) : new Uint8Array(0)
  const mermaidTextBytes = encodeStr(mermaidText)

  const nodeEntries = Object.entries(layout.nodes)
  const containerEntries = Object.entries(layout.containers)

  // Guard against overflows in u16 count fields
  if (nodeEntries.length > 0xFFFF) throw new Error('Too many nodes for binary format (max 65535)')
  if (containerEntries.length > 0xFFFF) throw new Error('Too many containers for binary format (max 65535)')

  // Pre-encode all string keys and parentIds to calculate total size
  const encodedNodes: Array<{
    keyBytes: Uint8Array
    entry: NodeLayoutEntry
    parentIdBytes: Uint8Array | null
  }> = nodeEntries.map(([key, entry]) => ({
    keyBytes: encodeStr(key),
    entry,
    parentIdBytes: entry.parentId ? encodeStr(entry.parentId) : null,
  }))

  const encodedContainers: Array<{
    keyBytes: Uint8Array
    entry: ContainerLayoutEntry
  }> = containerEntries.map(([key, entry]) => ({
    keyBytes: encodeStr(key),
    entry,
  }))

  // Calculate total size
  let size = 0
  size += 1  // version
  size += 1  // layout.version (u8; current version is 1, safe for now)
  size += 2 + mermaidHashBytes.byteLength  // mermaidHash
  size += 4 + mermaidTextBytes.byteLength  // mermaidText
  size += 2  // node count
  for (const n of encodedNodes) {
    size += 2 + n.keyBytes.byteLength  // key
    size += 8 + 8  // x, y
    size += 1  // flags
    if (n.parentIdBytes) {
      size += 2 + n.parentIdBytes.byteLength
    }
  }
  size += 2  // container count
  for (const c of encodedContainers) {
    size += 2 + c.keyBytes.byteLength  // key
    size += 8 + 8 + 8 + 8  // x, y, width, height
    size += 1  // flags
  }

  const buf = new ArrayBuffer(size)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  let offset = 0

  // Version
  view.setUint8(offset, BINARY_VERSION); offset += 1
  // Layout version
  view.setUint8(offset, layout.version); offset += 1
  // Mermaid hash
  view.setUint16(offset, mermaidHashBytes.byteLength, true); offset += 2
  bytes.set(mermaidHashBytes, offset); offset += mermaidHashBytes.byteLength
  // Mermaid text
  view.setUint32(offset, mermaidTextBytes.byteLength, true); offset += 4
  bytes.set(mermaidTextBytes, offset); offset += mermaidTextBytes.byteLength

  // Nodes
  view.setUint16(offset, encodedNodes.length, true); offset += 2
  for (const n of encodedNodes) {
    view.setUint16(offset, n.keyBytes.byteLength, true); offset += 2
    bytes.set(n.keyBytes, offset); offset += n.keyBytes.byteLength
    view.setFloat64(offset, n.entry.x, true); offset += 8
    view.setFloat64(offset, n.entry.y, true); offset += 8
    const flags = (n.parentIdBytes ? 1 : 0) | (n.entry.locked ? 2 : 0)
    view.setUint8(offset, flags); offset += 1
    if (n.parentIdBytes) {
      view.setUint16(offset, n.parentIdBytes.byteLength, true); offset += 2
      bytes.set(n.parentIdBytes, offset); offset += n.parentIdBytes.byteLength
    }
  }

  // Containers
  view.setUint16(offset, encodedContainers.length, true); offset += 2
  for (const c of encodedContainers) {
    view.setUint16(offset, c.keyBytes.byteLength, true); offset += 2
    bytes.set(c.keyBytes, offset); offset += c.keyBytes.byteLength
    view.setFloat64(offset, c.entry.x, true); offset += 8
    view.setFloat64(offset, c.entry.y, true); offset += 8
    view.setFloat64(offset, c.entry.width, true); offset += 8
    view.setFloat64(offset, c.entry.height, true); offset += 8
    const flags = (c.entry.mode === 'manual' ? 1 : 0) | (c.entry.locked ? 2 : 0)
    view.setUint8(offset, flags); offset += 1
  }

  return bytes
}

/**
 * Unpack a binary buffer back into layout + mermaidText.
 * Returns null if the buffer is invalid.
 */
export function unpackBinary(data: Uint8Array): SharedLayout | null {
  try {
    // Note: subarray offsets are relative to data's own start, matching our DataView offsets
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const len = data.byteLength
    let offset = 0

    // Minimum: version(1) + layoutVersion(1) + mermaidHashLen(2) + mermaidTextLen(4) + nodeCount(2) + containerCount(2) = 12
    if (len < 12) return null

    const version = view.getUint8(offset); offset += 1
    if (version !== BINARY_VERSION) return null

    const layoutVersion = view.getUint8(offset); offset += 1

    // Mermaid hash
    const mermaidHashLen = view.getUint16(offset, true); offset += 2
    if (offset + mermaidHashLen > len) return null
    const mermaidHash = mermaidHashLen > 0
      ? decoder.decode(data.subarray(offset, offset + mermaidHashLen))
      : undefined
    offset += mermaidHashLen

    // Mermaid text
    if (offset + 4 > len) return null
    const mermaidTextLen = view.getUint32(offset, true); offset += 4
    if (offset + mermaidTextLen > len) return null
    const mermaidText = decoder.decode(data.subarray(offset, offset + mermaidTextLen))
    offset += mermaidTextLen

    // Nodes
    if (offset + 2 > len) return null
    const nodeCount = view.getUint16(offset, true); offset += 2
    const nodes: Record<string, NodeLayoutEntry> = {}
    for (let i = 0; i < nodeCount; i++) {
      // key(2+n) + x(8) + y(8) + flags(1) = minimum 19 bytes per node
      if (offset + 2 > len) return null
      const keyLen = view.getUint16(offset, true); offset += 2
      if (offset + keyLen + 17 > len) return null  // keyLen + x(8) + y(8) + flags(1)
      const key = decoder.decode(data.subarray(offset, offset + keyLen))
      offset += keyLen

      const x = view.getFloat64(offset, true); offset += 8
      const y = view.getFloat64(offset, true); offset += 8
      const flags = view.getUint8(offset); offset += 1

      const hasParentId = (flags & 1) !== 0
      const locked = (flags & 2) !== 0

      const entry: NodeLayoutEntry = { x, y }
      if (hasParentId) {
        if (offset + 2 > len) return null
        const parentIdLen = view.getUint16(offset, true); offset += 2
        if (offset + parentIdLen > len) return null
        entry.parentId = decoder.decode(data.subarray(offset, offset + parentIdLen))
        offset += parentIdLen
      }
      if (locked) entry.locked = true

      nodes[key] = entry
    }

    // Containers
    if (offset + 2 > len) return null
    const containerCount = view.getUint16(offset, true); offset += 2
    const containers: Record<string, ContainerLayoutEntry> = {}
    for (let i = 0; i < containerCount; i++) {
      // key(2+n) + x(8) + y(8) + w(8) + h(8) + flags(1) = minimum 35 bytes per container
      if (offset + 2 > len) return null
      const keyLen = view.getUint16(offset, true); offset += 2
      if (offset + keyLen + 33 > len) return null  // keyLen + x(8) + y(8) + w(8) + h(8) + flags(1)
      const key = decoder.decode(data.subarray(offset, offset + keyLen))
      offset += keyLen

      const x = view.getFloat64(offset, true); offset += 8
      const y = view.getFloat64(offset, true); offset += 8
      const width = view.getFloat64(offset, true); offset += 8
      const height = view.getFloat64(offset, true); offset += 8
      const flags = view.getUint8(offset); offset += 1

      const mode: 'fit' | 'manual' = (flags & 1) !== 0 ? 'manual' : 'fit'
      const locked = (flags & 2) !== 0

      const entry: ContainerLayoutEntry = { x, y, width, height, mode }
      if (locked) entry.locked = true

      containers[key] = entry
    }

    const layout: LayoutMap = { version: layoutVersion, nodes, containers }
    if (mermaidHash) layout.mermaidHash = mermaidHash

    return { layout, mermaidText }
  } catch {
    return null
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function encodeToUrl(layout: LayoutMap, mermaidText: string): Promise<string> {
  const packed = packBinary(layout, mermaidText)
  const compressed = await compress(packed)
  const encoded = toBase64Url(compressed)
  return `#${HASH_PARAM}=${encoded}`
}

export async function decodeFromUrl(hash: string): Promise<SharedLayout | null> {
  try {
    // Strip leading '#' if present
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    if (!raw) return null

    // Parse as key=value pairs
    const params = new URLSearchParams(raw)
    const encoded = params.get(HASH_PARAM)
    if (!encoded) return null

    const compressed = fromBase64Url(encoded)
    const decompressed = await decompress(compressed)

    // Try binary v2 first, then fall back to v1 JSON.
    // This heuristic is safe: v1 JSON always starts with '{' (0x7B), never 0x02.
    if (decompressed.length > 0 && decompressed[0] === BINARY_VERSION) {
      const result = unpackBinary(decompressed)
      if (result) return result
    }

    // v1 fallback: JSON payload
    return decodeV1Json(decompressed)
  } catch {
    return null
  }
}

/** Decode v1 JSON format (backward compatibility). */
function decodeV1Json(decompressed: Uint8Array): SharedLayout | null {
  try {
    const json = decoder.decode(decompressed)
    const parsed: unknown = JSON.parse(json)

    if (typeof parsed !== 'object' || parsed === null) return null
    if (!('layout' in parsed) || !('mermaidText' in parsed)) return null

    const { layout: rawLayout, mermaidText } = parsed as { layout: unknown; mermaidText: unknown }
    if (typeof mermaidText !== 'string') return null

    const layout = validateLayout(rawLayout)
    return { layout, mermaidText }
  } catch {
    return null
  }
}
