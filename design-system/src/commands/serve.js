import { readFileSync, existsSync } from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolveProjectPaths } from '../utils/paths.js';
import { collectScanResults } from './scan.js';

function flattenTokens(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      result[path] = value;
    } else if (value && typeof value === 'object') {
      Object.assign(result, flattenTokens(value, path));
    }
  }
  return result;
}

function resolveReference(ref, flat) {
  const inner = ref.replace(/^\{|\}$/g, '');
  return flat[inner]?.$value ?? ref;
}

function loadTokens(tokensPath) {
  const raw = JSON.parse(readFileSync(tokensPath, 'utf8'));
  const flat = flattenTokens(raw);
  // Resolve all references to final values
  const resolved = {};
  for (const [path, token] of Object.entries(flat)) {
    const rawVal = token.$value;
    resolved[path] = {
      ...token,
      cssVar: `--ds-${path.replace(/\./g, '-')}`,
      resolvedValue: rawVal.startsWith('{') ? resolveReference(rawVal, flat) : rawVal,
    };
  }
  return resolved;
}

export async function serveCommand() {
  const { tokensPath, componentsPath } = resolveProjectPaths();

  const server = new Server(
    { name: 'dsm', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_token',
        description: 'Look up a design token by name or CSS variable. Returns value, type, description, and CSS variable name.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Token path (e.g. "semantic.color.text.default") or CSS var name (e.g. "--ds-semantic-color-text-default") or partial name to search',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_components',
        description: 'List all registered design system components with their variants, props, and file paths.',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Optional filter string to search component names',
            },
          },
        },
      },
      {
        name: 'validate_file',
        description: 'Validate a file or directory for design system violations (hardcoded colors, arbitrary values, etc.).',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to the file or directory to validate',
            },
          },
          required: ['path'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'get_token') {
      const tokens = loadTokens(tokensPath);
      const query = args.query.toLowerCase();

      // Exact match first (by path or cssVar)
      let matches = Object.entries(tokens).filter(([path, token]) => {
        return (
          path === args.query ||
          token.cssVar === args.query ||
          path.toLowerCase().includes(query) ||
          token.cssVar.toLowerCase().includes(query)
        );
      });

      if (matches.length === 0) {
        return {
          content: [{ type: 'text', text: `No tokens found matching "${args.query}"` }],
        };
      }

      const results = matches.map(([path, token]) => ({
        path,
        cssVar: token.cssVar,
        value: token.$value,
        resolvedValue: token.resolvedValue,
        type: token.$type,
        description: token.$description,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      };
    }

    if (name === 'list_components') {
      if (!existsSync(componentsPath)) {
        return { content: [{ type: 'text', text: 'No components.json found.' }] };
      }

      const registry = JSON.parse(readFileSync(componentsPath, 'utf8'));
      let components = registry.components ?? [];

      if (args?.filter) {
        const f = args.filter.toLowerCase();
        components = components.filter(c => c.name.toLowerCase().includes(f));
      }

      if (components.length === 0) {
        return { content: [{ type: 'text', text: 'No components found.' }] };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(components, null, 2) }],
      };
    }

    if (name === 'validate_file') {
      const { totalErrors, totalWarnings, results } = await collectScanResults(args.path);

      const output = {
        path: args.path,
        totalErrors,
        totalWarnings,
        passed: totalErrors === 0,
        violations: results,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
