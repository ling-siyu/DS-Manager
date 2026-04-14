import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolveProjectPaths } from '../utils/paths.js';
import { collectScanResults } from './scan.js';
import { searchTokens } from './get-token.js';
import { getComponents } from './list-components.js';
import { getDsmVersion } from '../utils/metadata.js';

export async function serveCommand() {
  const { tokensPath, componentsPath } = resolveProjectPaths();

  const server = new Server(
    { name: 'dsm', version: getDsmVersion() },
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
      const results = searchTokens(args.query, tokensPath);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No tokens found matching "${args.query}"` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    if (name === 'list_components') {
      const components = getComponents(componentsPath, args?.filter);
      if (components === null) {
        return { content: [{ type: 'text', text: 'No components.json found.' }] };
      }
      if (components.length === 0) {
        return { content: [{ type: 'text', text: 'No components found.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(components, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
