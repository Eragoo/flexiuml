import { describe, it, expect } from 'vitest'
import { parsePlantUml } from '../parser'

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

  // ── Edge Cases ──────────────────────────────────────────────

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
