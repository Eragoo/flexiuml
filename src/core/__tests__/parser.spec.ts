import { describe, it, expect } from 'vitest'
import { parsePlantUml } from '../parser'

/** Extracts pseudo-state IDs (start/end) from a list of block IDs */
const pseudoIds = (ids: string[]) =>
  ids.filter((id) => id.includes('__start') || id.includes('__end'))

/** Returns IDs present in both arrays (i.e. collisions) */
const overlapping = (a: string[], b: string[]) => a.filter((id) => b.includes(id))

describe('parsePlantUml', () => {
  // ── Happy Path ──────────────────────────────────────────────

  it('should parse a single component block', () => {
    const diagram = parsePlantUml('[ComponentA]')

    expect(diagram.blocks).toHaveLength(1)
    expect(diagram.blocks[0]).toEqual({
      id: 'ComponentA',
      label: 'ComponentA',
      type: 'component',
    })
    expect(diagram.connections).toHaveLength(0)
  })

  it('should parse two components with an arrow', () => {
    const diagram = parsePlantUml('[A] --> [B]')

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.blocks).toEqual(
      expect.arrayContaining([
        { id: 'A', label: 'A', type: 'component' },
        { id: 'B', label: 'B', type: 'component' },
      ]),
    )
    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      arrowType: '-->',
    })
  })

  it('should parse arrow with label', () => {
    const diagram = parsePlantUml('[A] --> [B] : uses')

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      label: 'uses',
      arrowType: '-->',
    })
  })

  it('should parse multiple connections', () => {
    const input = `
      [A] --> [B]
      [B] --> [C]
      [A] --> [C]
    `
    const diagram = parsePlantUml(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.connections).toHaveLength(3)
  })

  it('should parse class diagram blocks', () => {
    const diagram = parsePlantUml('class Foo')

    expect(diagram.blocks).toHaveLength(1)
    expect(diagram.blocks[0]).toEqual({
      id: 'Foo',
      label: 'Foo',
      type: 'class',
    })
  })

  it('should parse actor', () => {
    const diagram = parsePlantUml('actor User')

    expect(diagram.blocks).toHaveLength(1)
    expect(diagram.blocks[0]).toEqual({
      id: 'User',
      label: 'User',
      type: 'actor',
    })
  })

  it('should parse usecase with alias', () => {
    const diagram = parsePlantUml('usecase "Login" as UC1')

    expect(diagram.blocks).toHaveLength(1)
    expect(diagram.blocks[0]).toEqual({
      id: 'UC1',
      label: 'Login',
      type: 'usecase',
    })
  })

  it('should strip @startuml / @enduml wrappers', () => {
    const input = `
      @startuml
      [A] --> [B]
      @enduml
    `
    const diagram = parsePlantUml(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.connections).toHaveLength(1)
  })

  it('should parse dashed arrows', () => {
    const diagram = parsePlantUml('[A] ..> [B]')

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.arrowType).toBe('..>')
  })

  it('should parse bidirectional/plain lines', () => {
    const diagram = parsePlantUml('[A] -- [B]')

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.arrowType).toBe('--')
  })

  it('should parse reverse arrows', () => {
    const diagram = parsePlantUml('[A] <-- [B]')

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      arrowType: '<--',
    })
  })

  it('should assign unique IDs to blocks by their label', () => {
    const input = `
      [Service A] --> [Service B]
      [Service B] --> [Service C]
    `
    const diagram = parsePlantUml(input)

    const ids = diagram.blocks.map((b) => b.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should deduplicate blocks referenced in multiple connections', () => {
    const input = `
      [A] --> [B]
      [A] --> [C]
      [B] --> [C]
    `
    const diagram = parsePlantUml(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.blocks.filter((b) => b.id === 'A')).toHaveLength(1)
    expect(diagram.blocks.filter((b) => b.id === 'C')).toHaveLength(1)
  })

  // ── Pseudo-state [*] ─────────────────────────────────────────

  it('should split [*] as source into a unique start pseudo-state', () => {
    const diagram = parsePlantUml('[*] --> Idle')

    // Should NOT create a block with id "*"
    expect(diagram.blocks.find((b) => b.id === '*')).toBeUndefined()

    const startBlock = diagram.blocks.find((b) => b.type === 'pseudostate')
    expect(startBlock).toBeDefined()
    expect(startBlock!.id).toContain('start')
    expect(diagram.connections[0]!.fromId).toBe(startBlock!.id)
    expect(diagram.connections[0]!.toId).toBe('Idle')
  })

  it('should split [*] as target into a unique end pseudo-state', () => {
    const diagram = parsePlantUml('Success --> [*]')

    const endBlock = diagram.blocks.find((b) => b.type === 'pseudostate' && b.id.includes('end'))
    expect(endBlock).toBeDefined()
    expect(diagram.connections[0]!.toId).toBe(endBlock!.id)
  })

  it('should create separate pseudo-states for each [*] occurrence', () => {
    const input = `
      [*] --> Idle
      Success --> [*]
      Error --> [*]
    `
    const diagram = parsePlantUml(input)

    const pseudos = diagram.blocks.filter((b) => b.type === 'pseudostate')
    // 1 start + 2 ends = 3 unique pseudo-states
    expect(pseudos).toHaveLength(3)
    const ids = pseudos.map((b) => b.id)
    expect(new Set(ids).size).toBe(3) // all unique
  })

  // ── Composite states ───────────────────────────────────────────

  it('should parse a simple composite state with children', () => {
    const input = `
      state Processing {
        [*] --> Validating
        Validating --> Executing
        Executing --> [*]
      }
    `
    const diagram = parsePlantUml(input)

    const processing = diagram.blocks.find((b) => b.id === 'Processing')
    expect(processing).toBeDefined()
    expect(processing!.type).toBe('state')
    expect(processing!.children).toBeDefined()
    expect(processing!.children!.length).toBeGreaterThanOrEqual(2)

    // Inner connections should be on childConnections, not top-level
    expect(processing!.childConnections).toBeDefined()
    expect(processing!.childConnections!.length).toBe(3)

    // Validating and Executing should be children, not top-level blocks
    expect(diagram.blocks.find((b) => b.id === 'Validating')).toBeUndefined()
    expect(diagram.blocks.find((b) => b.id === 'Executing')).toBeUndefined()
  })

  it('should parse composite state alongside top-level connections', () => {
    const input = `
      [*] --> Idle
      Idle --> Processing : start

      state Processing {
        [*] --> Validating
        Validating --> Executing
        Executing --> [*]
      }

      Processing --> Success : done
      Success --> [*]
    `
    const diagram = parsePlantUml(input)

    // Processing should be a top-level composite state
    const processing = diagram.blocks.find((b) => b.id === 'Processing')
    expect(processing).toBeDefined()
    expect(processing!.type).toBe('state')
    expect(processing!.children).toBeDefined()
    expect(processing!.children!.length).toBeGreaterThanOrEqual(2)

    // Top-level connections should reference Processing by id
    const topConns = diagram.connections
    expect(topConns.some((c) => c.toId === 'Processing')).toBe(true)
    expect(topConns.some((c) => c.fromId === 'Processing')).toBe(true)

    // Inner blocks should NOT appear at top level
    expect(diagram.blocks.find((b) => b.id === 'Validating')).toBeUndefined()
    expect(diagram.blocks.find((b) => b.id === 'Executing')).toBeUndefined()
  })

  it('should handle state keyword for simple (non-composite) states', () => {
    const input = `
      state Idle
      state Processing
      Idle --> Processing
    `
    const diagram = parsePlantUml(input)

    expect(diagram.blocks.find((b) => b.id === 'Idle')?.type).toBe('state')
    expect(diagram.blocks.find((b) => b.id === 'Processing')?.type).toBe('state')
    expect(diagram.connections).toHaveLength(1)
  })

  it('should assign globally unique pseudo-state IDs across scopes', () => {
    const input = `
      [*] --> Idle
      Idle --> Processing : start

      state Processing {
        [*] --> Validating
        Validating --> Executing
        Executing --> [*]
      }

      Processing --> Success : done
      Success --> [*]
    `
    const diagram = parsePlantUml(input)

    const topLevelIds = diagram.blocks.map((b) => b.id)
    const processing = diagram.blocks.find((b) => b.id === 'Processing')!
    const childIds = processing.children!.map((c) => c.id)

    // No ID collisions between top-level and child pseudo-states
    expect(overlapping(topLevelIds, childIds)).toHaveLength(0)

    // All pseudo-state IDs across both scopes should be unique
    const allPseudoIds = [...pseudoIds(topLevelIds), ...pseudoIds(childIds)]
    expect(new Set(allPseudoIds).size).toBe(allPseudoIds.length)
  })

  it('should assign unique pseudo-state IDs across multiple sibling composites', () => {
    const input = `
      [*] --> Idle
      Idle --> Processing : start
      Idle --> Reviewing : review

      state Processing {
        [*] --> Validating
        Validating --> [*]
      }

      state Reviewing {
        [*] --> Checking
        Checking --> [*]
      }

      Processing --> Done
      Reviewing --> Done
      Done --> [*]
    `
    const diagram = parsePlantUml(input)

    const topLevelIds = diagram.blocks.map((b) => b.id)
    const processing = diagram.blocks.find((b) => b.id === 'Processing')!
    const reviewing = diagram.blocks.find((b) => b.id === 'Reviewing')!
    const processingChildIds = processing.children!.map((c) => c.id)
    const reviewingChildIds = reviewing.children!.map((c) => c.id)

    // Collect all pseudo-state IDs across all scopes
    const allPseudoIds = [
      ...pseudoIds(topLevelIds),
      ...pseudoIds(processingChildIds),
      ...pseudoIds(reviewingChildIds),
    ]

    // Exactly 6: 1 top start, 1 top end, 2 child starts, 2 child ends
    expect(allPseudoIds).toHaveLength(6)
    expect(new Set(allPseudoIds).size).toBe(allPseudoIds.length)

    // No overlap between any pair of scopes
    expect(overlapping(topLevelIds, processingChildIds)).toHaveLength(0)
    expect(overlapping(topLevelIds, reviewingChildIds)).toHaveLength(0)
    expect(overlapping(processingChildIds, reviewingChildIds)).toHaveLength(0)
  })

  it('should assign unique pseudo-state IDs in nested composite states', () => {
    const input = `
      [*] --> Outer

      state Outer {
        [*] --> Middle

        state Middle {
          [*] --> Inner
          Inner --> [*]
        }

        Middle --> [*]
      }

      Outer --> [*]
    `
    const diagram = parsePlantUml(input)

    const topLevelIds = diagram.blocks.map((b) => b.id)
    const outer = diagram.blocks.find((b) => b.id === 'Outer')!
    expect(outer.children).toBeDefined()
    const outerChildIds = outer.children!.map((c) => c.id)
    const middle = outer.children!.find((c) => c.id === 'Middle')!
    expect(middle.children).toBeDefined()
    const middleChildIds = middle.children!.map((c) => c.id)

    // Collect all pseudo-state IDs across all three levels
    const allPseudoIds = [
      ...pseudoIds(topLevelIds),
      ...pseudoIds(outerChildIds),
      ...pseudoIds(middleChildIds),
    ]

    // Exactly 6: 1 top start, 1 top end, 1 outer start, 1 outer end, 1 middle start, 1 middle end
    expect(allPseudoIds).toHaveLength(6)
    expect(new Set(allPseudoIds).size).toBe(allPseudoIds.length)

    // No overlap between any pair of scopes
    expect(overlapping(topLevelIds, outerChildIds)).toHaveLength(0)
    expect(overlapping(topLevelIds, middleChildIds)).toHaveLength(0)
    expect(overlapping(outerChildIds, middleChildIds)).toHaveLength(0)
  })

  // ── Edge Cases ──────────────────────────────────────────────

  it('should handle [*] --> [*] as distinct start and end pseudo-states', () => {
    const diagram = parsePlantUml('[*] --> [*]')
    const pseudos = diagram.blocks.filter((b) => b.type === 'pseudostate')

    expect(pseudos).toHaveLength(2)
    expect(pseudos[0]!.id).not.toBe(pseudos[1]!.id)
    expect(pseudos.some((b) => b.id.includes('start'))).toBe(true)
    expect(pseudos.some((b) => b.id.includes('end'))).toBe(true)
    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.fromId).toMatch(/__start/)
    expect(diagram.connections[0]!.toId).toMatch(/__end/)
  })

  it('should ignore blank lines and comments', () => {
    const input = `
      ' this is a comment
      [A] --> [B]

      ' another comment
    `
    const diagram = parsePlantUml(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.connections).toHaveLength(1)
  })

  it('should handle whitespace variations in arrows', () => {
    const input = '[A]-->[B]'
    const diagram = parsePlantUml(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.fromId).toBe('A')
    expect(diagram.connections[0]!.toId).toBe('B')
  })

  it('should return empty diagram for empty input', () => {
    const diagram = parsePlantUml('')

    expect(diagram.blocks).toHaveLength(0)
    expect(diagram.connections).toHaveLength(0)
  })

  it('should handle quoted block names', () => {
    const diagram = parsePlantUml('["My Component"] --> ["Other Component"]')

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.blocks).toEqual(
      expect.arrayContaining([
        { id: 'My Component', label: 'My Component', type: 'component' },
        { id: 'Other Component', label: 'Other Component', type: 'component' },
      ]),
    )
  })

  // ── Error Scenarios ─────────────────────────────────────────

  it('should handle malformed lines gracefully (skip them)', () => {
    const input = `
      [A] --> [B]
      this is not valid plantuml ???
      [B] --> [C]
    `
    const diagram = parsePlantUml(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.connections).toHaveLength(2)
  })

  it('should handle input with only @startuml/@enduml (empty diagram)', () => {
    const input = `
      @startuml
      @enduml
    `
    const diagram = parsePlantUml(input)

    expect(diagram.blocks).toHaveLength(0)
    expect(diagram.connections).toHaveLength(0)
  })
})
