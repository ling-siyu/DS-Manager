import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { loadTokens } from './tokens.js';
import { isInScope } from './edit-session.js';

// The embedded AI engine for `dsm edit run "<instruction>"`. The deterministic
// gates (session, typecheck, screenshots, pixel diff, approve/revert) live in
// edit-session/render-shots; this module is only the brain: propose edits,
// apply them inside the session scope, and judge before/after screenshots.
//
// Model default is claude-fable-5 (user's explicit choice for this project);
// override with --model or DSM_MODEL. Fable 5 constraints respected: adaptive
// thinking only (never {type:"disabled"}), no sampling parameters, no prefills.

export const DEFAULT_MODEL = process.env.DSM_MODEL || 'claude-fable-5';

/** Lazy SDK client with a clear error when the key is missing. */
export async function createClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. The AI engine calls the Anthropic API directly — ' +
      'export ANTHROPIC_API_KEY=<your key> and retry. (The deterministic `dsm edit` ' +
      'subcommands work without it.)',
    );
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic();
}

// ── Context assembly ─────────────────────────────────────────────────────────

/**
 * Stable system context for one run: engine instructions + the design-system
 * token reference. Files are NOT here — they change between iterations and
 * would invalidate the prompt cache; they travel in the user turn instead.
 */
export function buildSystemContext(paths) {
  const tokens = loadTokens(paths.tokensPath);
  const tokenRef = Object.entries(tokens)
    .map(([path, t]) => `${path} = ${t.resolvedValue}${t.$type ? `  (${t.$type})` : ''}`)
    .join('\n');

  return [
    'You are the edit engine of DSM, an AI-native design-system tool. You receive a',
    'design instruction plus the current source files, and you respond with precise',
    'search/replace edits that implement the instruction.',
    '',
    'Rules:',
    '- Edit ONLY the files provided. Prefer changing design tokens (tokens.json) over',
    '  component code when the instruction is about visual style — tokens cascade.',
    '- Each edit must contain a `search` string that appears EXACTLY ONCE in the file',
    '  (include surrounding lines for uniqueness) and the full `replace` text.',
    '- Never introduce raw values where a design token exists; reference tokens.',
    '- Keep edits minimal: implement the instruction, change nothing else.',
    '- If the instruction is already satisfied or cannot be implemented with the given',
    '  files, return an empty edits array and explain in notes.',
    '',
    'Design token reference (path = resolved value):',
    tokenRef,
  ].join('\n');
}

/** Current editable files for the user turn (re-read every iteration). */
export function buildFileContext(paths) {
  const files = [];
  const repoRoot = paths.repoRoot;

  const tokensRel = relative(repoRoot, paths.tokensPath);
  files.push({ path: tokensRel, content: readFileSync(paths.tokensPath, 'utf8') });

  if (existsSync(paths.componentsPath)) {
    const registry = JSON.parse(readFileSync(paths.componentsPath, 'utf8'));
    for (const component of registry.components ?? []) {
      const abs = resolve(paths.dsRoot, component.path);
      if (!existsSync(abs)) continue;
      files.push({ path: relative(repoRoot, abs), content: readFileSync(abs, 'utf8') });
    }
  }
  return files;
}

// ── Propose ─────────────────────────────────────────────────────────────────

const EDITS_SCHEMA = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Repo-root-relative path of the file to edit' },
          search: { type: 'string', description: 'Exact text to find (must occur exactly once in the file)' },
          replace: { type: 'string', description: 'Replacement text' },
        },
        required: ['file', 'search', 'replace'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'One-paragraph rationale, or why no edits are needed' },
  },
  required: ['edits', 'notes'],
  additionalProperties: false,
};

/**
 * Ask the model for edits. `feedback` carries apply/check failures from the
 * previous iteration so the model can correct course.
 */
export async function proposeEdits(client, { model = DEFAULT_MODEL, system, files, instruction, feedback }) {
  const fileBlocks = files
    .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
    .join('\n\n');

  const userText = [
    `Instruction: ${instruction}`,
    '',
    feedback
      ? `Previous attempt failed — fix this and propose corrected edits.\n` +
        `Listed failures were NOT applied; any other edits from that attempt WERE applied and are\n` +
        `already reflected in the files below. Do not re-propose already-applied edits.\n${feedback}\n`
      : '',
    // The system token reference is computed once per run (prompt-cache tradeoff);
    // after a tokens.json edit it can lag. The files below are always current.
    'Current files (authoritative — trust these over the token reference if they disagree):',
    fileBlocks,
  ].filter(Boolean).join('\n');

  const stream = client.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: EDITS_SCHEMA } },
    messages: [{ role: 'user', content: userText }],
  });
  const message = await stream.finalMessage();
  return { ...parseStructured(message, 'edit proposal'), usage: message.usage };
}

