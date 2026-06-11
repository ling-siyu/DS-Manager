import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { resolveProjectPaths } from '../utils/paths.js';
import {
  abandonSession,
  approveSession,
  artifactDir,
  assertOwnRepo,
  changedFiles,
  checkSession,
  loadSession,
  requireSession,
  revertSession,
  sessionRoot,
  sessionStatus,
  startSession,
} from '../utils/edit-session.js';
import { captureShots } from '../utils/render-shots.js';
import { diffShotDirs } from '../utils/shot-diff.js';
import * as git from '../utils/git.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The agent-facing CLI for the gated edit loop. Every subcommand supports
// --json (machine-readable result on stdout, exit code 0/1) — that is the
// contract the driving agent (Claude Code, or any MCP/CLI agent) follows. The
// agent is the brain: it proposes edits with its own tools and judges the
// before/after screenshots with its own vision — no model API key in the loop.
// See docs/phase-4-spec.md.

function emit(result, options, humanRender) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    humanRender(result);
  }
}

function fail(error, options) {
  if (options.json) {
    console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
  } else {
    console.error(chalk.red(`\n✗ ${error.message}\n`));
  }
  process.exit(1);
}

function gatedPaths() {
  const paths = resolveProjectPaths();
  assertOwnRepo(paths, PACKAGE_ROOT);
  return paths;
}

/** Registry components whose source path intersects the session's changed files. */
function affectedComponents(paths, session, overrideNames) {
  const root = session.repoRoot;
  const registry = JSON.parse(readFileSync(paths.componentsPath, 'utf8'));
  const components = registry.components ?? [];

  if (overrideNames?.length) {
    const byName = new Map(components.map((c) => [c.name, c]));
    return overrideNames.map((n) => {
      const c = byName.get(n);
      if (!c) throw new Error(`Unknown component "${n}" (registry: ${components.map((x) => x.name).join(', ')})`);
      return c;
    });
  }

  const changes = changedFiles(session);
  const dsPrefix = relative(root, paths.dsRoot);
  const tokensRel = relative(root, paths.tokensPath);

  // A token change can restyle anything — shoot every registered component.
  // (Registry `tokens` globs could narrow this; with a 3-component registry,
  // "all" is both correct and cheaper than being clever.)
  if (changes.all.includes(tokensRel)) return components;

  return components.filter((c) => changes.all.includes(`${dsPrefix}/${c.path}`));
}

function toTargets(components) {
  return components.map((c) => ({
    source: 'dsm',
    name: c.name,
    scenarios: [...Array(Math.max(c.previewScenarios?.length ?? 0, 1)).keys()],
  }));
}

