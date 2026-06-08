import { existsSync, readFileSync } from 'fs';
import { globSync } from 'glob';
import { extname, relative, resolve } from 'path';
import { Project, Node, ts } from 'ts-morph';

const DEFAULT_PATTERNS = [
  'src/components/**/*.{tsx,jsx,ts,js}',
  'src/components/ui/**/*.{tsx,jsx,ts,js}',
  'src/components/features/**/*.{tsx,jsx,ts,js}',
];

const IGNORE_PATTERNS = [
  '**/*.stories.*',
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/coverage/**',
];

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Component detection (which exported names are React components) ──────────
// Kept as lightweight source-text matching — it works well and is independent
// of type resolution. Prop inference (below) is what moved to the TS compiler.

function findExportedNames(source) {
  const names = new Set();
  const cleaned = stripComments(source);
  const patterns = [
    /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=/g,
    /export\s+class\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s*\{\s*([^}]+)\s*\}/g,
    /const\s+([A-Z][A-Za-z0-9_]*)\s*=.*?export\s+default\s+\1/gs,
    /function\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{[\s\S]*?export\s+default\s+\1/gs,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      if (pattern.source.includes('export\\s*\\{')) {
        const entries = match[1]
          .split(',')
          .map((value) => value.trim().split(/\s+as\s+/i).pop()?.trim())
          .filter((value) => /^[A-Z]/.test(value || ''));
        entries.forEach((entry) => names.add(entry));
        continue;
      }

      names.add(match[1]);
    }
  }

  return [...names];
}

function isLikelyComponentDefinition(source, componentName) {
  const escaped = escapeRegex(componentName);
  const patterns = [
    new RegExp(`export\\s+default\\s+function\\s+${escaped}\\s*\\(`, 'm'),
    new RegExp(`export\\s+function\\s+${escaped}\\s*\\(`, 'm'),
    new RegExp(`export\\s+class\\s+${escaped}\\b`, 'm'),
    new RegExp(`(?:export\\s+)?const\\s+${escaped}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)\\s*=>|function\\b|memo\\s*\\(|forwardRef\\s*\\(|React\\.memo\\s*\\(|React\\.forwardRef\\s*\\()`, 'm'),
  ];

  return patterns.some((pattern) => pattern.test(source));
}

function looksRenderableReactComponent(source, componentName, filePath) {
  const markers = [
    `<${componentName}`,
    'return (',
    'return <',
    'React.createElement',
    'from \'react\'',
    'from "react"',
  ];

  return (extname(filePath) === '.jsx' || extname(filePath) === '.tsx' || extname(filePath) === '.js' || extname(filePath) === '.ts')
    && markers.some((marker) => source.includes(marker));
}

// ── Prop inference via the TypeScript compiler (ts-morph) ────────────────────

/**
 * Create a ts-morph project rooted at the target. If the target ships a
 * tsconfig.json, reuse its compilerOptions (jsx, path aliases, lib) for faithful
 * resolution — but skip auto-adding its files (we add only what we discover, for
 * speed). Otherwise fall back to sensible JSX/JS defaults.
 */
function createProject(repoRoot) {
  const tsConfigFilePath = resolve(repoRoot, 'tsconfig.json');
  if (existsSync(tsConfigFilePath)) {
    try {
      return new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: true });
    } catch {
      // Malformed/exotic tsconfig — fall through to defaults.
    }
  }
  return new Project({
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      skipLibCheck: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10 ?? ts.ModuleResolutionKind.NodeJs,
    },
  });
}

/**
 * A prop is "inherited" when every declaration of it comes from outside the
 * target's own source — i.e. node_modules (e.g. @types/react's HTML attributes)
 * or a TS default lib. Props authored in the target repo are "own". Phase 3 can
 * show own props by default and fold the inherited DOM/aria/event surface away.
 */
function isInheritedPath(filePath) {
  // node_modules covers third-party types AND the TS default libs (they live at
  // .../node_modules/typescript/lib/lib.*.d.ts). Deliberately NOT a `lib*.d.ts`
  // name match — that would misflag a target's own src/lib.d.ts as inherited.
  return filePath.includes('/node_modules/');
}

