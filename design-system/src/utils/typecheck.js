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

/**
 * Type-check the given absolute file paths. Returns diagnostics limited to those
 * files: [{ file, line, code, category: 'error'|'warning'|..., message }].
 */
export function typecheckFiles(absPaths) {
  const project = createProject();
  const wanted = new Set();
  for (const p of absPaths) {
    try {
      const sf = project.addSourceFileAtPathIfExists(p);
      if (sf) wanted.add(sf.getFilePath());
    } catch { /* unparseable file surfaces via diagnostics below */ }
  }

  const diagnostics = [];
  for (const diag of project.getPreEmitDiagnostics()) {
    const sf = diag.getSourceFile();
    const file = sf?.getFilePath();
    if (!file || !wanted.has(file)) continue;
    const start = diag.getStart();
    const line = sf && start !== undefined ? sf.getLineAndColumnAtPos(start).line : null;
    diagnostics.push({
      file: String(file),
      line,
      code: diag.getCode(),
      category: ts.DiagnosticCategory[diag.getCategory()].toLowerCase(),
      message: ts.flattenDiagnosticMessageText(diag.getMessageText(), ' '),
    });
  }
  return diagnostics;
}
