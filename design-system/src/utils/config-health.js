import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { buildCommand } from '../commands/build.js';
import { generateContextCommand } from '../commands/generate-context.js';
import { discoverComponents, resolveComponentSourcePath } from './component-discovery.js';

const GENERATED_FILES = [
  'build/css-vars.css',
  'build/tailwind.tokens.cjs',
  'build/tokens.js',
  'context.md',
];

function createIssue(severity, code, message, data = {}) {
  return { severity, code, message, ...data };
}

function isStructurallyValidTokenRef(reference) {
  if (typeof reference !== 'string' || reference.trim() === '') return false;
  if (reference.startsWith('--ds-')) return true;
  return /^(primitive|semantic|component)\.[a-z0-9*.-]+$/i.test(reference);
}

function loadJsonFile(filePath, label, issues, severity = 'fatal') {
  if (!existsSync(filePath)) {
    issues.push(createIssue(severity, `${label}-missing`, `${filePath} does not exist.`, { path: filePath }));
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    issues.push(createIssue('fatal', `${label}-parse-error`, `${filePath} could not be parsed: ${error.message}`, { path: filePath }));
    return null;
  }
}

function validateScripts(repoRoot, issues) {
  const packagePath = resolve(repoRoot, 'package.json');
  if (!existsSync(packagePath)) {
    issues.push(createIssue('warning', 'package-json-missing', 'package.json is missing, so DSM scripts cannot be validated.', { path: packagePath }));
    return;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch (error) {
    issues.push(createIssue('fatal', 'package-json-parse-error', `package.json could not be parsed: ${error.message}`, { path: packagePath }));
    return;
  }

  const scriptsToCheck = ['dsm', 'dsm:validate', 'dsm:update'];
  for (const scriptName of scriptsToCheck) {
    const command = pkg.scripts?.[scriptName];
    if (!command) {
      issues.push(createIssue('warning', 'script-missing', `package.json is missing the "${scriptName}" script.`, {
        path: packagePath,
        scriptName,
      }));
      continue;
    }

    const nodeMatch = command.match(/node\s+([^\s]+)/);
    if (nodeMatch) {
      const scriptTarget = resolve(repoRoot, nodeMatch[1]);
      if (!existsSync(scriptTarget)) {
        issues.push(createIssue('fatal', 'script-target-missing', `Script "${scriptName}" points to a missing CLI target: ${nodeMatch[1]}.`, {
          path: packagePath,
          scriptName,
          target: scriptTarget,
        }));
      }
      continue;
    }

    if (/\bdsm\b/.test(command)) {
      const installedBin = resolve(repoRoot, 'node_modules/.bin/dsm');
      const wrapperBin = resolve(repoRoot, 'design-system/bin/dsm.js');
      if (!existsSync(installedBin) && !existsSync(wrapperBin)) {
        issues.push(createIssue('fatal', 'script-cli-missing', `Script "${scriptName}" expects a working dsm binary, but neither node_modules/.bin/dsm nor design-system/bin/dsm.js exists.`, {
          path: packagePath,
          scriptName,
        }));
      }
    }
  }
}

function validateMcpSettings(repoRoot, issues) {
  const settingsPath = resolve(repoRoot, '.claude/settings.json');
  if (!existsSync(settingsPath)) {
    issues.push(createIssue('warning', 'mcp-settings-missing', 'No .claude/settings.json file was found for DSM MCP wiring.', { path: settingsPath }));
    return;
  }

  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    issues.push(createIssue('fatal', 'mcp-settings-parse-error', `.claude/settings.json could not be parsed: ${error.message}`, { path: settingsPath }));
    return;
  }

  const dsmServer = settings.mcpServers?.dsm;
  if (!dsmServer) {
    issues.push(createIssue('warning', 'mcp-server-missing', 'No DSM MCP server entry was found in .claude/settings.json.', { path: settingsPath }));
    return;
  }

  if (!dsmServer.command) {
    issues.push(createIssue('fatal', 'mcp-command-missing', 'DSM MCP wiring is missing its command.', { path: settingsPath }));
  }

  if (dsmServer.command === 'node' && Array.isArray(dsmServer.args) && dsmServer.args[0]) {
    const target = resolve(repoRoot, dsmServer.args[0]);
    if (!existsSync(target)) {
      issues.push(createIssue('fatal', 'mcp-target-missing', `DSM MCP wiring points to a missing executable target: ${dsmServer.args[0]}.`, {
        path: settingsPath,
        target,
      }));
    }
  }
}