function symbolIsInherited(symbol) {
  const decls = symbol.getDeclarations();
  if (decls.length === 0) return false;
  return decls.every((decl) => {
    try { return isInheritedPath(decl.getSourceFile().getFilePath()); } catch { return false; }
  });
}

const simplifyText = (text) => (text || '').replace(/\s+/g, ' ').trim();

/** String-literal members of a (possibly union) type, in declaration order. */
function stringLiteralOptions(type) {
  const members = type.isUnion() ? type.getUnionTypes() : [type];
  const options = [];
  for (const member of members) {
    if (member.isStringLiteral()) options.push(member.getLiteralValue());
  }
  return options;
}

/** Map a property's resolved type to { type, options } matching the registry shape. */
function describeType(type, node) {
  if (!type) return { type: 'unknown', options: [] };

  // Optionality is tracked separately (the `?` / Optional flag), so strip the
  // synthesized `| undefined`/`| null` before labeling the declared type —
  // otherwise `disabled?: boolean` would read as `boolean | undefined`.
  try { type = type.getNonNullableType(); } catch { /* keep original */ }

  const options = stringLiteralOptions(type);
  if (options.length) return { type: 'string', options };

  if (type.isBoolean() || type.isBooleanLiteral()) return { type: 'boolean', options: [] };
  if (type.isNumber() || type.isNumberLiteral()) return { type: 'number', options: [] };
  if (type.isString() || type.isStringLiteral()) return { type: 'string', options: [] };

  try {
    if (type.getCallSignatures().length > 0) return { type: 'function', options: [] };
  } catch { /* some types throw on signature access — ignore */ }

  let text = 'unknown';
  try { text = simplifyText(type.getText(node)); } catch { /* keep 'unknown' */ }
  if (/ReactNode|JSX\.Element|ReactElement/.test(text)) return { type: 'ReactNode', options: [] };
  if (text === 'boolean') return { type: 'boolean', options: [] };
  return { type: text || 'unknown', options: [] };
}

/**
 * Collect props from a (possibly union) prop type. For a union, take the union of
 * properties across ALL members (the full catalogue the component accepts), and
 * mark a prop required only when it is present and non-optional in every member.
 */
function collectProps(type) {
  if (!type) return { props: {}, variants: [], sizes: [] };

  // Drop null/undefined/never constituents (e.g. an optional `Props | undefined`
  // param) so they don't inflate memberCount and wrongly demote every real prop
  // to optional via the `count === memberCount` test below.
  let members = type.isUnion() ? type.getUnionTypes() : [type];
  members = members.filter((member) => {
    try { return !member.isUndefined() && !member.isNull() && !member.isNever(); }
    catch { return true; }
  });
  if (members.length === 0) members = [type];
  const memberCount = members.length;
  const acc = new Map();

  for (const member of members) {
    let symbols = [];
    try { symbols = member.getProperties(); } catch { symbols = []; }
    for (const symbol of symbols) {
      const name = symbol.getName();
      const decl = symbol.getDeclarations()[0];
      let propType;
      try { propType = decl ? symbol.getTypeAtLocation(decl) : undefined; } catch { propType = undefined; }
      const optional = (symbol.getFlags() & ts.SymbolFlags.Optional) !== 0;

      let entry = acc.get(name);
      if (!entry) {
        entry = { count: 0, optionalAny: false, ownAny: false, propType, node: decl };
        acc.set(name, entry);
      }
      entry.count += 1;
      if (optional) entry.optionalAny = true;
      if (!symbolIsInherited(symbol)) entry.ownAny = true;
      if (!entry.propType && propType) { entry.propType = propType; entry.node = decl; }
    }
  }

  const props = {};
  const variants = new Set();
  const sizes = new Set();

  for (const [name, entry] of acc) {
    const required = entry.count === memberCount && !entry.optionalAny;
    const inherited = !entry.ownAny;
    const { type: typeLabel, options } = describeType(entry.propType, entry.node);

    if (name === 'variant') options.forEach((o) => variants.add(o));
    if (name === 'size') options.forEach((o) => sizes.add(o));

    props[name] = {
      type: typeLabel,
      ...(options.length ? { options } : {}),
      ...(required ? { required: true } : {}),
      ...(inherited ? { inherited: true } : {}),
    };
  }

  return { props, variants: [...variants], sizes: [...sizes] };
}

