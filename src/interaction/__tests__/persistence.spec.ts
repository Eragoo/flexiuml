import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveToLocalStorage, loadFromLocalStorage, resetLayout, exportSvg, exportLayout } from '../persistence'
import { createEmptyLayout, updateNodePosition } from '../../core/layout-map'

// Mock localStorage for jsdom environment (which may not fully implement it)
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { for (const key of Object.keys(store)) delete store[key] }),
  get length() { return Object.keys(store).length },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

describe('persistence', () => {
  beforeEach(() => {
    // Clear the mock store
    for (const key of Object.keys(store)) delete store[key]
    vi.clearAllMocks()
  })

  // ----- saveToLocalStorage / loadFromLocalStorage -----

  describe('saveToLocalStorage', () => {
    it('saves layout that can be loaded back', () => {
      let layout = createEmptyLayout()
      layout = updateNodePosition(layout, 'A', 100, 200)

      saveToLocalStorage(layout)
      const loaded = loadFromLocalStorage()

      expect(loaded).not.toBeNull()
      expect(loaded!.nodes['A']).toEqual({ x: 100, y: 200 })
    })

    it('uses custom key when provided', () => {
      const layout = createEmptyLayout()
      saveToLocalStorage(layout, 'custom-key')

      // Default key should return null
      expect(loadFromLocalStorage()).toBeNull()
      // Custom key should return the layout
      expect(loadFromLocalStorage('custom-key')).not.toBeNull()
    })

    it('calls localStorage.setItem', () => {
      const layout = createEmptyLayout()
      saveToLocalStorage(layout)
      expect(localStorageMock.setItem).toHaveBeenCalledOnce()
    })
  })

  describe('loadFromLocalStorage', () => {
    it('returns null when no layout is stored', () => {
      expect(loadFromLocalStorage()).toBeNull()
    })

    it('returns null when stored data is invalid JSON', () => {
      store['fleximaid-layout'] = 'not valid json {{{'
      expect(loadFromLocalStorage()).toBeNull()
    })

    it('returns null when stored data is missing fields', () => {
      store['fleximaid-layout'] = '{"foo": "bar"}'
      expect(loadFromLocalStorage()).toBeNull()
    })
  })

  // ----- resetLayout -----

  describe('resetLayout', () => {
    it('clears localStorage and returns empty layout', () => {
      const layout = createEmptyLayout()
      saveToLocalStorage(layout)
      expect(loadFromLocalStorage()).not.toBeNull()

      const result = resetLayout()
      expect(loadFromLocalStorage()).toBeNull()
      expect(result.version).toBe(1)
      expect(result.nodes).toEqual({})
      expect(result.containers).toEqual({})
    })

    it('returns a valid empty layout even if nothing was stored', () => {
      const result = resetLayout()
      expect(result.version).toBe(1)
      expect(result.nodes).toEqual({})
    })

    it('calls localStorage.removeItem', () => {
      resetLayout()
      expect(localStorageMock.removeItem).toHaveBeenCalled()
    })
  })

  // ----- exportLayout -----

  describe('exportLayout', () => {
    it('creates a download link with .json filename and application/json blob', () => {
      const layout = createEmptyLayout()
      updateNodePosition(layout, 'node1', 10, 20)

      const clickSpy = vi.fn()
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_v: string) { /* noop */ },
        get href() { return '' },
        download: '',
        click: clickSpy,
      } as unknown as HTMLAnchorElement)

      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      exportLayout(layout)

      expect(createObjectURLSpy).toHaveBeenCalledOnce()
      const blob = createObjectURLSpy.mock.calls[0]![0] as Blob
      expect(blob.type).toBe('application/json')
      expect(clickSpy).toHaveBeenCalledOnce()
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test')

      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })
  })

  // ----- exportSvg -----

  describe('exportSvg', () => {
    it('creates a download link with .svg filename', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '100')
      svg.setAttribute('height', '100')

      const clickSpy = vi.fn()
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
        set href(v: string) { /* captured */ },
        get href() { return '' },
        download: '',
        click: clickSpy,
      } as unknown as HTMLAnchorElement)

      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      exportSvg(svg)

      expect(createObjectURLSpy).toHaveBeenCalledOnce()
      const blob = createObjectURLSpy.mock.calls[0]![0] as Blob
      expect(blob.type).toBe('image/svg+xml')
      expect(clickSpy).toHaveBeenCalledOnce()
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test')

      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })

    it('includes xml namespace in the exported SVG', async () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '200')
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('width', '50')
      rect.setAttribute('height', '50')
      svg.appendChild(rect)

      let capturedBlob: Blob | null = null
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_v: string) { /* noop */ },
        get href() { return '' },
        download: '',
        click: vi.fn(),
      } as unknown as HTMLAnchorElement)
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        capturedBlob = blob as Blob
        return 'blob:test'
      })
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      exportSvg(svg)

      expect(capturedBlob).not.toBeNull()
      const text = await capturedBlob!.text()
      expect(text).toContain('xmlns="http://www.w3.org/2000/svg"')
      expect(text).toContain('<rect')

      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })
  })
})
