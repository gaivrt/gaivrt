import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index';
import { ApiError } from '../src/errors';
import { prepareEnsureQuotaRow } from '../src/db';
import { acquireInterpretQuota, validateAndNormalize } from '../src/interpret';
import { callDeepSeek } from '../src/deepseek';
import { INTERPRETATION_MODEL } from '../../../src/lib/liuyao/prompt';
import {
  consumeSessionCreationAllowance,
  hashIp,
  isAllowedWebOrigin,
  isOwnerIpAllowed,
  verifyTurnstile,
  webSessionCookieOptions,
} from '../src/webAuth';

function env(overrides: Record<string, unknown> = {}) {
  return {
    ENV: 'prod',
    WEB_ORIGINS: 'https://gaivrt.com,https://www.gaivrt.com,https://gaivrt.online,https://www.gaivrt.online',
    WEB_SESSION_CREATIONS_PER_IP: '3',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    SESSION_HMAC_SECRET: 'session-secret',
    FREE_DAILY_QUOTA: '10',
    TZ_OFFSET_MINUTES: '480',
    ...overrides,
  } as any;
}

test('Browser interpretation payload uses the supported DeepSeek V4 Flash model', () => {
  assert.equal(INTERPRETATION_MODEL, 'deepseek-v4-flash');
});

test('Legacy DeepSeek model aliases fall back to the production default', () => {
  const messages = [{ role: 'user', content: '测试' }];
  assert.equal(validateAndNormalize({ messages, model: 'deepseek-chat' }).model, undefined);
  assert.equal(validateAndNormalize({ messages, model: 'deepseek-v4-flash' }).model, 'deepseek-v4-flash');
});

test('DeepSeek V4 Flash preserves the legacy non-thinking behavior', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamBody: any;
  globalThis.fetch = async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      choices: [{ index: 0, message: { role: 'assistant', content: '卦辞' }, finish_reason: 'stop' }],
    }));
  };
  try {
    await callDeepSeek(env({
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_MODEL: 'deepseek-v4-flash',
      DEEPSEEK_API_KEY: 'test-key',
    }), { messages: [{ role: 'user', content: '测试' }] });
    assert.equal(upstreamBody.model, 'deepseek-v4-flash');
    assert.deepEqual(upstreamBody.thinking, { type: 'disabled' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Web origins are exact, not suffix matches', () => {
  const bindings = env();
  assert.equal(isAllowedWebOrigin(bindings, 'https://gaivrt.com'), true);
  assert.equal(isAllowedWebOrigin(bindings, 'https://gaivrt.online'), true);
  assert.equal(isAllowedWebOrigin(bindings, 'https://evil.gaivrt.com'), false);
  assert.equal(isAllowedWebOrigin(bindings, 'https://evil.gaivrt.online'), false);
  assert.equal(isAllowedWebOrigin(bindings, undefined), false);
});

test('Turnstile success is bound to an allowed production hostname', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: 'gaivrt.com' }));
  try {
    await verifyTurnstile(env(), 'valid-token', '203.0.113.5');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Turnstile rejects a mismatched hostname', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: 'attacker.example' }));
  try {
    await assert.rejects(
      verifyTurnstile(env(), 'valid-token', '203.0.113.5'),
      (error: unknown) => error instanceof ApiError && error.code === 'TURNSTILE_FAILED',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Turnstile rejects a production response without hostname binding', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }));
  try {
    await assert.rejects(
      verifyTurnstile(env(), 'valid-token', '203.0.113.5'),
      (error: unknown) => error instanceof ApiError && error.code === 'TURNSTILE_FAILED',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Anonymous session creation is capped per HMACed IP and day', async () => {
  const bindings = env({
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ attempts: 4 }) }),
      }),
    },
  });
  await assert.rejects(
    consumeSessionCreationAllowance(bindings, '203.0.113.5'),
    (error: unknown) => error instanceof ApiError && error.code === 'RATE_LIMIT',
  );
});

test('Owner allowance compares only the HMACed IP fingerprint', async () => {
  const expectedHash = await hashIp(env(), '203.0.113.5');
  let boundHash = '';
  const bindings = env({
    DB: {
      prepare: () => ({
        bind: (value: string) => {
          boundHash = value;
          return { first: async () => ({ allowed: 1 }) };
        },
      }),
    },
  });

  assert.equal(await isOwnerIpAllowed(bindings, '203.0.113.5'), true);
  assert.equal(boundHash, expectedHash);
  assert.notEqual(boundHash, '203.0.113.5');
  assert.equal(await isOwnerIpAllowed(bindings, 'unknown'), false);
});

test('Owner interpretation bypass does not read or decrement user quota', async () => {
  const bindings = env({
    DB: {
      prepare: () => {
        throw new Error('quota database must not be touched');
      },
    },
  });
  assert.equal(await acquireInterpretQuota(bindings, 42, true), 'unlimited');
});

test('New users receive ten daily interpretations', () => {
  let values: unknown[] = [];
  const statement: any = { bind: (...args: unknown[]) => { values = args; return statement; } };
  prepareEnsureQuotaRow(env({ DB: { prepare: () => statement } }), 42);
  assert.equal(values[0], 42);
  assert.equal(values[1], 10);
});

test('Production Web sessions use a secure HttpOnly host cookie', () => {
  const options = webSessionCookieOptions(env(), 2000, 1000);
  assert.deepEqual(options, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 1000,
  });
});

test('CORS credentials are returned only to the allowed site', async () => {
  const allowed = await worker.fetch(new Request('https://liuyao.gaivrt.com/quota', {
    method: 'OPTIONS',
    headers: { Origin: 'https://gaivrt.com', 'Access-Control-Request-Method': 'GET' },
  }), env(), {} as any);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://gaivrt.com');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');

  const denied = await worker.fetch(new Request('https://liuyao.gaivrt.com/quota', {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example', 'Access-Control-Request-Method': 'GET' },
  }), env(), {} as any);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});
