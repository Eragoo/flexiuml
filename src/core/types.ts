export type BlockType = 'component' | 'class' | 'actor' | 'usecase' | 'package'

export type ArrowType = '-->' | '<--' | '--' | '..' | '..>' | '<..'

export interface Block {
  id: string
  label: string
  type: BlockType
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
}

export interface LayoutDiagram {
  blocks: LayoutBlock[]
  connections: Connection[]
}
