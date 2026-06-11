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

/** Turn a category's tokens into named sections, each rendered as a canvas frame. */
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
