import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { collectConfigHealth } from '../src/utils/config-health.js';
import { resolveProjectPaths } from '../src/utils/paths.js';
import { discoverComponents } from '../src/utils/component-discovery.js';
import { buildSyncPlan } from '../src/commands/sync-components.js';
import { getDsmVersion } from '../src/utils/metadata.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..');

function createFixtureProject() {
  const root = mkdtempSync(resolve(tmpdir(), 'dsm-doctor-test-'));
  mkdirSync(resolve(root, 'design-system/build'), { recursive: true });
  mkdirSync(resolve(root, 'design-system/bin'), { recursive: true });
  mkdirSync(resolve(root, 'src/components/ui'), { recursive: true });
  mkdirSync(resolve(root, '.claude'), { recursive: true });

  writeFileSync(resolve(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    private: true,
    scripts: {
      dsm: 'node design-system/bin/dsm.js',
      'dsm:validate': 'node design-system/bin/dsm.js validate .',
      'dsm:update': 'node design-system/bin/dsm.js update',
    },
  }, null, 2));

  writeFileSync(resolve(root, '.claude/settings.json'), JSON.stringify({
    mcpServers: {
      dsm: {
        command: 'node',
        args: ['./design-system/bin/dsm.js', 'serve'],
        cwd: root,
      },
    },
  }, null, 2));

  writeFileSync(resolve(root, 'design-system/tokens.json'), JSON.stringify({
    primitive: {
      color: {
        brand: {
          500: {
            $type: 'color',
            $value: '#000000',
          },
        },
      },
    },
  }, null, 2));

  writeFileSync(resolve(root, 'design-system/build/css-vars.css'), ':root{}');
  writeFileSync(resolve(root, 'design-system/build/tailwind.tokens.cjs'), 'module.exports = {};');
  writeFileSync(resolve(root, 'design-system/build/tokens.js'), 'export default {};');
  writeFileSync(resolve(root, 'design-system/context.md'), '# context');
  writeFileSync(resolve(root, 'design-system/bin/dsm.js'), '#!/usr/bin/env node\nconsole.log("fixture");\n');

  return root;
}

test('CLI bootstrap executes correctly through a symlinked bin shim path', () => {
  const binRoot = mkdtempSync(resolve(tmpdir(), 'dsm-bin-test-'));
  const shimPath = resolve(binRoot, 'dsm');
  const cliPath = resolve(PACKAGE_ROOT, 'src/cli.js');

  symlinkSync(cliPath, shimPath);
  chmodSync(cliPath, 0o755);

  const result = spawnSync(shimPath, ['--version'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), getDsmVersion());
});

test('doctor catches missing component source paths and broken contains references', async () => {
  const root = createFixtureProject();

  writeFileSync(resolve(root, 'design-system/components.json'), JSON.stringify({
    components: [
      {
        name: 'Button',
        path: 'src/components/ui/Button.tsx',
        contains: ['Icon'],
        tokens: ['semantic.color.text.default'],
      },
    ],
  }, null, 2));

  const health = await collectConfigHealth(resolveProjectPaths(root, { allowMissingTokens: true }), {
    allowRebuildGenerated: false,
  });

  assert.equal(health.ok, false);
  assert.ok(health.issues.some((issue) => issue.code === 'component-path-missing'));
  assert.ok(health.issues.some((issue) => issue.code === 'component-contains-missing'));
});

test('discoverComponents finds exported React components and infers simple props metadata', () => {
  const root = createFixtureProject();

  writeFileSync(resolve(root, 'src/components/ui/Button.tsx'), `
    import React from 'react';
    export interface ButtonProps {
      variant?: 'primary' | 'secondary';
      size?: 'sm' | 'md';
      disabled?: boolean;
    }
    export function Button(props: ButtonProps) {
      return <button>{props.variant}</button>;
    }
  `);

  const discovery = discoverComponents(root);
  const button = discovery.components.find((component) => component.name === 'Button');

  assert.ok(button);
  assert.equal(button.path, 'src/components/ui/Button.tsx');
  assert.deepEqual(button.variants, ['primary', 'secondary']);
  assert.deepEqual(button.sizes, ['sm', 'md']);
  assert.equal(button.props.disabled.type, 'boolean');
});

test('discoverComponents ignores exported constants that are not React components', () => {
  const root = createFixtureProject();

  writeFileSync(resolve(root, 'src/components/ui/ChatbotMessageList.tsx'), `
    export const QUICK_QUESTIONS = [
      '现在该买入吗？',
      '要止盈吗？',
    ];

    export function ChatbotMessageList() {
      return <ul><li>hi</li></ul>;
    }
  `);

  const discovery = discoverComponents(root);

  assert.ok(discovery.components.some((component) => component.name === 'ChatbotMessageList'));
  assert.ok(!discovery.components.some((component) => component.name === 'QUICK_QUESTIONS'));
});

