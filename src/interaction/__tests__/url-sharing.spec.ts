import { describe, it, expect } from 'vitest'
import { encodeToUrl, decodeFromUrl, packBinary, unpackBinary } from '../url-sharing'
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

    it('should decode URL hash without leading # prefix', async () => {
      const layout = makeLayout()
      const hash = await encodeToUrl(layout, SAMPLE_MERMAID)
      // Strip the '#' prefix
      const result = await decodeFromUrl(hash.slice(1))

      expect(result).not.toBeNull()
      expect(result!.layout.nodes['A']).toEqual({ x: 100, y: 200 })
      expect(result!.mermaidText).toBe(SAMPLE_MERMAID)
    })
  })

  // ── Error Scenarios ─────────────────────────────────────────────────────

  describe('Error Scenarios', () => {
    it('should return null when encoded data is corrupted base64', async () => {
      expect(await decodeFromUrl('#layout=!!!not-valid-base64!!!')).toBeNull()
    })

    it('should return null when decoded data is invalid compressed content', async () => {
      // Manually encode something that is valid base64 but not valid compressed data
      const garbage = btoa('this is not compressed data')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      expect(await decodeFromUrl(`#layout=${garbage}`)).toBeNull()
    })

    it('should return null when compression/decompression fails on garbage input', async () => {
      // A string that looks like base64url but decompresses to garbage
      expect(await decodeFromUrl('#layout=AAAA')).toBeNull()
    })
  })

  // ── Binary Encoding ─────────────────────────────────────────────────────

  describe('Binary Encoding', () => {
    it('should pack and unpack a simple layout (round-trip)', () => {
      const layout = makeLayout()
      const packed = packBinary(layout, SAMPLE_MERMAID)
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.version).toBe(layout.version)
      expect(result!.layout.nodes['A']).toEqual({ x: 100, y: 200 })
      expect(result!.layout.nodes['B']).toEqual({ x: 300, y: 400 })
      expect(result!.layout.containers).toEqual({})
      expect(result!.mermaidText).toBe(SAMPLE_MERMAID)
    })

    it('should pack and unpack layout with containers', () => {
      let layout = makeLayout()
      layout = updateContainerGeometry(layout, 'sub1', { x: 10, y: 20, width: 500, height: 300 })

      const packed = packBinary(layout, SAMPLE_MERMAID)
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.containers['sub1']).toEqual(
        expect.objectContaining({ x: 10, y: 20, width: 500, height: 300 }),
      )
    })

    it('should pack and unpack layout with mermaidHash', () => {
      const layout = { ...makeLayout(), mermaidHash: 'hash-abc' }

      const packed = packBinary(layout, SAMPLE_MERMAID)
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.mermaidHash).toBe('hash-abc')
    })

    it('should pack and unpack layout with node parentId and locked flags', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'child', 50, 60)
      layout = {
        ...layout,
        nodes: {
          ...layout.nodes,
          child: { ...layout.nodes['child']!, parentId: 'parent1', locked: true },
        },
      }

      const packed = packBinary(layout, 'graph TD')
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.nodes['child']).toEqual({
        x: 50, y: 60, parentId: 'parent1', locked: true,
      })
    })

    it('should pack and unpack container with locked flag and manual mode', () => {
      let layout = createEmptyLayout()
      layout = updateContainerGeometry(layout, 'c1', { x: 1, y: 2, width: 100, height: 200 })
      layout = {
        ...layout,
        containers: {
          ...layout.containers,
          c1: { ...layout.containers['c1']!, mode: 'manual', locked: true },
        },
      }

      const packed = packBinary(layout, 'graph TD')
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.containers['c1']!.mode).toBe('manual')
      expect(result!.layout.containers['c1']!.locked).toBe(true)
    })

    it('should pack and unpack container with fit mode and no locked flag', () => {
      let layout = createEmptyLayout()
      layout = updateContainerGeometry(layout, 'c1', { x: 1, y: 2, width: 100, height: 200 })

      const packed = packBinary(layout, 'graph TD')
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.containers['c1']!.mode).toBe('fit')
      expect(result!.layout.containers['c1']!.locked).toBeUndefined()
    })

    it('should produce smaller output than JSON for large layouts', () => {
      let layout = createEmptyLayout()
      for (let i = 0; i < 50; i++) {
        layout = updateNodePosition(layout, `node-${i}`, i * 10.5, i * 20.3)
      }
      for (let i = 0; i < 10; i++) {
        layout = updateContainerGeometry(layout, `container-${i}`, {
          x: i * 5, y: i * 10, width: 200 + i, height: 300 + i,
        })
      }

      const mermaid = 'graph TD\n' + Array.from({ length: 50 }, (_, i) => `  node-${i} --> node-${i + 1}`).join('\n')

      const binarySize = packBinary(layout, mermaid).byteLength
      const jsonSize = new TextEncoder().encode(JSON.stringify({ layout, mermaidText: mermaid })).byteLength

      // Binary should be meaningfully smaller than JSON
      expect(binarySize).toBeLessThan(jsonSize)
    })

    it('should handle empty layout', () => {
      const layout = createEmptyLayout()
      const packed = packBinary(layout, 'graph TD')
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.nodes).toEqual({})
      expect(result!.layout.containers).toEqual({})
      expect(result!.mermaidText).toBe('graph TD')
    })

    it('should handle special UTF-8 characters', () => {
      const layout = createEmptyLayout()
      const mermaid = 'graph TD\n  A["日本語テスト 🚀"]'

      const packed = packBinary(layout, mermaid)
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.mermaidText).toBe(mermaid)
    })

    it('should return null for truncated binary data', () => {
      const layout = makeLayout()
      const packed = packBinary(layout, SAMPLE_MERMAID)
      // Truncate to just a few bytes
      const truncated = packed.slice(0, 5)

      expect(unpackBinary(truncated)).toBeNull()
    })

    it('should return null for unknown binary version', () => {
      const data = new Uint8Array([0xFF, 0, 0, 0])
      expect(unpackBinary(data)).toBeNull()
    })

    it('should start with version byte 0x02', () => {
      const layout = makeLayout()
      const packed = packBinary(layout, SAMPLE_MERMAID)
      expect(packed[0]).toBe(0x02)
    })

    it('should return null for buffer with only version + layoutVersion (minimum header boundary)', () => {
      // Exactly 2 bytes: version + layoutVersion, but missing the rest of the header
      const data = new Uint8Array([0x02, 0x01])
      expect(unpackBinary(data)).toBeNull()
    })

    it('should return null for buffer with fabricated huge mermaidTextLen', () => {
      // Craft a buffer that claims mermaidTextLen = 0xFFFFFFFF but has no data
      const buf = new ArrayBuffer(12)
      const view = new DataView(buf)
      view.setUint8(0, 0x02)  // version
      view.setUint8(1, 0x01)  // layoutVersion
      view.setUint16(2, 0, true)  // mermaidHashLen = 0
      view.setUint32(4, 0xFFFFFFFF, true)  // mermaidTextLen = huge
      // nodeCount and containerCount don't matter — should bail before reading them
      expect(unpackBinary(new Uint8Array(buf))).toBeNull()
    })

    it('should faithfully round-trip NaN and Infinity coordinates', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'nan-node', NaN, Infinity)

      const packed = packBinary(layout, 'graph TD')
      const result = unpackBinary(packed)

      expect(result).not.toBeNull()
      expect(result!.layout.nodes['nan-node']!.x).toBeNaN()
      expect(result!.layout.nodes['nan-node']!.y).toBe(Infinity)
    })
  })

  // ── Backward Compatibility ─────────────────────────────────────────────

  describe('Backward Compatibility (v1 JSON URLs)', () => {
    it('should decode a v1-format URL (JSON payload)', async () => {
      const layout = makeLayout()
      const payload = JSON.stringify({ layout, mermaidText: SAMPLE_MERMAID })
      const encoded = await compressToBase64Url(payload)

      const result = await decodeFromUrl(`#layout=${encoded}`)

      expect(result).not.toBeNull()
      expect(result!.layout.nodes['A']).toEqual({ x: 100, y: 200 })
      expect(result!.layout.nodes['B']).toEqual({ x: 300, y: 400 })
      expect(result!.mermaidText).toBe(SAMPLE_MERMAID)
    })

    it('should reject v1 JSON missing required fields', async () => {
      const badPayload = JSON.stringify({ mermaidText: 'graph TD' })
      const encoded = await compressToBase64Url(badPayload)
      expect(await decodeFromUrl(`#layout=${encoded}`)).toBeNull()
    })
  })
})

// ── Test helper: compress a string the same way the v1 module does ──────

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
