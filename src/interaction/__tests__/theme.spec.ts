import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getStoredTheme, storeTheme, applyTheme } from '../theme'
import type { Theme } from '../theme'

// Mock localStorage for jsdom environment
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

describe('theme', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
    // Reset CSS custom properties on documentElement
    const root = document.documentElement
    root.style.cssText = ''
    root.removeAttribute('data-theme')
  })

  // ── Happy Path ──────────────────────────────────────────────────────────

  describe('getStoredTheme', () => {
    it('returns OS preference when nothing is stored (dark)', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
      expect(getStoredTheme()).toBe('dark')
    })

    it('returns OS preference when nothing is stored (light)', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
      expect(getStoredTheme()).toBe('light')
    })

    it('returns the stored theme', () => {
      localStorage.setItem('fleximaid-theme', 'light')
      expect(getStoredTheme()).toBe('light')
    })

    it('falls back to OS preference for an invalid stored value', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
      localStorage.setItem('fleximaid-theme', 'neon')
      expect(getStoredTheme()).toBe('dark')
    })
  })

  describe('storeTheme', () => {
    it('persists the theme to localStorage', () => {
      storeTheme('light')
      expect(localStorage.getItem('fleximaid-theme')).toBe('light')
    })

    it('overwrites a previously stored theme', () => {
      storeTheme('light')
      storeTheme('dark')
      expect(localStorage.getItem('fleximaid-theme')).toBe('dark')
    })
  })

  describe('applyTheme', () => {
    it('sets dark CSS variables on document root', () => {
      applyTheme('dark')
      const root = document.documentElement
      expect(root.style.getPropertyValue('--bg')).toBeTruthy()
      expect(root.getAttribute('data-theme')).toBe('dark')
    })

    it('sets light CSS variables on document root', () => {
      applyTheme('light')
      const root = document.documentElement
      expect(root.style.getPropertyValue('--bg')).toBeTruthy()
      expect(root.getAttribute('data-theme')).toBe('light')
    })

    it('dark and light themes have different --bg values', () => {
      applyTheme('dark')
      const darkBg = document.documentElement.style.getPropertyValue('--bg')
      applyTheme('light')
      const lightBg = document.documentElement.style.getPropertyValue('--bg')
      expect(darkBg).not.toBe(lightBg)
    })

    it('sets all expected CSS variables', () => {
      const expectedVars = [
        '--bg', '--bg-surface', '--bg-diagram', '--fg',
        '--green', '--dim', '--border',
      ]
      applyTheme('dark')
      const root = document.documentElement
      for (const v of expectedVars) {
        expect(root.style.getPropertyValue(v)).toBeTruthy()
      }
    })
  })
})