test('sync plan preserves manual metadata in merge mode while updating discovered paths', () => {
  const registry = {
    components: [
      {
        name: 'Button',
        path: 'src/components/legacy/Button.tsx',
        description: 'Manual description',
        tokens: ['component.button.*'],
      },
    ],
  };
  const discoveredComponents = [
    {
      name: 'Button',
      path: 'src/components/ui/Button.tsx',
      props: {
        variant: {
          type: 'string',
          options: ['primary'],
        },
      },
      variants: ['primary'],
      sizes: [],
    },
  ];

  const plan = buildSyncPlan(registry, discoveredComponents, { merge: true });
  const mergedButton = plan.nextRegistry.components.find((component) => component.name === 'Button');

  assert.equal(plan.changed, true);
  assert.equal(mergedButton.path, 'src/components/ui/Button.tsx');
  assert.equal(mergedButton.description, 'Manual description');
  assert.deepEqual(mergedButton.tokens, ['component.button.*']);
  assert.deepEqual(mergedButton.variants, ['primary']);
});

test('sync plan drops registry-only components when merge mode is disabled', () => {
  const registry = {
    components: [
      {
        name: 'LegacyCard',
        path: 'src/components/ui/LegacyCard.tsx',
      },
    ],
  };

  const plan = buildSyncPlan(registry, [], { merge: false });

  assert.equal(plan.changed, true);
  assert.deepEqual(plan.registryOnly.map((component) => component.name), ['LegacyCard']);
  assert.deepEqual(plan.nextRegistry.components, []);
});

test('sync plan reports metadata drift when inferred props or variants change', () => {
  const registry = {
    components: [
      {
        name: 'Button',
        path: 'src/components/ui/Button.tsx',
        props: {
          variant: {
            type: 'string',
            options: ['primary'],
          },
        },
        variants: ['primary'],
        sizes: ['sm'],
      },
    ],
  };
  const discoveredComponents = [
    {
      name: 'Button',
      path: 'src/components/ui/Button.tsx',
      props: {
        variant: {
          type: 'string',
          options: ['primary', 'secondary'],
        },
        disabled: {
          type: 'boolean',
        },
      },
      variants: ['primary', 'secondary'],
      sizes: ['sm', 'md'],
    },
  ];

  const plan = buildSyncPlan(registry, discoveredComponents, { merge: false });

  assert.equal(plan.changed, true);
  assert.deepEqual(plan.metadataDrift, [
    {
      name: 'Button',
      path: 'src/components/ui/Button.tsx',
      fields: ['props', 'variants', 'sizes'],
    },
  ]);
});

test('sync plan merge mode transfers renamed registry metadata onto discovered components', () => {
  const registry = {
    components: [
      {
        name: 'QUICK_QUESTIONS',
        path: 'src/components/chatbot/ChatbotMessageList.tsx',
        description: 'Old scaffold entry',
        tokens: ['component.chatbot.questions.*'],
        status: 'beta',
      },
    ],
  };
  const discoveredComponents = [
    {
      name: 'ChatbotMessageList',
      path: 'src/components/chatbot/ChatbotMessageList.tsx',
      props: {},
      variants: [],
      sizes: [],
    },
  ];

  const plan = buildSyncPlan(registry, discoveredComponents, { merge: true });

  assert.deepEqual(plan.renamedCandidates, [
    {
      from: 'QUICK_QUESTIONS',
      to: 'ChatbotMessageList',
      path: 'src/components/chatbot/ChatbotMessageList.tsx',
    },
  ]);
  assert.deepEqual(plan.registryOnly, [
    {
      name: 'QUICK_QUESTIONS',
      path: 'src/components/chatbot/ChatbotMessageList.tsx',
      description: 'Old scaffold entry',
      tokens: ['component.chatbot.questions.*'],
      status: 'beta',
    },
  ]);
  assert.deepEqual(plan.nextRegistry.components, [
    {
      name: 'ChatbotMessageList',
      path: 'src/components/chatbot/ChatbotMessageList.tsx',
      description: 'Old scaffold entry',
      tokens: ['component.chatbot.questions.*'],
      status: 'beta',
    },
  ]);
});

test('sync plan merge mode drops stale renamed registry entries even when the discovered target already exists', () => {
  const registry = {
    components: [
      {
        name: 'QUICK_QUESTIONS',
        path: 'src/components/chatbot/ChatbotMessageList.tsx',
        description: 'Old scaffold entry',
        tokens: ['component.chatbot.questions.*'],
      },
      {
        name: 'ChatbotMessageList',
        path: 'src/components/chatbot/ChatbotMessageList.tsx',
        status: 'stable',
      },
    ],
  };
  const discoveredComponents = [
    {
      name: 'ChatbotMessageList',
      path: 'src/components/chatbot/ChatbotMessageList.tsx',
      props: {},
      variants: [],
      sizes: [],
    },
  ];

  const plan = buildSyncPlan(registry, discoveredComponents, { merge: true });

  assert.deepEqual(plan.nextRegistry.components, [
    {
      name: 'ChatbotMessageList',
      path: 'src/components/chatbot/ChatbotMessageList.tsx',
      description: 'Old scaffold entry',
      tokens: ['component.chatbot.questions.*'],
      status: 'stable',
    },
  ]);
});
