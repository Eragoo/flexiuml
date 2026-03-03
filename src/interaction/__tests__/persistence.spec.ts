import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveToLocalStorage, loadFromLocalStorage, resetLayout } from '../persistence'
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
})
