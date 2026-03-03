import { describe, it, expect } from 'vitest'
import { encodeToUrl, decodeFromUrl } from '../url-sharing'
import { createEmptyLayout, updateNodePosition, updateContainerGeometry } from '../../core/layout-map'
import type { LayoutMap } from '../../core/layout-map'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeLayout(): LayoutMap {
  let layout = createEmptyLayout()
  layout = updateNodePosition(layout, 'A', 100, 200)
  layout = updateNodePosition(layout, 'B', 300, 400)
  return layout
}

const SAMPLE_MERMAID = `graph TD
  A[Web App] --> B[API Gateway]
  B --> C[Auth Service]`

describe('url-sharing', () => {
  // ── Happy Path ──────────────────────────────────────────────────────────

  describe('Happy Path', () => {
    it('should encode layout and mermaid text into a URL hash string', async () => {
      const layout = makeLayout()
      const hash = await encodeToUrl(layout, SAMPLE_MERMAID)

      expect(hash).toBeTypeOf('string')
      expect(hash.startsWith('#layout=')).toBe(true)
      // Should have actual content after the prefix
      expect(hash.length).toBeGreaterThan('#layout='.length)
    })

    it('should decode a valid URL hash back into layout and mermaid text', async () => {
      const layout = makeLayout()
      const hash = await encodeToUrl(layout, SAMPLE_MERMAID)

      const result = await decodeFromUrl(hash)

      expect(result).not.toBeNull()
      expect(result!.layout.nodes['A']).toEqual({ x: 100, y: 200 })
      expect(result!.layout.nodes['B']).toEqual({ x: 300, y: 400 })
      expect(result!.mermaidText).toBe(SAMPLE_MERMAID)
    })

    it('should round-trip: encode then decode returns original data', async () => {
      const layout = makeLayout()
      const hash = await encodeToUrl(layout, SAMPLE_MERMAID)
      const result = await decodeFromUrl(hash)

      expect(result).not.toBeNull()
      expect(result!.layout.version).toBe(layout.version)
      expect(result!.layout.nodes).toEqual(layout.nodes)
      expect(result!.layout.containers).toEqual(layout.containers)
      expect(result!.mermaidText).toBe(SAMPLE_MERMAID)
    })

    it('should round-trip with complex layout containing nodes and containers', async () => {
      let layout = makeLayout()
      layout = updateContainerGeometry(layout, 'sub1', { x: 10, y: 20, width: 500, height: 300 })
      // Set mermaidHash to verify it survives the round-trip
      layout = { ...layout, mermaidHash: 'abc123' }

      const hash = await encodeToUrl(layout, SAMPLE_MERMAID)
      const result = await decodeFromUrl(hash)

      expect(result).not.toBeNull()
      expect(result!.layout.nodes).toEqual(layout.nodes)
      expect(result!.layout.containers['sub1']).toEqual(
        expect.objectContaining({ x: 10, y: 20, width: 500, height: 300 }),
      )
      expect(result!.layout.mermaidHash).toBe('abc123')
    })

    it('should handle layout with special characters in mermaid text', async () => {
      const layout = createEmptyLayout()
      const mermaid = 'graph TD\n  A["Special <chars> & symbols \' \\" 日本語"]'

      const hash = await encodeToUrl(layout, mermaid)
      const result = await decodeFromUrl(hash)

      expect(result).not.toBeNull()
      expect(result!.mermaidText).toBe(mermaid)
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should return null when URL hash is empty', async () => {
      expect(await decodeFromUrl('')).toBeNull()
    })

    it('should return null when URL hash has no layout parameter', async () => {
      expect(await decodeFromUrl('#foo=bar')).toBeNull()
    })

    it('should return null when URL hash has empty layout value', async () => {
      expect(await decodeFromUrl('#layout=')).toBeNull()
    })

    it('should produce URL-safe output (no +, /, =)', async () => {
      const layout = makeLayout()
      const hash = await encodeToUrl(layout, SAMPLE_MERMAID)

      // Extract just the encoded payload
      const payload = hash.slice('#layout='.length)
      expect(payload).not.toMatch(/[+/=]/)
    })

    it('should handle layout with no nodes or containers (empty layout)', async () => {
      const layout = createEmptyLayout()
      const mermaid = 'graph TD\n  A --> B'

      const hash = await encodeToUrl(layout, mermaid)
      const result = await decodeFromUrl(hash)

      expect(result).not.toBeNull()
      expect(result!.layout.nodes).toEqual({})
      expect(result!.layout.containers).toEqual({})
      expect(result!.mermaidText).toBe(mermaid)
    })
  })

  // ── Error Scenarios ─────────────────────────────────────────────────────

  describe('Error Scenarios', () => {
    it('should return null when encoded data is corrupted base64', async () => {
      expect(await decodeFromUrl('#layout=!!!not-valid-base64!!!')).toBeNull()
    })

    it('should return null when decoded data is invalid JSON', async () => {
      // Manually encode something that is valid base64 but not valid compressed JSON
      // Use raw bytes that won't decompress properly
      const garbage = btoa('this is not compressed data')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      expect(await decodeFromUrl(`#layout=${garbage}`)).toBeNull()
    })

    it('should return null when decoded JSON is missing required fields', async () => {
      // Compress valid JSON that's missing layout fields
      const badPayload = JSON.stringify({ mermaidText: 'graph TD' })
      const encoded = await compressToBase64Url(badPayload)
      expect(await decodeFromUrl(`#layout=${encoded}`)).toBeNull()
    })

    it('should return null when compression/decompression fails on garbage input', async () => {
      // A string that looks like base64url but decompresses to garbage
      expect(await decodeFromUrl('#layout=AAAA')).toBeNull()
    })
  })
})

// ── Test helper: compress a string the same way the module does ──────────

async function compressToBase64Url(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  writer.write(data)
  writer.close()
  const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer())
  let binary = ''
  for (const byte of compressed) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
