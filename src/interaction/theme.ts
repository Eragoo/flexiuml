export type Theme = 'dark' | 'light'
export type ThemeMode = 'dark' | 'light' | 'auto'

const THEME_KEY = 'fleximaid-theme'

const THEME_VARS: Record<Theme, Record<string, string>> = {
  dark: {
    '--bg': '#0a0a0a',
    '--bg-surface': '#111111',
    '--bg-diagram': '#0d0d0d',
    '--fg': '#e0e0e0',
    '--green': '#00ff88',
    '--dim': '#777',
    '--border': 'rgba(255, 255, 255, 0.06)',
    '--glow': 'rgba(0, 255, 136, 0.15)',
    '--error': '#ff6b6b',
    '--error-bg': 'rgba(220, 38, 38, 0.1)',
    '--error-border': 'rgba(220, 38, 38, 0.2)',
  },
  light: {
    '--bg': '#f5f5f5',
    '--bg-surface': '#ffffff',
    '--bg-diagram': '#fafafa',
    '--fg': '#1a1a1a',
    '--green': '#00994d',
    '--dim': '#888',
    '--border': 'rgba(0, 0, 0, 0.1)',
    '--glow': 'rgba(0, 153, 77, 0.15)',
    '--error': '#cc3333',
    '--error-bg': 'rgba(220, 38, 38, 0.08)',
    '--error-border': 'rgba(220, 38, 38, 0.15)',
  },
}

export const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  dark: 'light',
  light: 'auto',
  auto: 'dark',
}

export function getOSTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored
  return 'auto'
}

export function storeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode)
}

export function resolveTheme(mode: ThemeMode): Theme {
  return mode === 'auto' ? getOSTheme() : mode
}

export function applyTheme(theme: Theme): void {
  const vars = THEME_VARS[theme]
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.setAttribute('data-theme', theme)
}

export function listenForOSThemeChange(onThemeChange?: (theme: Theme) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => {
    if (getStoredMode() === 'auto') {
      const osTheme: Theme = e.matches ? 'dark' : 'light'
      applyTheme(osTheme)
      onThemeChange?.(osTheme)
    }
  }
  mediaQuery.addEventListener('change', handler)
  return () => mediaQuery.removeEventListener('change', handler)
}