/** Parse a structured-output response with stop_reason-aware errors instead of
 *  a bare SyntaxError on refusals or truncation. */
function parseStructured(message, what) {
  if (message.stop_reason === 'refusal') {
    const detail = message.stop_details?.explanation ?? 'no explanation provided';
    throw new Error(`The model refused the ${what} request: ${detail}`);
  }
  const text = message.content.find((b) => b.type === 'text')?.text ?? '';
  try {
    return JSON.parse(text || '{}');
  } catch {
    if (message.stop_reason === 'max_tokens') {
      throw new Error(`The ${what} response was truncated at max_tokens — output did not fit; retry or simplify the instruction.`);
    }
    throw new Error(`Could not parse the ${what} response as JSON (stop_reason: ${message.stop_reason}). First 200 chars: ${text.slice(0, 200)}`);
  }
}

// ── Apply (scope-enforced) ───────────────────────────────────────────────────

/**
 * Apply search/replace edits. Each edit must target a file inside the session's
 * effective scope and its search text must occur exactly once. Returns
 * { applied: [...], failed: [{file, reason}] } — failures feed back to the model.
 */
export function applyEdits(edits, { repoRoot, scope }) {
  const applied = [];
  const failed = [];

  for (const edit of edits) {
    const rel = edit.file.replace(/\\/g, '/').replace(/^\.\//, '');
    const abs = resolve(repoRoot, rel);

    if (relative(repoRoot, abs).startsWith('..')) {
      failed.push({ file: edit.file, reason: 'outside the repository' });
      continue;
    }
    if (!isInScope(rel, scope)) {
      failed.push({ file: edit.file, reason: `outside the session scope (${scope.join(', ')})` });
      continue;
    }
    if (!existsSync(abs)) {
      failed.push({ file: edit.file, reason: 'file does not exist' });
      continue;
    }

    const source = readFileSync(abs, 'utf8');
    const first = source.indexOf(edit.search);
    if (first === -1) {
      failed.push({ file: edit.file, reason: 'search text not found (file may have changed — re-read it)' });
      continue;
    }
    if (source.indexOf(edit.search, first + 1) !== -1) {
      failed.push({ file: edit.file, reason: 'search text occurs more than once — include more surrounding context' });
      continue;
    }

    writeFileSync(abs, source.slice(0, first) + edit.replace + source.slice(first + edit.search.length));
    applied.push({ file: rel });
  }

  return { applied, failed };
}

// ── Vision verdict ───────────────────────────────────────────────────────────

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    satisfied: { type: 'boolean', description: 'Does the after state visually satisfy the instruction with no regressions?' },
    summary: { type: 'string', description: 'Two or three sentences: what changed visually and whether it matches the instruction' },
    issues: { type: 'array', items: { type: 'string' }, description: 'Visual regressions or mismatches, empty when satisfied' },
  },
  required: ['satisfied', 'summary', 'issues'],
  additionalProperties: false,
};

const MAX_VERIFY_PAIRS = 6;

/**
 * Judge before/after screenshot pairs against the instruction. Pairs beyond
 * MAX_VERIFY_PAIRS are skipped (reported in the result) to bound cost.
 */
export async function verifyShots(client, { model = DEFAULT_MODEL, instruction, pairs }) {
  const used = pairs.slice(0, MAX_VERIFY_PAIRS);

  const content = [
    {
      type: 'text',
      text:
        `A design-system edit was made with this instruction: "${instruction}".\n` +
        'For each labelled pair below, the BEFORE screenshot precedes the AFTER screenshot. ' +
        'Judge whether the instruction is visually satisfied across all pairs, and flag any regressions ' +
        '(unintended changes to color, layout, text, or spacing).',
    },
  ];
  for (const pair of used) {
    content.push({ type: 'text', text: `Pair: ${pair.shot} — BEFORE:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: readFileSync(pair.before).toString('base64') },
    });
    content.push({ type: 'text', text: `Pair: ${pair.shot} — AFTER:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: readFileSync(pair.after).toString('base64') },
    });
  }

  const message = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    messages: [{ role: 'user', content }],
  });

  return {
    ...parseStructured(message, 'vision verdict'),
    pairsJudged: used.length,
    pairsSkipped: pairs.length - used.length,
    usage: message.usage,
  };
}

/** Resolve before/after PNG pairs from a diffShotDirs report + artifact dir. */
export function shotPairs(report, artifactDir, { before = 'before', after = 'after' } = {}) {
  return report.pairs.map((p) => ({
    shot: p.shot,
    before: join(artifactDir, 'shots', before, p.shot),
    after: join(artifactDir, 'shots', after, p.shot),
    changedPct: p.changedPct,
  }));
}
