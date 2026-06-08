import type { PreviewData } from './types';

// `virtual:dsm-data` is provided by the dsm ui Vite plugin (src/commands/ui.js),
// which serializes buildPreviewData() into the bundle.
// @ts-expect-error - no static type for the virtual module id
import injected from 'virtual:dsm-data';

export const data = injected as PreviewData;
