import type { ReactNode } from 'react';
import type { GalleryToken } from '../types';
import type { Theme } from '../App';
import type { TokenCategory } from '../lib/tokenKind';
import { kindOf } from '../lib/tokenKind';
import { groupBy, slug, SwatchBoard, TokenList } from './parts';
import { FamiliesBlock, TypeScaleBlock, WeightsBlock, TrackingBlock, SemanticBlock } from './typography';

export interface Section {
  id: string;
  title: string;
  count: number;
  node: ReactNode;
}

const TYPO_BLOCKS: { id: string; title: string; kind: string; render: (t: GalleryToken[]) => ReactNode }[] = [
  { id: 'font-families', title: 'Font families', kind: 'fontFamily', render: (t) => <FamiliesBlock tokens={t} /> },
  { id: 'type-scale', title: 'Type scale', kind: 'fontSize', render: (t) => <TypeScaleBlock tokens={t} /> },
  { id: 'weights', title: 'Weights', kind: 'fontWeight', render: (t) => <WeightsBlock tokens={t} /> },
  { id: 'letter-spacing', title: 'Letter spacing', kind: 'letterSpacing', render: (t) => <TrackingBlock tokens={t} /> },
  { id: 'semantic-styles', title: 'Semantic styles', kind: 'typography', render: (t) => <SemanticBlock tokens={t} /> },
];

/** Turn a category's tokens into named, anchorable sections (shared by the
 *  sidebar table-of-contents and the collapsible page sections). */
export function getSections(tokens: GalleryToken[], category: TokenCategory, theme: Theme): Section[] {
  if (category === 'colors') {
    return groupBy(tokens).map(([group, items]) => ({
      id: slug(group), title: group, count: items.length, node: <SwatchBoard items={items} theme={theme} />,
    }));
  }
  if (category === 'typography') {
    const out: Section[] = [];
    for (const block of TYPO_BLOCKS) {
      const items = tokens.filter((t) => kindOf(t) === block.kind);
      if (items.length) out.push({ id: block.id, title: block.title, count: items.length, node: block.render(items) });
    }
    return out;
  }
  // layout / motion / icons
  return groupBy(tokens).map(([group, items]) => ({
    id: slug(group), title: group, count: items.length, node: <TokenList tokens={items} />,
  }));
}

export function CollapsibleSection({
  section,
  collapsed,
  onToggle,
}: {
  section: Section;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section id={`sec-${section.id}`} className="token-group">
      <button className="group-header" onClick={onToggle} aria-expanded={!collapsed}>
        <span className={`chevron${collapsed ? '' : ' open'}`} aria-hidden>▸</span>
        <span className="group-title">{section.title}</span>
        <span className="group-count">{section.count}</span>
      </button>
      {!collapsed && <div className="group-body">{section.node}</div>}
    </section>
  );
}

export function SectionList({
  sections,
  collapsed,
  onToggle,
}: {
  sections: Section[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (sections.length === 0) return <p className="empty">No tokens in this set.</p>;
  return (
    <div className="gallery">
      {sections.map((s) => (
        <CollapsibleSection key={s.id} section={s} collapsed={collapsed.has(s.id)} onToggle={() => onToggle(s.id)} />
      ))}
    </div>
  );
}
