export interface GalleryToken {
  path: string;
  name: string;
  group: string;
  type: string;
  value: unknown;
  cssVar?: string;
  themeLight?: string;
  lineHeight?: string;
  description?: string;
}

export interface PreviewPropMeta {
  type: string;
  options?: string[];
  required?: boolean;
  inherited?: boolean;
}

export interface PreviewScenario {
  name: string;
  props: Record<string, unknown>;
}

export interface PreviewComponent {
  name: string;
  path: string;
  description: string;
  status: string;
  variants: string[];
  sizes: string[];
  props: Record<string, PreviewPropMeta>;
  previewProps: Record<string, unknown>;
  previewScenarios: PreviewScenario[];
}

export interface PreviewData {
  tokenSets: { dsm: GalleryToken[]; securamark: GalleryToken[] };
  components: PreviewComponent[];
  cssVars: string;
}
