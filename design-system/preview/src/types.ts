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
  /** Absolute source path, loaded cross-file via Vite dev `/@fs`. */
  absPath: string;
  /** '/'-delimited category path (e.g. "Landing/Illustrations"). */
  category: string;
  description: string;
  status: string;
  variants: string[];
  sizes: string[];
  props: Record<string, PreviewPropMeta>;
  /** Callback prop names to stub with no-ops (controlled-input safety). */
  handlers: string[];
  previewProps: Record<string, unknown>;
  previewScenarios: PreviewScenario[];
}

export interface IconCapture {
  set: string | null;
  source: string | null;
  style: { weight?: string | null };
  icons: { name: string; count: number }[];
}

export interface PreviewData {
  /** The current project's design tokens. */
  tokens: GalleryToken[];
  /** The current project's components. */
  components: PreviewComponent[];
  /** Generated CSS custom properties (--ds-* variables). */
  cssVars: string;
  /** The project's REAL compiled stylesheet (preflight + base + theme), injected
   *  inside each render iframe for full fidelity. */
  projectCss: string;
  /** Absolute path to the project's optional preview decorator
   *  (design-system/preview.tsx), loaded via /@fs to wrap every render. */
  decoratorPath: string | null;
  /** Default theme for the preview ('dark' | 'light'). */
  defaultTheme: string;
  /** Icon usage captured from the project source. */
  icons: IconCapture | null;
}
