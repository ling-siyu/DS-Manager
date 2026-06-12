import { useState } from 'react';
import type { CatNode } from '../lib/categoryTree';

// Collapsible category tree shown under "Components" in the left nav. Clicking a
// row filters the canvas to that category (+ its descendants); the caret on a
// parent expands/collapses its children.

function CategoryRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: CatNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const active = selected === node.path;

  return (
    <>
      <div className={`cat-item${active ? ' active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
        {hasChildren ? (
          <button
            className="cat-caret"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="cat-caret-spacer" />
        )}
        <button className="cat-label" onClick={() => onSelect(node.path)}>
          <span className="cat-name">{node.name}</span>
          <span className="cat-count">{node.count}</span>
        </button>
      </div>
      {hasChildren && open && node.children.map((child) => (
        <CategoryRow key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </>
  );
}

export default function CategoryNav({
  nodes,
  selected,
  onSelect,
}: {
  nodes: CatNode[];
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  return (
    <div className="cat-tree">
      <div className={`cat-item${selected === null ? ' active' : ''}`} style={{ paddingLeft: 8 }}>
        <span className="cat-caret-spacer" />
        <button className="cat-label" onClick={() => onSelect(null)}>
          <span className="cat-name">All</span>
        </button>
      </div>
      {nodes.map((n) => (
        <CategoryRow key={n.path} node={n} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}
