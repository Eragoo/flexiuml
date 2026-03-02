export type BlockType = 'component' | 'class' | 'actor' | 'usecase' | 'package' | 'state' | 'pseudostate'

export type ArrowType = '-->' | '<--' | '--' | '..' | '..>' | '<..'

export interface Block {
  id: string
  label: string
  type: BlockType
  /** Child blocks for composite states (e.g. state X { ... }) */
  children?: Block[]
  /** Connections between child blocks inside a composite state */
  childConnections?: Connection[]
}

export interface Connection {
  fromId: string
  toId: string
  label?: string
  arrowType: ArrowType
}

export interface Diagram {
  blocks: Block[]
  connections: Connection[]
}

export interface LayoutBlock extends Block {
  x: number
  y: number
  width: number
  height: number
  /** Laid-out child blocks (for composite states) */
  children?: LayoutBlock[]
  /** Connections between children (preserved for rendering) */
  childConnections?: Connection[]
}

export interface LayoutDiagram {
  blocks: LayoutBlock[]
  connections: Connection[]
}
