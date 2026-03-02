import { describe, it, expect } from 'vitest'
import { parseMermaid } from '../parser'

/** Extracts pseudo-state IDs (start/end) from a list of block IDs */
const pseudoIds = (ids: string[]) =>
  ids.filter((id) => id.includes('__start') || id.includes('__end'))

/** Returns IDs present in both arrays (i.e. collisions) */
const overlapping = (a: string[], b: string[]) => a.filter((id) => b.includes(id))

describe('parseMermaid', () => {
  // ── Flowchart / Graph ──────────────────────────────────────

  it('should parse a flowchart with two nodes and an arrow', () => {
    const input = `graph TD
    A[Web App] --> B[API Gateway]`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.blocks).toEqual(
      expect.arrayContaining([
        { id: 'A', label: 'Web App', type: 'component' },
        { id: 'B', label: 'API Gateway', type: 'component' },
      ]),
    )
    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      arrowType: '-->',
    })
  })

  it('should parse multiple flowchart connections', () => {
    const input = `graph TD
    A[Server] --> B[Database]
    A --> C[Cache]
    B --> C`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.connections).toHaveLength(3)
  })

  it('should parse flowchart with labeled arrow using pipe syntax', () => {
    const input = `graph TD
    A --> |uses| B`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      arrowType: '-->',
      label: 'uses',
    })
  })

  it('should parse flowchart with labeled arrow using text syntax', () => {
    const input = `graph TD
    A -- uses --> B`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      arrowType: '-->',
      label: 'uses',
    })
  })

  it('should parse flowchart with colon label syntax', () => {
    const input = `graph TD
    A --> B : uses`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      arrowType: '-->',
      label: 'uses',
    })
  })

  it('should accept "flowchart" keyword as well as "graph"', () => {
    const input = `flowchart LR
    A[Service] --> B[DB]`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.connections).toHaveLength(1)
  })

  it('should map round bracket nodes to usecase type', () => {
    const input = `graph TD
    A(Login)`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(1)
    expect(diagram.blocks[0]).toEqual({
      id: 'A',
      label: 'Login',
      type: 'usecase',
    })
  })

  it('should map curly bracket nodes to package type', () => {
    const input = `graph TD
    A{Decision}`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(1)
    expect(diagram.blocks[0]).toEqual({
      id: 'A',
      label: 'Decision',
      type: 'package',
    })
  })

  it('should deduplicate blocks referenced in multiple connections', () => {
    const input = `graph TD
    A --> B
    A --> C
    B --> C`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.blocks.filter((b) => b.id === 'A')).toHaveLength(1)
    expect(diagram.blocks.filter((b) => b.id === 'C')).toHaveLength(1)
  })

  it('should assign unique IDs to blocks', () => {
    const input = `graph TD
    A[Service A] --> B[Service B]
    B --> C[Service C]`
    const diagram = parseMermaid(input)

    const ids = diagram.blocks.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('should upgrade block type when shape info is encountered later', () => {
    const input = `graph TD
    A --> B
    A[Web App] --> C`
    const diagram = parseMermaid(input)

    // A was first seen as plain ID (component), then with shape [Web App]
    const blockA = diagram.blocks.find((b) => b.id === 'A')
    expect(blockA).toBeDefined()
    expect(blockA!.label).toBe('Web App')
  })

  // ── State Diagram ──────────────────────────────────────────

  it('should parse state diagram with transitions', () => {
    const input = `stateDiagram-v2
    Idle --> Processing
    Processing --> Done`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.blocks[0]!.type).toBe('state')
    expect(diagram.connections).toHaveLength(2)
  })

  it('should parse state diagram with labeled transitions', () => {
    const input = `stateDiagram-v2
    Idle --> Processing : start`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'Idle',
      toId: 'Processing',
      arrowType: '-->',
      label: 'start',
    })
  })

  it('should parse [*] pseudo-states in state diagrams', () => {
    const input = `stateDiagram-v2
    [*] --> Idle
    Done --> [*]`
    const diagram = parseMermaid(input)

    const pseudos = diagram.blocks.filter((b) => b.type === 'pseudostate')
    expect(pseudos).toHaveLength(2)
    expect(pseudos.some((b) => b.id.includes('start'))).toBe(true)
    expect(pseudos.some((b) => b.id.includes('end'))).toBe(true)
  })

  it('should create separate pseudo-states for each [*] occurrence', () => {
    const input = `stateDiagram-v2
    [*] --> Idle
    Success --> [*]
    Error --> [*]`
    const diagram = parseMermaid(input)

    const pseudos = diagram.blocks.filter((b) => b.type === 'pseudostate')
    expect(pseudos).toHaveLength(3)
    const ids = pseudos.map((b) => b.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('should handle [*] --> [*] as distinct start and end pseudo-states', () => {
    const input = `stateDiagram-v2
    [*] --> [*]`
    const diagram = parseMermaid(input)

    const pseudos = diagram.blocks.filter((b) => b.type === 'pseudostate')
    expect(pseudos).toHaveLength(2)
    expect(pseudos[0]!.id).not.toBe(pseudos[1]!.id)
    expect(pseudos.some((b) => b.id.includes('start'))).toBe(true)
    expect(pseudos.some((b) => b.id.includes('end'))).toBe(true)
    expect(diagram.connections[0]!.fromId).toMatch(/__start/)
    expect(diagram.connections[0]!.toId).toMatch(/__end/)
  })

  // ── Composite States ───────────────────────────────────────

  it('should parse a simple composite state with children', () => {
    const input = `stateDiagram-v2
    state Processing {
      [*] --> Validating
      Validating --> Executing
      Executing --> [*]
    }`
    const diagram = parseMermaid(input)

    const processing = diagram.blocks.find((b) => b.id === 'Processing')
    expect(processing).toBeDefined()
    expect(processing!.type).toBe('state')
    expect(processing!.children).toBeDefined()
    expect(processing!.children!.length).toBeGreaterThanOrEqual(2)
    expect(processing!.childConnections).toBeDefined()
    expect(processing!.childConnections!.length).toBe(3)

    // Inner blocks should NOT appear at top level
    expect(diagram.blocks.find((b) => b.id === 'Validating')).toBeUndefined()
    expect(diagram.blocks.find((b) => b.id === 'Executing')).toBeUndefined()
  })

  it('should parse composite state with quoted name', () => {
    const input = `stateDiagram-v2
    state "Long Processing Name" as Processing {
      [*] --> Validating
      Validating --> [*]
    }`
    const diagram = parseMermaid(input)

    const processing = diagram.blocks.find((b) => b.id === 'Processing')
    expect(processing).toBeDefined()
    expect(processing!.label).toBe('Long Processing Name')
    expect(processing!.children).toBeDefined()
  })

  it('should parse composite state alongside top-level connections', () => {
    const input = `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : start

    state Processing {
      [*] --> Validating
      Validating --> Executing
      Executing --> [*]
    }

    Processing --> Success : done
    Success --> [*]`
    const diagram = parseMermaid(input)

    const processing = diagram.blocks.find((b) => b.id === 'Processing')
    expect(processing).toBeDefined()
    expect(processing!.type).toBe('state')
    expect(processing!.children).toBeDefined()
    expect(processing!.children!.length).toBeGreaterThanOrEqual(2)

    const topConns = diagram.connections
    expect(topConns.some((c) => c.toId === 'Processing')).toBe(true)
    expect(topConns.some((c) => c.fromId === 'Processing')).toBe(true)

    expect(diagram.blocks.find((b) => b.id === 'Validating')).toBeUndefined()
    expect(diagram.blocks.find((b) => b.id === 'Executing')).toBeUndefined()
  })

  it('should assign globally unique pseudo-state IDs across scopes', () => {
    const input = `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : start

    state Processing {
      [*] --> Validating
      Validating --> Executing
      Executing --> [*]
    }

    Processing --> Success : done
    Success --> [*]`
    const diagram = parseMermaid(input)

    const topLevelIds = diagram.blocks.map((b) => b.id)
    const processing = diagram.blocks.find((b) => b.id === 'Processing')!
    const childIds = processing.children!.map((c) => c.id)

    expect(overlapping(topLevelIds, childIds)).toHaveLength(0)

    const allPseudoIds = [...pseudoIds(topLevelIds), ...pseudoIds(childIds)]
    expect(new Set(allPseudoIds).size).toBe(allPseudoIds.length)
  })

  it('should assign unique pseudo-state IDs across sibling composites', () => {
    const input = `stateDiagram-v2
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
    Done --> [*]`
    const diagram = parseMermaid(input)

    const topLevelIds = diagram.blocks.map((b) => b.id)
    const processing = diagram.blocks.find((b) => b.id === 'Processing')!
    const reviewing = diagram.blocks.find((b) => b.id === 'Reviewing')!
    const processingChildIds = processing.children!.map((c) => c.id)
    const reviewingChildIds = reviewing.children!.map((c) => c.id)

    const allPseudoIds = [
      ...pseudoIds(topLevelIds),
      ...pseudoIds(processingChildIds),
      ...pseudoIds(reviewingChildIds),
    ]

    expect(allPseudoIds).toHaveLength(6)
    expect(new Set(allPseudoIds).size).toBe(allPseudoIds.length)

    expect(overlapping(topLevelIds, processingChildIds)).toHaveLength(0)
    expect(overlapping(topLevelIds, reviewingChildIds)).toHaveLength(0)
    expect(overlapping(processingChildIds, reviewingChildIds)).toHaveLength(0)
  })

  it('should assign unique pseudo-state IDs in nested composite states', () => {
    const input = `stateDiagram-v2
    [*] --> Outer

    state Outer {
      [*] --> Middle

      state Middle {
        [*] --> Inner
        Inner --> [*]
      }

      Middle --> [*]
    }

    Outer --> [*]`
    const diagram = parseMermaid(input)

    const topLevelIds = diagram.blocks.map((b) => b.id)
    const outer = diagram.blocks.find((b) => b.id === 'Outer')!
    expect(outer.children).toBeDefined()
    const outerChildIds = outer.children!.map((c) => c.id)
    const middle = outer.children!.find((c) => c.id === 'Middle')!
    expect(middle.children).toBeDefined()
    const middleChildIds = middle.children!.map((c) => c.id)

    const allPseudoIds = [
      ...pseudoIds(topLevelIds),
      ...pseudoIds(outerChildIds),
      ...pseudoIds(middleChildIds),
    ]

    expect(allPseudoIds).toHaveLength(6)
    expect(new Set(allPseudoIds).size).toBe(allPseudoIds.length)

    expect(overlapping(topLevelIds, outerChildIds)).toHaveLength(0)
    expect(overlapping(topLevelIds, middleChildIds)).toHaveLength(0)
    expect(overlapping(outerChildIds, middleChildIds)).toHaveLength(0)
  })

  // ── Class Diagram ──────────────────────────────────────────

  it('should parse class diagram with arrow', () => {
    const input = `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.blocks.every((b) => b.type === 'class')).toBe(true)
    expect(diagram.connections).toHaveLength(2)
  })

  it('should parse class declaration and skip body', () => {
    const input = `classDiagram
    class Animal {
      +String name
      +makeSound()
    }
    Animal <|-- Duck`
    const diagram = parseMermaid(input)

    const animal = diagram.blocks.find((b) => b.id === 'Animal')
    expect(animal).toBeDefined()
    expect(animal!.type).toBe('class')
    expect(diagram.connections).toHaveLength(1)
  })

  it('should parse class diagram with labeled relationship', () => {
    const input = `classDiagram
    Animal --> Habitat : lives in`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'Animal',
      toId: 'Habitat',
      arrowType: '-->',
      label: 'lives in',
    })
  })

  // ── Edge Cases ─────────────────────────────────────────────

  it('should ignore blank lines and comments', () => {
    const input = `graph TD
    %% this is a comment
    A --> B

    %% another comment`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.connections).toHaveLength(1)
  })

  it('should return empty diagram for empty input', () => {
    const diagram = parseMermaid('')
    expect(diagram.blocks).toHaveLength(0)
    expect(diagram.connections).toHaveLength(0)
  })

  it('should handle malformed lines gracefully (skip them)', () => {
    const input = `graph TD
    A --> B
    this is not valid mermaid ???
    B --> C`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.connections).toHaveLength(2)
  })

  it('should handle input with only header line (empty diagram)', () => {
    const diagram = parseMermaid('graph TD')
    expect(diagram.blocks).toHaveLength(0)
    expect(diagram.connections).toHaveLength(0)
  })

  it('should treat unknown diagram type as generic and still parse arrows', () => {
    const input = `A --> B
    B --> C`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.connections).toHaveLength(2)
  })

  // ── Arrow Normalization ────────────────────────────────────

  it('should normalize thick arrows to standard arrow types', () => {
    const input = `graph TD
    A ==> B`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.arrowType).toBe('-->')
  })

  it('should parse plain line connections', () => {
    const input = `graph TD
    A -- B`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.arrowType).toBe('--')
  })

  it('should parse dotted arrows in class diagrams', () => {
    const input = `classDiagram
    Animal ..|> Comparable`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.arrowType).toBe('..>')
  })

  it('should normalize <|-- class arrow to <--', () => {
    const input = `classDiagram
    Animal <|-- Duck`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.arrowType).toBe('<--')
    expect(diagram.connections[0]!.fromId).toBe('Animal')
    expect(diagram.connections[0]!.toId).toBe('Duck')
  })

  it('should normalize --|> class arrow to -->', () => {
    const input = `classDiagram
    Duck --|> Animal`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.arrowType).toBe('-->')
    expect(diagram.connections[0]!.fromId).toBe('Duck')
    expect(diagram.connections[0]!.toId).toBe('Animal')
  })

  it('should support hyphenated node IDs', () => {
    const input = `graph TD
    my-service --> auth-service
    auth-service --> user-db`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.blocks.map((b) => b.id).sort()).toEqual(['auth-service', 'my-service', 'user-db'])
    expect(diagram.connections).toHaveLength(2)
  })

  it('should support hyphenated IDs with shape notation', () => {
    const input = `graph TD
    my-app[My Application] --> api-gw(API Gateway)`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    const myApp = diagram.blocks.find((b) => b.id === 'my-app')
    expect(myApp).toBeDefined()
    expect(myApp!.label).toBe('My Application')
    expect(myApp!.type).toBe('component')

    const apiGw = diagram.blocks.find((b) => b.id === 'api-gw')
    expect(apiGw).toBeDefined()
    expect(apiGw!.label).toBe('API Gateway')
    expect(apiGw!.type).toBe('usecase')
  })

  it('should skip lines where arrow has no spaces (no-space arrows)', () => {
    const input = `graph TD
    A-->B
    C --> D`
    const diagram = parseMermaid(input)

    // A-->B has no spaces around the arrow, so splitByArrowToken won't find it
    // (Mermaid itself requires spaces around arrows in most cases)
    // Only C --> D should parse
    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.fromId).toBe('C')
    expect(diagram.connections[0]!.toId).toBe('D')
  })

  it('should not support chained arrows on one line (known limitation)', () => {
    const input = `graph TD
    A --> B --> C`
    const diagram = parseMermaid(input)

    // Chained arrows are not yet supported; the rest after the first arrow
    // becomes "B --> C" which fails parseBlockRef as a single token
    expect(diagram.connections).toHaveLength(0)
  })

  it('should handle class with unterminated body gracefully', () => {
    const input = `classDiagram
    class Animal {
      +String name
      +makeSound()`
    const diagram = parseMermaid(input)

    // Body never closed, but parser should not crash
    const animal = diagram.blocks.find((b) => b.id === 'Animal')
    expect(animal).toBeDefined()
    expect(animal!.type).toBe('class')
  })

  // ── ER Diagram ──────────────────────────────────────────────

  it('should parse ER diagram with a simple identifying relationship', () => {
    const input = `erDiagram
    CUSTOMER ||--o{ ORDER : places`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.blocks.every((b) => b.type === 'entity')).toBe(true)
    expect(diagram.blocks.find((b) => b.id === 'CUSTOMER')).toBeDefined()
    expect(diagram.blocks.find((b) => b.id === 'ORDER')).toBeDefined()
    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'CUSTOMER',
      toId: 'ORDER',
      arrowType: '--',
      label: 'places',
    })
  })

  it('should parse ER diagram with non-identifying (dotted) relationship', () => {
    const input = `erDiagram
    PERSON }|..|{ CAR : drives`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]).toEqual({
      fromId: 'PERSON',
      toId: 'CAR',
      arrowType: '..',
      label: 'drives',
    })
  })

  it('should parse multiple ER relationships', () => {
    const input = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(4)
    expect(diagram.connections).toHaveLength(3)
    const ids = diagram.blocks.map((b) => b.id).sort()
    expect(ids).toEqual(['CUSTOMER', 'DELIVERY-ADDRESS', 'LINE-ITEM', 'ORDER'])
  })

  it('should parse ER entity with attribute block (skip attributes)', () => {
    const input = `erDiagram
    CUSTOMER {
      string name
      int age
    }
    CUSTOMER ||--o{ ORDER : places`
    const diagram = parseMermaid(input)

    const customer = diagram.blocks.find((b) => b.id === 'CUSTOMER')
    expect(customer).toBeDefined()
    expect(customer!.type).toBe('entity')
    expect(diagram.connections).toHaveLength(1)
  })

  it('should parse standalone entity without relationships', () => {
    const input = `erDiagram
    CUSTOMER`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(1)
    expect(diagram.blocks[0]).toEqual({
      id: 'CUSTOMER',
      label: 'CUSTOMER',
      type: 'entity',
    })
    expect(diagram.connections).toHaveLength(0)
  })

  it('should parse ER diagram with quoted relationship label', () => {
    const input = `erDiagram
    CUSTOMER ||--o{ ORDER : "places orders for"`
    const diagram = parseMermaid(input)

    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.label).toBe('places orders for')
  })

  it('should deduplicate entities across relationships and attribute blocks', () => {
    const input = `erDiagram
    CUSTOMER {
      string name
    }
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains`
    const diagram = parseMermaid(input)

    expect(diagram.blocks.filter((b) => b.id === 'CUSTOMER')).toHaveLength(1)
    expect(diagram.blocks).toHaveLength(3)
  })

  it('should parse ER diagram with all cardinality types', () => {
    const input = `erDiagram
    A ||--|| B : "exactly one to exactly one"
    C |o--o| D : "zero or one to zero or one"
    E }|--|{ F : "one or more to one or more"
    G }o--o{ H : "zero or more to zero or more"`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(8)
    expect(diagram.connections).toHaveLength(4)
    // All identifying (--) relationships
    expect(diagram.connections.every((c) => c.arrowType === '--')).toBe(true)
  })

  it('should handle ER entity with unterminated attribute block gracefully', () => {
    const input = `erDiagram
    CUSTOMER {
      string name
      int age`
    const diagram = parseMermaid(input)

    // Block never closed, but parser should not crash
    const customer = diagram.blocks.find((b) => b.id === 'CUSTOMER')
    expect(customer).toBeDefined()
    expect(customer!.type).toBe('entity')
  })

  it('should ignore blank lines and comments in ER diagrams', () => {
    const input = `erDiagram
    %% This is a comment
    CUSTOMER ||--o{ ORDER : places

    %% Another comment
    ORDER ||--|{ PRODUCT : contains`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.connections).toHaveLength(2)
  })

  it('should return empty diagram for erDiagram with only header', () => {
    const diagram = parseMermaid('erDiagram')
    expect(diagram.blocks).toHaveLength(0)
    expect(diagram.connections).toHaveLength(0)
  })

  it('should parse ER diagram with hyphenated entity names', () => {
    const input = `erDiagram
    ORDER-ITEM ||--|| PRODUCT-SKU : references`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    expect(diagram.blocks.find((b) => b.id === 'ORDER-ITEM')).toBeDefined()
    expect(diagram.blocks.find((b) => b.id === 'PRODUCT-SKU')).toBeDefined()
  })

  it('should parse ER entity name aliases with square brackets', () => {
    const input = `erDiagram
    p["Customer"] ||--o{ o["Order"] : places`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    const customer = diagram.blocks.find((b) => b.id === 'p')
    expect(customer).toBeDefined()
    expect(customer!.label).toBe('Customer')
    const order = diagram.blocks.find((b) => b.id === 'o')
    expect(order).toBeDefined()
    expect(order!.label).toBe('Order')
  })

  it('should parse ER diagram with quoted entity names in relationships', () => {
    const input = `erDiagram
    "Customer Name" ||--o{ "Order Record" : places`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(2)
    const customer = diagram.blocks.find((b) => b.id === 'Customer Name')
    expect(customer).toBeDefined()
    expect(customer!.label).toBe('Customer Name')
    const order = diagram.blocks.find((b) => b.id === 'Order Record')
    expect(order).toBeDefined()
    expect(order!.label).toBe('Order Record')
    expect(diagram.connections).toHaveLength(1)
    expect(diagram.connections[0]!.label).toBe('places')
  })

  it('should parse ER diagram with mixed entity blocks and relationships', () => {
    const input = `erDiagram
    CUSTOMER {
      string name PK
      string email
    }
    ORDER {
      int id PK
      date created
    }
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    LINE-ITEM {
      int quantity
      float price
    }`
    const diagram = parseMermaid(input)

    expect(diagram.blocks).toHaveLength(3)
    expect(diagram.connections).toHaveLength(2)
    expect(diagram.blocks.every((b) => b.type === 'entity')).toBe(true)
  })
})