export function registerEditCommand(program) {
  const edit = program
    .command('edit')
    .description('Git-gated edit sessions: the deterministic core of the AI edit loop');

  edit
    .command('start')
    .description('Start a session: verify a clean tree in scope and pin the base commit')
    .option('--scope <path...>', 'Pathspecs the session may touch (default: design-system/)')
    .option('--allow-dirty', 'Accept pre-existing changes in scope as part of the session')
    .option('--force', 'Discard a stale session record')
    .option('--json', 'Machine-readable output')
    .action((options) => {
      try {
        const paths = gatedPaths();
        const session = startSession(paths, options);
        emit({ ok: true, session, artifactDir: artifactDir(session.repoRoot, session) }, options, (r) => {
          console.log(chalk.green(`\n✓ Edit session ${r.session.id} started`));
          console.log(`  base    ${r.session.baseRef.slice(0, 12)} (${r.session.branch ?? 'detached'})`);
          console.log(`  scope   ${r.session.effectiveScope.join(', ')}`);
          console.log(`  shots   ${r.artifactDir}\n`);
        });
      } catch (error) {
        fail(error, options);
      }
    });

  edit
    .command('status')
    .description('Show the active session, changed files, and HEAD drift')
    .option('--json', 'Machine-readable output')
    .action((options) => {
      try {
        const paths = gatedPaths();
        const session = requireSession(sessionRoot(paths));
        const status = sessionStatus(paths, session);
        emit({ ok: true, ...status }, options, (r) => {
          console.log(chalk.cyan(`\nSession ${r.session.id}`) + chalk.dim(`  base ${r.session.baseRef.slice(0, 12)}`));
          if (r.headDrift) console.log(chalk.yellow(`  ⚠ HEAD drifted to ${r.headDrift.head.slice(0, 12)}`));
          console.log(`  changed (${r.changedFiles.length}):`);
          for (const f of r.changedFiles) console.log(`    ${f}`);
          console.log(`  artifacts ${r.artifactDir}\n`);
        });
      } catch (error) {
        fail(error, options);
      }
    });

  edit
    .command('check')
    .description('Type-check changed files; validate + rebuild tokens when they changed')
    .option('--json', 'Machine-readable output')
    .action(async (options) => {
      try {
        const paths = gatedPaths();
        const session = requireSession(sessionRoot(paths));
        const result = await checkSession(paths, session);
        emit(result, options, (r) => {
          if (r.ok) {
            console.log(chalk.green(`\n✓ check passed (${r.files.length} changed file${r.files.length === 1 ? '' : 's'})\n`));
          } else {
            console.log(chalk.red('\n✗ check failed'));
            for (const d of r.typecheck.filter((d) => d.category === 'error')) {
              console.log(`  ${d.file}:${d.line}  TS${d.code} ${d.message}`);
            }
            if (r.tokens && r.tokens.parse !== 'ok') console.log(`  tokens.json parse: ${r.tokens.parse}`);
            for (const u of r.tokens?.unresolvedRefs ?? []) {
              console.log(`  unresolved token ref ${u.value} at ${u.path}`);
            }
            console.log();
          }
        });
        if (!result.ok) process.exit(1);
      } catch (error) {
        fail(error, options);
      }
    });

  edit
    .command('render')
    .description('Screenshot affected components to the session artifact dir')
    .requiredOption('--label <label>', 'Shot set label (before, after, after-2, …)')
    .option('--component <name...>', 'Override affected-component inference')
    .option('--json', 'Machine-readable output')
    .action(async (options) => {
      try {
        const paths = gatedPaths();
        const session = requireSession(sessionRoot(paths));
        if (options.label === 'diff') {
          throw new Error('The label "diff" is reserved for pixel-diff output; pick another label.');
        }
        const components = affectedComponents(paths, session, options.component);
        if (!components.length) {
          throw new Error('No affected components to render (no in-scope component/token changes; use --component to override).');
        }
        const outDir = join(artifactDir(session.repoRoot, session), 'shots', options.label);
        const shots = await captureShots(paths, toTargets(components), outDir, {
          onLog: options.json ? () => {} : (m) => console.log(chalk.dim(`  ${m}`)),
        });
        emit({ ok: true, label: options.label, shots }, options, (r) => {
          console.log(chalk.green(`\n✓ ${r.shots.length} shots (${r.label}) → ${outDir}\n`));
        });
      } catch (error) {
        fail(error, options);
      }
    });

  edit
    .command('diff')
    .description('Code diff + pixel-diff of before/after shots')
    .option('--before <label>', 'Before shot label', 'before')
    .option('--after <label>', 'After shot label', 'after')
    .option('--json', 'Machine-readable output')
    .action((options) => {
      try {
        const paths = gatedPaths();
        const session = requireSession(sessionRoot(paths));
        const dir = artifactDir(session.repoRoot, session);

        const patch = git.diffText(session.repoRoot, session.baseRef, session.effectiveScope);
        const patchFile = join(dir, 'diff.patch');
        writeFileSync(patchFile, patch);

        const report = diffShotDirs(
          join(dir, 'shots', options.before),
          join(dir, 'shots', options.after),
          join(dir, 'shots', 'diff'),
        );
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'diff-report.json'), `${JSON.stringify(report, null, 2)}\n`);

        emit({ ok: true, patchFile, ...report }, options, (r) => {
          console.log(chalk.cyan(`\nCode diff → ${r.patchFile}`));
          for (const p of r.pairs) {
            const pct = `${p.changedPct}%`;
            const mark = p.changedPixels > 0 ? chalk.yellow(pct) : chalk.dim(pct);
            console.log(`  ${p.shot}  ${mark}${p.dimensionsChanged ? chalk.yellow(' (dimensions changed)') : ''}`);
          }
          if (r.missingAfter.length) console.log(chalk.yellow(`  missing after: ${r.missingAfter.join(', ')}`));
          if (r.missingBefore.length) console.log(chalk.yellow(`  missing before: ${r.missingBefore.join(', ')}`));
          console.log();
        });
      } catch (error) {
        fail(error, options);
      }
    });

  edit
    .command('approve')
    .description('Commit the session scope (pathspec commit) and end the session')
    .requiredOption('-m, --message <message>', 'Commit message')
    .option('--json', 'Machine-readable output')
    .action((options) => {
      try {
        const paths = gatedPaths();
        const session = requireSession(sessionRoot(paths));
        const result = approveSession(paths, session, options.message);
        emit({ ok: true, ...result }, options, (r) => {
          console.log(chalk.green(`\n✓ approved → commit ${r.commit.slice(0, 12)} (${r.files.length} files)\n`));
        });
      } catch (error) {
        fail(error, options);
      }
    });

  edit
    .command('revert')
    .description('Restore the session scope to the base commit and end the session')
    .option('--json', 'Machine-readable output')
    .action((options) => {
      try {
        const paths = gatedPaths();
        const session = requireSession(sessionRoot(paths));
        const result = revertSession(paths, session);
        emit({ ok: true, ...result }, options, (r) => {
          console.log(chalk.green(`\n✓ reverted (${r.restored.length} restored, ${r.deleted.length} deleted)\n`));
        });
      } catch (error) {
        fail(error, options);
      }
    });

  edit
    .command('abandon')
    .description('End the session keeping the working tree as-is (no commit, no revert)')
    .option('--json', 'Machine-readable output')
    .action((options) => {
      try {
        const paths = gatedPaths();
        const session = requireSession(sessionRoot(paths));
        const result = abandonSession(session);
        emit({ ok: true, ...result }, options, (r) => {
          console.log(chalk.green(`\n✓ session abandoned (${r.kept.length} changed files kept in working tree)\n`));
        });
      } catch (error) {
        fail(error, options);
      }
    });

  return edit;
}

// Re-exported for the MCP server (thin wrappers over the same cores).
export {
  startSession,
  sessionStatus,
  checkSession,
  approveSession,
  revertSession,
  abandonSession,
  loadSession,
  affectedComponents,
  toTargets,
};
