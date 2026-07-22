'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { MermaidBlock } from './MermaidBlock';

/**
 * MermaidNode — Tiptap custom node wiring MermaidBlock into the editor's
 * node graph. Per ims-experience/view-designs.md §13.5.
 *
 * Architect fix (2026-07-22, P2 Session 3 gap closure — see
 * .kiro/evidence/ims-experience/kiro-bounced-ims-experience for context):
 * MermaidBlock.tsx was a complete, working standalone component but was
 * never mounted as a Tiptap node — §13.5 described diagram rendering as
 * delivered when it was unreachable by any real editor flow. This file is
 * that missing mount point: an atom block node whose sole attribute
 * (`source`) is the mermaid diagram source, rendered via ReactNodeViewRenderer.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaidBlock: {
      insertMermaidBlock: (source?: string) => ReturnType;
    };
  }
}

const DEFAULT_SOURCE = 'graph TD\n  A[Start] --> B[End]';

function MermaidNodeView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper data-type="mermaid-block">
      <MermaidBlock
        source={(node.attrs.source as string) ?? DEFAULT_SOURCE}
        onUpdate={(newSource) => updateAttributes({ source: newSource })}
      />
    </NodeViewWrapper>
  );
}

export const MermaidNode = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      source: {
        default: DEFAULT_SOURCE,
        parseHTML: (element) => element.getAttribute('data-source'),
        renderHTML: (attributes) => ({ 'data-source': attributes.source as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },

  addCommands() {
    return {
      insertMermaidBlock:
        (source?: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { source: source ?? DEFAULT_SOURCE },
          }),
    };
  },
});
