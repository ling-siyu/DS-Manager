// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/** @type {Map<string, { value: string, description: string }>} */
let tokenCache = new Map();
let cacheWatcher = null;

/**
 * Parse css-vars.css and context.md into a unified token map.
 * css-vars.css: --ds-foo-bar: #value;
 * context.md:   | `semantic.color.foo.bar` | `#value` | description |
 */
function buildTokenCache(workspaceRoot) {
  const config = vscode.workspace.getConfiguration('dsm');
  const cssPath = path.join(workspaceRoot, config.get('cssVarsPath'));
  const contextPath = path.join(workspaceRoot, config.get('contextPath'));

  /** @type {Map<string, { value: string, description: string }>} */
  const map = new Map();

  // Read CSS vars
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    for (const m of css.matchAll(/^\s*(--ds-[\w-]+):\s*(.+?);/gm)) {
      map.set(m[1], { value: m[2].trim(), description: '' });
    }
  }

  // Enrich with descriptions from context.md
  if (fs.existsSync(contextPath)) {
    const md = fs.readFileSync(contextPath, 'utf8');
    // Table rows: | `semantic.color.text.default` | `#171717` | Primary body text |
    for (const m of md.matchAll(/^\|\s*`(semantic\.color\.[\w.]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/gm)) {
      const cssVar = '--ds-' + m[1].replace(/\./g, '-');
      const entry = map.get(cssVar);
      if (entry) entry.description = m[3].trim();
    }
  }

  tokenCache = map;
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  buildTokenCache(workspaceRoot);

  // Watch css-vars.css for changes and rebuild cache
  const config = vscode.workspace.getConfiguration('dsm');
  const cssAbsPath = path.join(workspaceRoot, config.get('cssVarsPath'));
  if (fs.existsSync(path.dirname(cssAbsPath))) {
    cacheWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, config.get('cssVarsPath'))
    );
    cacheWatcher.onDidChange(() => buildTokenCache(workspaceRoot));
    cacheWatcher.onDidCreate(() => buildTokenCache(workspaceRoot));
    context.subscriptions.push(cacheWatcher);
  }

  const LANGUAGES = ['css', 'scss', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact'];

  // ── Completions ───────────────────────────────────────────────────────────
  // Triggered after typing "var(--ds-" or just "--ds-"
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    LANGUAGES,
    {
      provideCompletionItems(document, position) {
        const linePrefix = document.lineAt(position).text.slice(0, position.character);
        // Only trigger when cursor follows "var(--ds-" or "--ds-"
        if (!/(?:var\()?--ds-[\w-]*$/.test(linePrefix)) return;

        return Array.from(tokenCache.entries()).map(([cssVar, meta]) => {
          const item = new vscode.CompletionItem(cssVar, vscode.CompletionItemKind.Color);
          item.detail = meta.value;
          item.documentation = new vscode.MarkdownString(
            (meta.description ? `**${meta.description}**\n\n` : '') +
            `Value: \`${meta.value}\``
          );
          // Insert just the variable name (minus "--" if "var(--" was already typed)
          item.insertText = cssVar;
          item.filterText = cssVar;
          return item;
        });
      },
    },
    '-' // trigger character
  );

  // ── Hover ─────────────────────────────────────────────────────────────────
  // Show value + description when hovering over a --ds-* variable
  const hoverProvider = vscode.languages.registerHoverProvider(LANGUAGES, {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(
        position,
        /--ds-[\w-]+/
      );
      if (!range) return;

      const cssVar = document.getText(range);
      const meta = tokenCache.get(cssVar);
      if (!meta) return;

      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${cssVar}**\n\n`);
      if (meta.description) md.appendMarkdown(`${meta.description}\n\n`);
      md.appendCodeblock(meta.value, 'css');
      return new vscode.Hover(md, range);
    },
  });

  context.subscriptions.push(completionProvider, hoverProvider);
}

function deactivate() {
  cacheWatcher?.dispose();
}

module.exports = { activate, deactivate };
