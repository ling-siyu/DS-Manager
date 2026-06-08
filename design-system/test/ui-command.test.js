import test from 'node:test';
import assert from 'node:assert/strict';

import { dsmDataPlugin, findAvailablePort, createBindErrorMessage } from '../src/commands/ui.js';

test('dsmDataPlugin serves the preview payload as a virtual module', () => {
  const plugin = dsmDataPlugin(() => ({ hello: 'world' }));
  assert.equal(plugin.resolveId('virtual:dsm-data'), '\0virtual:dsm-data');
  assert.equal(plugin.resolveId('something-else'), null);

  const code = plugin.load('\0virtual:dsm-data');
  assert.match(code, /export default \{"hello":"world"\}/);
  assert.equal(plugin.load('something-else'), null);
});

test('dsmDataPlugin re-reads the getter on each load (live data)', () => {
  let value = { n: 1 };
  const plugin = dsmDataPlugin(() => value);
  assert.match(plugin.load('\0virtual:dsm-data'), /"n":1/);
  value = { n: 2 };
  assert.match(plugin.load('\0virtual:dsm-data'), /"n":2/);
});

test('findAvailablePort + createBindErrorMessage remain exported for the ui command', () => {
  assert.equal(typeof findAvailablePort, 'function');
  assert.match(createBindErrorMessage({ code: 'EADDRINUSE' }, { host: '127.0.0.1', port: 7777 }), /No port available/);
});
