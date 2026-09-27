import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceConfig, workspaceFor } from '../server/http/workspaces.js';

test('separate hosts choose interfaces without a query-string mode switch', () => {
  const config = workspaceConfig({ PORT: '4328' });
  assert.equal(workspaceFor('hackathon.localhost:4328', config).mode, 'hackathon');
  for (const host of [
    'localhost:4328',
    '127.0.0.1:4328',
    'hackathon.localhost:4317',
    'unknown.localhost:4328',
  ]) {
    assert.equal(workspaceFor(host, config).mode, 'product');
  }
  assert.equal(workspaceFor('HACKATHON.localhost:4328', config).mode, 'hackathon');
});

test('public origins work with HTTPS and only exact configured hosts match', () => {
  const config = workspaceConfig({
    PRODUCT_ORIGIN: 'https://kontur.example',
    HACKATHON_ORIGIN: 'https://hackathon.kontur.example',
  });
  assert.equal(workspaceFor('hackathon.kontur.example', config).mode, 'hackathon');
  assert.equal(workspaceFor('hackathon.kontur.example.evil', config).mode, 'product');
  assert.equal(workspaceFor('hackathon.kontur.example', config).productUrl, 'https://kontur.example');
  assert.throws(() =>
    workspaceConfig({ PRODUCT_ORIGIN: 'https://a.example', HACKATHON_ORIGIN: 'https://a.example' }),
  );
  for (const value of [
    'javascript:alert(1)',
    'https://a.example/path',
    'https://user:pass@a.example',
    'https://a.example?mode=demo',
  ]) {
    assert.throws(() => workspaceConfig({ HACKATHON_ORIGIN: value }));
  }
});
