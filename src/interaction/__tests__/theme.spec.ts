import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getStoredMode, storeMode, applyTheme, getOSTheme, resolveTheme, listenForOSThemeChange, NEXT_MODE } from '../theme'

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

  describe('getOSTheme', () => {
    it('returns dark when OS prefers dark', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
      expect(getOSTheme()).toBe('dark')
    })

    it('returns light when OS prefers light', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
      expect(getOSTheme()).toBe('light')
    })
  })

  describe('getStoredMode', () => {
    it('returns auto when nothing is stored', () => {
      expect(getStoredMode()).toBe('auto')
    })

    it('returns dark when dark is stored', () => {
      localStorage.setItem('fleximaid-theme', 'dark')
      expect(getStoredMode()).toBe('dark')
    })

    it('returns light when light is stored', () => {
      localStorage.setItem('fleximaid-theme', 'light')
      expect(getStoredMode()).toBe('light')
    })

    it('returns auto when auto is stored', () => {
      localStorage.setItem('fleximaid-theme', 'auto')
      expect(getStoredMode()).toBe('auto')
    })

    it('falls back to auto for an invalid stored value', () => {
      localStorage.setItem('fleximaid-theme', 'neon')
      expect(getStoredMode()).toBe('auto')
    })
  })

  describe('storeMode', () => {
    it('persists the mode to localStorage', () => {
      storeMode('light')
      expect(localStorage.getItem('fleximaid-theme')).toBe('light')
    })

    it('overwrites a previously stored mode', () => {
      storeMode('light')
      storeMode('dark')
      expect(localStorage.getItem('fleximaid-theme')).toBe('dark')
    })

    it('persists auto mode', () => {
      storeMode('auto')
      expect(localStorage.getItem('fleximaid-theme')).toBe('auto')
    })
  })

  describe('resolveTheme', () => {
    it('returns dark for dark mode', () => {
      expect(resolveTheme('dark')).toBe('dark')
    })

    it('returns light for light mode', () => {
      expect(resolveTheme('light')).toBe('light')
    })

    it('returns OS theme for auto mode (dark)', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
      expect(resolveTheme('auto')).toBe('dark')
    })

    it('returns OS theme for auto mode (light)', () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
      expect(resolveTheme('auto')).toBe('light')
    })
  })

  describe('NEXT_MODE', () => {
    it('cycles dark -> light -> auto -> dark', () => {
      expect(NEXT_MODE.dark).toBe('light')
      expect(NEXT_MODE.light).toBe('auto')
      expect(NEXT_MODE.auto).toBe('dark')
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

  describe('listenForOSThemeChange', () => {
    let listeners: Array<(e: { matches: boolean }) => void>
    let mockMediaQuery: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      listeners = []
      mockMediaQuery = {
        matches: true,
        addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => { listeners.push(handler) }),
        removeEventListener: vi.fn(),
      }
      window.matchMedia = vi.fn().mockReturnValue(mockMediaQuery) as unknown as typeof window.matchMedia
    })

    it('registers a change listener on the media query', () => {
      listenForOSThemeChange(vi.fn())
      expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('applies dark theme and calls callback when mode is auto and OS switches to dark', () => {
      localStorage.setItem('fleximaid-theme', 'auto')
      const callback = vi.fn()
      listenForOSThemeChange(callback)

      listeners[0]!({ matches: true })

      expect(callback).toHaveBeenCalledWith('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('applies light theme and calls callback when mode is auto and OS switches to light', () => {
      localStorage.setItem('fleximaid-theme', 'auto')
      const callback = vi.fn()
      listenForOSThemeChange(callback)

      listeners[0]!({ matches: false })

      expect(callback).toHaveBeenCalledWith('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('follows OS when nothing is stored (defaults to auto)', () => {
      const callback = vi.fn()
      listenForOSThemeChange(callback)

      listeners[0]!({ matches: true })

      expect(callback).toHaveBeenCalledWith('dark')
    })

    it('does not apply theme or call callback when mode is dark', () => {
      localStorage.setItem('fleximaid-theme', 'dark')
      applyTheme('dark')
      const callback = vi.fn()
      listenForOSThemeChange(callback)

      listeners[0]!({ matches: false })

      expect(callback).not.toHaveBeenCalled()
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('does not apply theme or call callback when mode is light', () => {
      localStorage.setItem('fleximaid-theme', 'light')
      applyTheme('light')
      const callback = vi.fn()
      listenForOSThemeChange(callback)

      listeners[0]!({ matches: true })

      expect(callback).not.toHaveBeenCalled()
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('returns a cleanup function that removes the listener', () => {
      const cleanup = listenForOSThemeChange(vi.fn())
      cleanup()
      expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('removes the exact handler that was registered', () => {
      const cleanup = listenForOSThemeChange(vi.fn())
      const registeredHandler = mockMediaQuery.addEventListener.mock.calls[0]![1]
      cleanup()
      expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith('change', registeredHandler)
    })
  })
})
