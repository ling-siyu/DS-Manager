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
