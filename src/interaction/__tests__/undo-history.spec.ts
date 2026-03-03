import { describe, it, expect } from 'vitest'
import {
  createHistory,
  pushState,
  undo,
  redo,
  canUndo,
  canRedo,
  DEFAULT_MAX_HISTORY,
} from '../undo-history'
import { createEmptyLayout, updateNodePosition } from '../../core/layout-map'
import type { LayoutMap } from '../../core/layout-map'

// ── Helpers ─────────────────────────────────────────────────────────────────

function layoutWith(id: string, x: number, y: number): LayoutMap {
  return updateNodePosition(createEmptyLayout(), id, x, y)
}

describe('undo-history', () => {
  // ── Happy Path ──────────────────────────────────────────────────────────

  describe('Happy Path', () => {
    it('should create history with initial state as present', () => {
      const initial = layoutWith('A', 10, 20)
      const history = createHistory(initial)

      expect(history.present).toEqual(initial)
      expect(history.past).toEqual([])
      expect(history.future).toEqual([])
    })

    it('should push a new state onto history', () => {
      const s0 = layoutWith('A', 10, 20)
      const s1 = layoutWith('A', 30, 40)
      let history = createHistory(s0)

      history = pushState(history, s1)

      expect(history.present).toEqual(s1)
      expect(history.past).toEqual([s0])
      expect(history.future).toEqual([])
    })

    it('should undo to the previous state', () => {
      const s0 = layoutWith('A', 10, 20)
      const s1 = layoutWith('A', 30, 40)
      let history = createHistory(s0)
      history = pushState(history, s1)

      history = undo(history)

      expect(history.present).toEqual(s0)
      expect(history.past).toEqual([])
      expect(history.future).toEqual([s1])
    })

    it('should redo to the next state after undo', () => {
      const s0 = layoutWith('A', 10, 20)
      const s1 = layoutWith('A', 30, 40)
      let history = createHistory(s0)
      history = pushState(history, s1)
      history = undo(history)

      history = redo(history)

      expect(history.present).toEqual(s1)
      expect(history.past).toEqual([s0])
      expect(history.future).toEqual([])
    })

    it('should support multiple sequential undos', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      const s2 = layoutWith('A', 20, 20)
      const s3 = layoutWith('A', 30, 30)
      let history = createHistory(s0)
      history = pushState(history, s1)
      history = pushState(history, s2)
      history = pushState(history, s3)

      history = undo(history)
      expect(history.present).toEqual(s2)

      history = undo(history)
      expect(history.present).toEqual(s1)

      history = undo(history)
      expect(history.present).toEqual(s0)
      expect(history.past).toEqual([])
      expect(history.future).toEqual([s1, s2, s3])
    })

    it('should support multiple sequential redos', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      const s2 = layoutWith('A', 20, 20)
      let history = createHistory(s0)
      history = pushState(history, s1)
      history = pushState(history, s2)
      history = undo(history)
      history = undo(history)

      history = redo(history)
      expect(history.present).toEqual(s1)

      history = redo(history)
      expect(history.present).toEqual(s2)
      expect(history.past).toEqual([s0, s1])
      expect(history.future).toEqual([])
    })

    it('should undo and redo back to original state (full round-trip)', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      const s2 = layoutWith('A', 20, 20)
      let history = createHistory(s0)
      history = pushState(history, s1)
      history = pushState(history, s2)

      // Undo all
      history = undo(history)
      history = undo(history)
      expect(history.present).toEqual(s0)

      // Redo all
      history = redo(history)
      history = redo(history)
      expect(history.present).toEqual(s2)
      expect(history.past).toEqual([s0, s1])
      expect(history.future).toEqual([])
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should clear future states when a new state is pushed after undo', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      const s2 = layoutWith('A', 20, 20)
      const s3 = layoutWith('A', 99, 99) // new branch
      let history = createHistory(s0)
      history = pushState(history, s1)
      history = pushState(history, s2)
      history = undo(history) // present = s1, future = [s2]

      history = pushState(history, s3) // should discard s2 from future

      expect(history.present).toEqual(s3)
      expect(history.past).toEqual([s0, s1])
      expect(history.future).toEqual([])
    })

    it('should cap history at max size, dropping oldest entries', () => {
      const maxSize = DEFAULT_MAX_HISTORY
      let history = createHistory(layoutWith('A', 0, 0))

      // Push maxSize + 10 states
      for (let i = 1; i <= maxSize + 10; i++) {
        history = pushState(history, layoutWith('A', i, i))
      }

      // Past should be capped at maxSize
      expect(history.past.length).toBe(maxSize)
      // We started at x=0, pushed 60 states (x=1..60). Past holds 50 entries.
      // The oldest 10 (x=0..9) were dropped, so past[0] is x=10.
      expect(history.past[0]!.nodes['A']!.x).toBe(10)
    })

    it('should not push duplicate state if layout is identical to present', () => {
      const s0 = layoutWith('A', 10, 20)
      let history = createHistory(s0)

      // Push the same layout again
      const s0copy = layoutWith('A', 10, 20)
      history = pushState(history, s0copy)

      expect(history.past).toEqual([])
      expect(history.present).toEqual(s0)
    })

    it('should report canUndo correctly', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      let history = createHistory(s0)

      expect(canUndo(history)).toBe(false)

      history = pushState(history, s1)
      expect(canUndo(history)).toBe(true)

      history = undo(history)
      expect(canUndo(history)).toBe(false)
    })

    it('should report canRedo correctly', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      let history = createHistory(s0)

      expect(canRedo(history)).toBe(false)

      history = pushState(history, s1)
      expect(canRedo(history)).toBe(false)

      history = undo(history)
      expect(canRedo(history)).toBe(true)

      history = redo(history)
      expect(canRedo(history)).toBe(false)
    })

    it('should handle push after undo-then-redo sequence', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      const s2 = layoutWith('A', 20, 20)
      const s3 = layoutWith('A', 30, 30)
      let history = createHistory(s0)
      history = pushState(history, s1)
      history = pushState(history, s2)

      // Undo then redo (back to s2)
      history = undo(history)
      history = redo(history)
      expect(history.present).toEqual(s2)

      // Push new state — future should be empty
      history = pushState(history, s3)
      expect(history.present).toEqual(s3)
      expect(history.past).toEqual([s0, s1, s2])
      expect(history.future).toEqual([])
    })
  })

  // ── Error Scenarios ─────────────────────────────────────────────────────

  describe('Error Scenarios', () => {
    it('should return unchanged history when undo is called with no past', () => {
      const s0 = layoutWith('A', 0, 0)
      const history = createHistory(s0)

      const result = undo(history)

      expect(result).toEqual(history)
    })

    it('should return unchanged history when redo is called with no future', () => {
      const s0 = layoutWith('A', 0, 0)
      const s1 = layoutWith('A', 10, 10)
      let history = createHistory(s0)
      history = pushState(history, s1)

      const result = redo(history)

      expect(result).toEqual(history)
    })
  })
})
