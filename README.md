# FlexiMaid

A Vue 3 + TypeScript web app that lets users paste **Mermaid** diagram text and visually rearrange diagram blocks on an HTML5 Canvas via drag-and-drop.

## Supported Diagram Types

- **Flowchart** (`graph TD` / `flowchart LR`) - nodes, arrows, labels, shapes
- **State Diagram** (`stateDiagram-v2`) - transitions, pseudo-states, composite states
- **Class Diagram** (`classDiagram`) - classes, relationships, body skipping
- **ER Diagram** (`erDiagram`) - entities, relationships with cardinality, attributes

## Next Steps - Planned Diagram Types

The following Mermaid diagram types are good candidates for drag-and-rearrange and are planned for future implementation:

- **Block Diagram** - explicitly about author-controlled layout; aligns perfectly with drag-and-drop
- **Architecture Diagram** - groups, services, junctions, edges; groups map to composite blocks

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```
