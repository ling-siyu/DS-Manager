import { Project, ts } from 'ts-morph';

// Per-file type diagnostics for the edit loop's `check` gate. Mirrors the
// fallback compiler options used by component-discovery's createProject —
// design-system ships no tsconfig of its own; @types/react provides the
// ambient React/JSX types.

function createProject() {
  return new Project({
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      skipLibCheck: true,
      noEmit: true,
      strict: false,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10 ?? ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
    },
  });
}

function toRecord(diag, sf) {
  const start = diag.getStart?.() ?? diag.start;
  const file = sf?.getFilePath?.() ?? (sf && String(sf.fileName));
  const line = sf && start !== undefined
    ? (sf.getLineAndColumnAtPos
        ? sf.getLineAndColumnAtPos(start).line
        : sf.getLineAndCharacterOfPosition(start).line + 1)
    : null;
  const category = typeof diag.getCategory === 'function'
    ? diag.getCategory()
    : diag.category;
  const code = typeof diag.getCode === 'function' ? diag.getCode() : diag.code;
  const messageText = typeof diag.getMessageText === 'function'
    ? diag.getMessageText()
    : diag.messageText;
  return {
    file: String(file),
    line,
    code,
    category: ts.DiagnosticCategory[category].toLowerCase(),
    message: ts.flattenDiagnosticMessageText(messageText, ' '),
  };
}

/**
 * Type-check the given absolute file paths. Returns diagnostics limited to those
 * files: [{ file, line, code, category: 'error'|'warning'|..., message }].
 *
 * lenient: SYNTAX-only diagnostics (parse errors), skipping semantic/type checks.
 * Used when editing an external target whose strict config + path aliases we don't
 * load — a broken parse still fails the gate, but unresolved imports / type
 * mismatches against the target's own tsconfig don't produce noise here.
 */
export function typecheckFiles(absPaths, options = {}) {
  const { lenient = false } = options;
  const project = createProject();
  const wanted = new Set();
  for (const p of absPaths) {
    try {
      const sf = project.addSourceFileAtPathIfExists(p);
      if (sf) wanted.add(sf.getFilePath());
    } catch { /* unparseable file surfaces via diagnostics below */ }
  }

  if (lenient) {
    const program = project.getProgram().compilerObject;
    const diagnostics = [];
    for (const sf of program.getSourceFiles()) {
      if (!wanted.has(sf.fileName)) continue;
      for (const diag of program.getSyntacticDiagnostics(sf)) {
        diagnostics.push(toRecord(diag, diag.file ?? sf));
      }
    }
    return diagnostics;
  }

  const diagnostics = [];
  for (const diag of project.getPreEmitDiagnostics()) {
    const sf = diag.getSourceFile();
    const file = sf?.getFilePath();
    if (!file || !wanted.has(file)) continue;
    diagnostics.push(toRecord(diag, sf));
  }
  return diagnostics;
}

/** Full semantic+syntactic diagnostics for the wanted files in a loaded project. */
function diagnosticsForFiles(project, wanted) {
  const out = [];
  for (const sf of project.getSourceFiles()) {
    if (!wanted.has(sf.getFilePath())) continue;
    for (const diag of sf.getPreEmitDiagnostics()) {
      out.push(toRecord(diag, sf));
    }
  }
  return out;
}

// Fingerprint a diagnostic for set-membership, ignoring line (edits shift lines).
const fingerprint = (d) => `${d.file}::${d.code}::${d.message}`;

/**
 * STRICT type-check of an external target's changed files against its OWN tsconfig
 * (real aliases, strict mode), reporting only diagnostics the edit INTRODUCED.
 *
 * Loads the target's program once; collects diagnostics for the changed files in the
 * current (edited) state, then swaps each changed file's text to its baseRef content
 * and re-collects — the difference is what the edit added. Pre-existing errors in the
 * target don't fail the gate. Added files have an empty baseline (all errors are new).
 *
 * baseTextByFile: Map<absPath, string> — baseRef content per changed file ('' if added).
 * Returns { introduced, current, baseline } diagnostic arrays.
 */
export function typecheckTargetChanges({ tsConfigFilePath, files, baseTextByFile }) {
  const project = new Project({ tsConfigFilePath });
  const wanted = new Set();
  for (const f of files) {
    let sf = project.getSourceFile(f);
    if (!sf) {
      try { sf = project.addSourceFileAtPathIfExists(f); } catch { /* surfaces as diag */ }
    }
    if (sf) wanted.add(sf.getFilePath());
  }

  const current = diagnosticsForFiles(project, wanted);

  // Revert each changed file to its baseRef content, then re-measure the same files.
  for (const f of files) {
    const sf = project.getSourceFile(f);
    if (sf) sf.replaceWithText(baseTextByFile.get(f) ?? '');
  }
  const baseline = diagnosticsForFiles(project, wanted);

  const baseSet = new Set(baseline.map(fingerprint));
  const introduced = current.filter((d) => !baseSet.has(fingerprint(d)));
  return { introduced, current, baseline };
}
