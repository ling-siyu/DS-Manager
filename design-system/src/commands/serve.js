import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveProjectPaths } from '../utils/paths.js';
import { collectScanResults } from './scan.js';
import { searchTokens } from './get-token.js';
import { getComponents } from './list-components.js';
import { getDsmVersion } from '../utils/metadata.js';
import {
  abandonSession,
  approveSession,
  artifactDir,
  assertEditableTarget,
  checkSession,
  requireSession,
  revertSession,
  sessionRoot,
  sessionStatus,
  startSession,
} from '../utils/edit-session.js';
import { affectedComponents, toTargets } from './edit.js';
import { captureShots } from '../utils/render-shots.js';
import { diffShotDirs } from '../utils/shot-diff.js';
import { applyHexFixes, fixableFiles } from '../utils/scan-fix.js';
import * as git from '../utils/git.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function gatedPaths() {
  const paths = resolveProjectPaths();
  // MCP tools operate on DSM's own repo; cross-repo --target editing is CLI-only
  // in this slice (assertEditableTarget allows the own-repo case unconditionally).
  assertEditableTarget(git.repoRoot(paths.repoRoot), PACKAGE_ROOT);
  return paths;
}

// Table-driven tool registry: { description, inputSchema, handler(args, ctx) }.
// Handlers return JSON-able values; errors become { ok:false, error } results so
// a failed token build can never kill the long-lived server process.
const TOOLS = {
  get_token: {
    description: 'Look up a design token by name or CSS variable. Returns value, type, description, and CSS variable name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Token path, CSS var name, or partial name to search' },
      },
      required: ['query'],
    },
    handler: (args, { tokensPath }) => {
      const results = searchTokens(args.query, tokensPath);
      return results.length ? results : `No tokens found matching "${args.query}"`;
    },
  },
  list_components: {
    description: 'List all registered design system components with their variants, props, and file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Optional filter string to search component names' },
      },
    },
    handler: (args, { componentsPath }) => {
      const components = getComponents(componentsPath, args?.filter);
      if (components === null) return 'No components.json found.';
      return components.length ? components : 'No components found.';
    },
  },
  validate_file: {
    description: 'Validate a file or directory for design system violations (hardcoded colors, arbitrary values, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file or directory to validate' },
      },
      required: ['path'],
    },
    handler: async (args) => {
      const { totalErrors, totalWarnings, results } = await collectScanResults(args.path);
      return { path: args.path, totalErrors, totalWarnings, passed: totalErrors === 0, violations: results };
    },
  },

  // ── The gated edit loop (see docs/phase-4-spec.md) ────────────────────────
  edit_start: {
    description: 'Start a git-gated edit session: verifies a clean tree in scope and pins the base commit. Required before scan_fix / edit_* mutations.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'array', items: { type: 'string' }, description: 'Pathspecs the session may touch (default: design-system/)' },
        allowDirty: { type: 'boolean' },
        force: { type: 'boolean', description: 'Discard a stale session record' },
      },
    },
    handler: (args) => {
      const paths = gatedPaths();
      const session = startSession(paths, args ?? {});
      return { ok: true, session, artifactDir: artifactDir(session.repoRoot, session) };
    },
  },
  edit_status: {
    description: 'Show the active edit session: changed files, HEAD drift, artifact paths.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => {
      const paths = gatedPaths();
      return { ok: true, ...sessionStatus(paths, requireSession(sessionRoot(paths))) };
    },
  },
  edit_check: {
    description: 'Type-check files changed in the session; validate and rebuild tokens when tokens.json changed.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const paths = gatedPaths();
      return checkSession(paths, requireSession(sessionRoot(paths)));
    },
  },
  edit_render: {
    description: 'Screenshot affected components to the session artifact dir. Labels distinguish shot sets (before/after/after-2…). May take ~10-30s (Vite + Chrome boot).',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Shot set label, e.g. "before" or "after"' },
        components: { type: 'array', items: { type: 'string' }, description: 'Override affected-component inference' },
      },
      required: ['label'],
    },
    handler: async (args) => {
      const paths = gatedPaths();
      const session = requireSession(sessionRoot(paths));
      if (args.label === 'diff') throw new Error('The label "diff" is reserved for pixel-diff output; pick another label.');
      const components = affectedComponents(paths, session, args.components);
      if (!components.length) throw new Error('No affected components to render; pass `components` to override.');
      const outDir = join(artifactDir(session.repoRoot, session), 'shots', args.label);
      const shots = await captureShots(paths, toTargets(components), outDir, {});
      return { ok: true, label: args.label, shots };
    },
  },
  edit_diff: {
    description: 'Code diff (saved as diff.patch) + pixel-diff of before/after screenshot sets. Read the returned PNG paths to judge the change visually.',
    inputSchema: {
      type: 'object',
      properties: {
        before: { type: 'string', description: 'Before label (default "before")' },
        after: { type: 'string', description: 'After label (default "after")' },
      },
    },
    handler: (args) => {
      const paths = gatedPaths();
      const session = requireSession(sessionRoot(paths));
      const dir = artifactDir(session.repoRoot, session);
      const patch = git.diffText(session.repoRoot, session.baseRef, session.effectiveScope);
      const patchFile = join(dir, 'diff.patch');
      writeFileSync(patchFile, patch);
      const report = diffShotDirs(
        join(dir, 'shots', args?.before ?? 'before'),
        join(dir, 'shots', args?.after ?? 'after'),
        join(dir, 'shots', 'diff'),
      );
      writeFileSync(join(dir, 'diff-report.json'), `${JSON.stringify(report, null, 2)}\n`);
      return { ok: true, patchFile, ...report };
    },
  },
  edit_approve: {
    description: 'Commit the session scope (pathspec commit) and end the session.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Commit message' } },
      required: ['message'],
    },
    handler: (args) => {
      const paths = gatedPaths();
      return { ok: true, ...approveSession(paths, requireSession(sessionRoot(paths)), args.message) };
    },
  },
  edit_revert: {
    description: 'Restore the session scope to the base commit and end the session.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => {
      const paths = gatedPaths();
      return { ok: true, ...revertSession(paths, requireSession(sessionRoot(paths))) };
    },
  },
  edit_abandon: {
    description: 'End the session keeping the working tree as-is (no commit, no revert).',
    inputSchema: { type: 'object', properties: {} },
    handler: () => {
      const paths = gatedPaths();
      return { ok: true, ...abandonSession(requireSession(sessionRoot(paths))) };
    },
  },
  scan_fix: {
    description: 'Replace unambiguous hardcoded hex colors with var(--ds-…) token references within the active edit session scope. Ambiguous values are returned with candidates for the agent to resolve.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path to scan (default ".")' } },
    },
    handler: async (args) => {
      const paths = gatedPaths();
      const session = requireSession(sessionRoot(paths));
      const { absolutePath, results } = await collectScanResults(args?.path ?? '.');
      const { eligible, outOfScope } = fixableFiles(results, absolutePath, session);
      const outcome = applyHexFixes(eligible, { tokensPath: paths.tokensPath });
      return { ok: true, session: session.id, ...outcome, outOfScope };
    },
  },
};

export async function serveCommand() {
  const server = new Server(
    { name: 'dsm', version: getDsmVersion() },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(TOOLS).map(([name, t]) => ({
      name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS[name];
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    const ctx = resolveProjectPaths();
    try {
      const result = await tool.handler(args, ctx);
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error.message }, null, 2) }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
