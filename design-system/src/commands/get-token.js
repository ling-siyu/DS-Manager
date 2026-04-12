import chalk from 'chalk';
import { loadTokens } from '../utils/tokens.js';
import { resolveProjectPaths } from '../utils/paths.js';

/**
 * Pure search — no I/O. Returns { results } where results is an array of
 * matched token objects ready for display or MCP response.
 */
export function searchTokens(query, tokensPath) {
  const tokens = loadTokens(tokensPath);
  const queryLower = query.toLowerCase();

  const matches = Object.entries(tokens).filter(([path, token]) =>
    path === query ||
    token.cssVar === query ||
    path.toLowerCase().includes(queryLower) ||
    token.cssVar.toLowerCase().includes(queryLower)
  );

  const results = matches.map(([path, token]) => ({
    path,
    cssVar: token.cssVar,
    value: token.$value,
    resolvedValue: token.resolvedValue,
    type: token.$type,
    description: token.$description,
  }));

  return results;
}

export async function getTokenCommand(query, options = {}) {
  const { tokensPath } = resolveProjectPaths();
  const results = searchTokens(query, tokensPath);

  if (results.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log(chalk.yellow(`\nNo tokens found matching "${query}"\n`));
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(chalk.cyan(`\n${results.length} token${results.length !== 1 ? 's' : ''} found:\n`));
  for (const r of results) {
    console.log(chalk.bold(r.path));
    console.log(`  ${chalk.dim('CSS Variable:')}   ${chalk.white(r.cssVar)}`);
    console.log(`  ${chalk.dim('Resolved Value:')} ${chalk.white(String(r.resolvedValue))}`);
    if (r.value !== r.resolvedValue) {
      console.log(`  ${chalk.dim('Raw Value:')}      ${chalk.dim(String(r.value))}`);
    }
    if (r.type) console.log(`  ${chalk.dim('Type:')}           ${chalk.dim(r.type)}`);
    if (r.description) console.log(`  ${chalk.dim('Description:')}    ${r.description}`);
    console.log();
  }
}
