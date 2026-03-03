import type { LayoutMap } from '../core/layout-map'
import { validateLayout } from '../core/layout-map'

export interface SharedLayout {
  layout: LayoutMap
  mermaidText: string
}

const HASH_PARAM = 'layout'

// ── Compression helpers (deflate-raw via Web Streams API) ───────────────────

async function compress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  void writer.write(data as unknown as BufferSource)
  void writer.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
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

// ── Public API ──────────────────────────────────────────────────────────────

export async function encodeToUrl(layout: LayoutMap, mermaidText: string): Promise<string> {
  const payload = JSON.stringify({ layout, mermaidText })
  const compressed = await compress(new TextEncoder().encode(payload))
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
    const json = new TextDecoder().decode(decompressed)
    const parsed: unknown = JSON.parse(json)

    if (typeof parsed !== 'object' || parsed === null) return null
    if (!('layout' in parsed) || !('mermaidText' in parsed)) return null

    const { layout: rawLayout, mermaidText } = parsed as { layout: unknown; mermaidText: unknown }
    if (typeof mermaidText !== 'string') return null

    // Validate layout structure
    const layout = validateLayout(rawLayout)

    return { layout, mermaidText }
  } catch {
    return null
  }
}
