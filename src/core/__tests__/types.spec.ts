import { describe, it, expect } from 'vitest'
import {
  IDLE_DRAG,
  DEFAULT_VIEWPORT,
  EMPTY_SELECTION,
  IDLE_PAN,
  IDLE_BOX_SELECT,
} from '../types'

describe('types – default constants', () => {
  // Happy Path

  it('IDLE_DRAG has correct defaults', () => {
    expect(IDLE_DRAG.dragging).toBe(false)
    expect(IDLE_DRAG.draggedIds).toBeInstanceOf(Set)
    expect(IDLE_DRAG.draggedIds.size).toBe(0)
    expect(IDLE_DRAG.anchorWorldX).toBe(0)
    expect(IDLE_DRAG.anchorWorldY).toBe(0)
    expect(IDLE_DRAG.startPositions).toBeInstanceOf(Map)
    expect(IDLE_DRAG.startPositions.size).toBe(0)
  })

  it('DEFAULT_VIEWPORT has correct defaults', () => {
    expect(DEFAULT_VIEWPORT).toEqual({
      panX: 0,
      panY: 0,
      zoom: 1,
    })
  })

  it('EMPTY_SELECTION has empty Sets for nodes and containers', () => {
    expect(EMPTY_SELECTION.selectedNodeIds).toBeInstanceOf(Set)
    expect(EMPTY_SELECTION.selectedNodeIds.size).toBe(0)
    expect(EMPTY_SELECTION.selectedContainerIds).toBeInstanceOf(Set)
    expect(EMPTY_SELECTION.selectedContainerIds.size).toBe(0)
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

  it('IDLE_BOX_SELECT has correct defaults', () => {
    expect(IDLE_BOX_SELECT).toEqual({
      active: false,
      startWorldX: 0,
      startWorldY: 0,
      currentWorldX: 0,
      currentWorldY: 0,
    })
  })
})
