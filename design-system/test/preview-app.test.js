import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { normalizeWrappedOutput } from '../src/ui-react/wrappers.js';

test('normalizeWrappedOutput accepts plain objects that expose children', () => {
  const fallback = React.createElement('button', null, 'Hello');
  const wrapped = normalizeWrappedOutput({ children: fallback }, fallback, 'adapter.renderProviders');

  assert.equal(renderToStaticMarkup(wrapped), '<button>Hello</button>');
});

test('normalizeWrappedOutput accepts wrapper component objects', () => {
  function Wrapper({ children }) {
    return React.createElement('section', { 'data-kind': 'wrapper' }, children);
  }

  const fallback = React.createElement('button', null, 'Hello');
  const wrapped = normalizeWrappedOutput({ wrapper: Wrapper, children: fallback }, fallback, 'adapter.renderProviders');

  assert.equal(
    renderToStaticMarkup(wrapped),
    '<section data-kind="wrapper"><button>Hello</button></section>',
  );
});
