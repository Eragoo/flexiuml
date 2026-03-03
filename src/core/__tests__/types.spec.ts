import { describe, it, expect } from 'vitest'
import {
  IDLE_DRAG,
  DEFAULT_VIEWPORT,
  EMPTY_SELECTION,
  IDLE_PAN,
} from '../types'

describe('types – default constants', () => {
  // Happy Path

  it('IDLE_DRAG has correct defaults', () => {
    expect(IDLE_DRAG).toEqual({
      dragging: false,
      nodeId: null,
      offsetX: 0,
      offsetY: 0,
      startTranslateX: 0,
      startTranslateY: 0,
    })
  })

  it('DEFAULT_VIEWPORT has correct defaults', () => {
    expect(DEFAULT_VIEWPORT).toEqual({
      panX: 0,
      panY: 0,
      zoom: 1,
    })
  })

  it('EMPTY_SELECTION has an empty Set', () => {
    expect(EMPTY_SELECTION.selectedIds).toBeInstanceOf(Set)
    expect(EMPTY_SELECTION.selectedIds.size).toBe(0)
  })

  it('IDLE_PAN has correct defaults', () => {
    expect(IDLE_PAN).toEqual({
      panning: false,
      startClientX: 0,
      startClientY: 0,
      startPanX: 0,
      startPanY: 0,
    })
  })
})
