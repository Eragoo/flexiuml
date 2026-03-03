export interface ShortcutEntry {
  keys: string
  description: string
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: 'Ctrl / Cmd + Z', description: 'Undo' },
  { keys: 'Ctrl / Cmd + Shift + Z', description: 'Redo' },
  { keys: 'Ctrl / Cmd + Y', description: 'Redo (alternative)' },
  { keys: 'Space + Drag', description: 'Pan the diagram' },
  { keys: 'Middle Mouse + Drag', description: 'Pan the diagram' },
  { keys: 'Scroll Wheel', description: 'Zoom in / out' },
  { keys: 'Click node', description: 'Select node' },
  { keys: 'Shift / Ctrl + Click', description: 'Multi-select' },
  { keys: 'Click + Drag (empty area)', description: 'Box select' },
  { keys: 'Escape', description: 'Deselect all' },
  { keys: '?', description: 'Toggle shortcuts overlay' },
]
