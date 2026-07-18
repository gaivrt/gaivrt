import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { triggerDeploy } from './index.mjs';

test('one Queue batch triggers one POST request', async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return new Response(null, { status: 200 });
  };

  await triggerDeploy('https://example.com/deploy-hook', fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://example.com/deploy-hook');
  assert.equal(calls[0][1].method, 'POST');
});

test('a failed deploy hook rejects so Queue can retry the batch', async () => {
  const fetchImpl = async () => new Response(null, { status: 503 });

  await assert.rejects(
    triggerDeploy('https://example.com/deploy-hook', fetchImpl),
    /returned 503/,
  );
});

test('a missing secret fails before making a request', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response(null, { status: 200 });
  };

  await assert.rejects(triggerDeploy('', fetchImpl), /not configured/);
  assert.equal(called, false);
});

test('the Queue handler uses the secret binding', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(null, { status: 200 });
  };

  try {
    await worker.queue(
      { messages: [{ body: { action: 'PutObject' } }] },
      { CF_DEPLOY_HOOK: 'https://example.com/deploy-hook' },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
});