/** Resolve the props-parameter type of a function/arrow/forwardRef/memo component. */
function getComponentPropsType(sourceFile, componentName) {
  const fn = sourceFile.getFunction(componentName);
  if (fn) return firstParamType(fn);

  const varDecl = sourceFile.getVariableDeclaration(componentName);
  if (varDecl) return propsTypeFromInitializer(varDecl.getInitializer());

  return undefined;
}

function firstParamType(fnLike) {
  const params = fnLike.getParameters();
  if (!params.length) return undefined;
  try { return params[0].getType(); } catch { return undefined; }
}

function propsTypeFromInitializer(init) {
  if (!init) return undefined;
  if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) return firstParamType(init);
  if (Node.isCallExpression(init)) {
    // forwardRef/memo(...) — prefer an inline component arg, else the Props type arg.
    for (const arg of init.getArguments()) {
      if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) {
        const t = firstParamType(arg);
        if (t) return t;
      }
    }
    const typeArgs = init.getTypeArguments();
    if (typeArgs.length >= 2) { try { return typeArgs[1].getType(); } catch { /* ignore */ } }
    if (typeArgs.length === 1) { try { return typeArgs[0].getType(); } catch { /* ignore */ } }
  }
  return undefined;
}

const EMPTY_INFERENCE = { props: {}, variants: [], sizes: [] };

function inferProps(project, filePath, componentName) {
  let sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    try { sourceFile = project.addSourceFileAtPathIfExists(filePath); } catch { sourceFile = undefined; }
  }
  if (!sourceFile) return EMPTY_INFERENCE;

  try {
    const propsType = getComponentPropsType(sourceFile, componentName);
    return collectProps(propsType);
  } catch {
    return EMPTY_INFERENCE;
  }
}

export function discoverComponents(repoRoot, options = {}) {
  const patterns = options.patterns?.length ? options.patterns : DEFAULT_PATTERNS;
  const files = unique(patterns.flatMap((pattern) => globSync(pattern, {
    cwd: repoRoot,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  })));

  // One project per call; add every discovered file up front so cross-file
  // imported prop types resolve. Imports of files outside this set still resolve
  // lazily from disk via the compiler.
  const project = createProject(repoRoot);
  for (const filePath of files) {
    if (!existsSync(filePath)) continue;
    try { project.addSourceFileAtPathIfExists(filePath); } catch { /* skip unparseable */ }
  }

  const discovered = [];
  const byName = new Map();

  for (const filePath of files) {
    if (!existsSync(filePath)) continue;

    let source;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const exportedNames = findExportedNames(source);
    for (const name of exportedNames) {
      if (!isLikelyComponentDefinition(source, name)) continue;
      if (!looksRenderableReactComponent(source, name, filePath)) continue;

      const inferred = inferProps(project, filePath, name);
      const component = {
        name,
        path: relative(repoRoot, filePath).replace(/\\/g, '/'),
        props: inferred.props,
        variants: inferred.variants,
        sizes: inferred.sizes,
        discoveredFrom: relative(repoRoot, filePath).replace(/\\/g, '/'),
      };

      discovered.push(component);
      byName.set(name, component);
    }
  }

  return {
    components: discovered
      .sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path)),
    byName,
    scannedPatterns: patterns,
  };
}

export function resolveComponentSourcePath(repoRoot, componentPath) {
  return resolve(repoRoot, componentPath);
}

/**
 * Keep only props authored on the target, dropping the inherited DOM/aria/event
 * surface (props flagged `inherited`). Discovery keeps the full catalogue; this
 * is what consumers (registry, generated context) should persist/render by
 * default so they aren't drowned in hundreds of inherited attributes.
 */
export function ownProps(props = {}) {
  const out = {};
  for (const [name, meta] of Object.entries(props)) {
    if (!meta?.inherited) out[name] = meta;
  }
  return out;
}