async function checkGeneratedFiles(paths, issues, options = {}) {
  const { allowRebuild = true } = options;
  const missingFiles = GENERATED_FILES
    .map((relativePath) => ({
      relativePath,
      absolutePath: resolve(paths.dsRoot, relativePath),
    }))
    .filter((entry) => !existsSync(entry.absolutePath));

  if (missingFiles.length === 0) return;

  if (!allowRebuild) {
    missingFiles.forEach((entry) => {
      issues.push(createIssue('warning', 'generated-file-missing', `Generated file is missing: ${entry.relativePath}.`, { path: entry.absolutePath }));
    });
    return;
  }

  try {
    await buildCommand();
    await generateContextCommand();
  } catch (error) {
    missingFiles.forEach((entry) => {
      issues.push(createIssue('warning', 'generated-file-missing', `Generated file is missing and DSM could not rebuild it automatically (${entry.relativePath}): ${error.message}`, { path: entry.absolutePath }));
    });
  }
}

function summarizeHealth(issues) {
  return {
    fatal: issues.filter((issue) => issue.severity === 'fatal').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
  };
}

export async function collectConfigHealth(paths, options = {}) {
  const issues = [];
  const componentsFile = loadJsonFile(paths.componentsPath, 'components', issues);
  const tokensFile = loadJsonFile(paths.tokensPath, 'tokens', issues);

  const registryComponents = Array.isArray(componentsFile?.components) ? componentsFile.components : [];
  const discovery = discoverComponents(paths.repoRoot);
  const discoveredByName = discovery.byName;
  const diagnosticsByName = {};
  const duplicateNames = new Set();
  const seenNames = new Set();

  for (const component of registryComponents) {
    const name = String(component.name || '').trim();
    if (!name) {
      issues.push(createIssue('fatal', 'component-name-missing', 'A component entry is missing its "name".'));
      continue;
    }

    if (seenNames.has(name)) duplicateNames.add(name);
    seenNames.add(name);
  }

  duplicateNames.forEach((name) => {
    issues.push(createIssue('fatal', 'duplicate-component-name', `Duplicate component name found in registry: ${name}.`, { componentName: name }));
  });

  const registeredNames = new Set(registryComponents.map((component) => component.name).filter(Boolean));

  for (const component of registryComponents) {
    const componentName = component.name;
    if (!componentName) continue;

    const sourcePath = resolveComponentSourcePath(paths.repoRoot, component.path || '');
    const sourceExists = Boolean(component.path) && existsSync(sourcePath);
    const discovered = discoveredByName.get(componentName);
    const contains = Array.isArray(component.contains)
      ? component.contains.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const unresolvedContains = contains.filter((name) => !registeredNames.has(name));
    const invalidTokenRefs = (component.tokens || []).filter((tokenRef) => !isStructurallyValidTokenRef(tokenRef));

    if (!component.path) {
      issues.push(createIssue('fatal', 'component-path-missing', `Component "${componentName}" is missing its source path.`, { componentName }));
    } else if (!sourceExists) {
      const scaffolded = /^src\/components\/(ui|features)\//.test(component.path);
      issues.push(createIssue(
        scaffolded ? 'fatal' : 'warning',
        'component-path-missing',
        `Component "${componentName}" points to a missing source path: ${component.path}.`,
        { componentName, path: sourcePath, scaffolded },
      ));
    }

    unresolvedContains.forEach((dependency) => {
      issues.push(createIssue('fatal', 'component-contains-missing', `Component "${componentName}" contains "${dependency}", but that component is not registered.`, {
        componentName,
        dependency,
      }));
    });

    invalidTokenRefs.forEach((tokenRef) => {
      issues.push(createIssue('warning', 'component-token-reference-invalid', `Component "${componentName}" has a token reference that does not look valid: ${tokenRef}.`, {
        componentName,
        tokenRef,
      }));
    });

    diagnosticsByName[componentName] = {
      sourceExists,
      discoveredPath: discovered?.path || null,
      exportDetected: Boolean(discovered),
      metadataOnly: !sourceExists,
      missingDependencies: unresolvedContains,
      invalidTokenRefs,
      pathStatus: sourceExists ? 'found' : 'missing',
    };
  }

  if (!tokensFile) {
    issues.push(createIssue('fatal', 'tokens-unavailable', 'Token validation could not run because tokens.json is missing or invalid.', { path: paths.tokensPath }));
  }

  await checkGeneratedFiles(paths, issues, { allowRebuild: options.allowRebuildGenerated !== false });
  validateMcpSettings(paths.repoRoot, issues);
  validateScripts(paths.repoRoot, issues);

  const summary = summarizeHealth(issues);

  return {
    ok: summary.fatal === 0,
    issues,
    summary,
    diagnosticsByName,
    discoveredComponents: discovery.components,
  };
}
