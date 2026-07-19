import { buildInterpretationPayload, stripMd } from './prompt';

const DEFAULT_API_BASE = 'https://liuyao.gaivrt.com';
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TEST_SITE_KEY = '1x00000000000000000000AA';
const PRODUCTION_SITE_KEY = '0x4AAAAAAD5K63nb7W6yEBGD';
const TURNSTILE_LOAD_TIMEOUT_MS = 15_000;
const TURNSTILE_CHALLENGE_TIMEOUT_MS = 60_000;

type Quota = {
  daily_remaining: number;
  daily_reset_date: string;
  permanent_balance: number;
  unlimited_until: number;
  total_consumed: number;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; trace_id?: string };
};

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export class LiuyaoInterpretError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'LiuyaoInterpretError';
  }
}

function apiBase() {
  return (import.meta.env.PUBLIC_LIUYAO_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    throw new LiuyaoInterpretError('BAD_FORMAT', '解读服务返回了无法识别的内容。');
  }
}

function friendlyError(code: string, fallback?: string) {
  if (code === 'QUOTA_EXHAUSTED') return '今天的 10 次免费解读已经用完，请明天再来。';
  if (code === 'TURNSTILE_FAILED') return '人机验证没有通过，请稍后重试。';
  if (code === 'RATE_LIMIT') return '当前网络创建了过多匿名会话，请明天再试。';
  if (code === 'UPSTREAM_FAIL') return 'DeepSeek 暂时没有返回结果，本次不会扣次数。';
  if (code === 'UNAUTHENTICATED') return '匿名会话已失效，请重新验证。';
  return fallback || '解读服务暂时不可用，请稍后重试。';
}

async function request<T>(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new LiuyaoInterpretError('NETWORK', '无法连接解读服务，请检查网络后重试。');
  }
  const payload = await parseEnvelope<T>(response);
  if (!response.ok || !payload.ok || !payload.data) {
    const code = payload.error?.code || `HTTP_${response.status}`;
    throw new LiuyaoInterpretError(code, friendlyError(code, payload.error?.message));
  }
  return payload.data;
}

let turnstileScript: Promise<void> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScript) return turnstileScript;
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    let settled = false;
    const finish = (error?: LiuyaoInterpretError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = window.setTimeout(
      () => finish(new LiuyaoInterpretError('TURNSTILE_LOAD', '人机验证加载超时，请重试。')),
      TURNSTILE_LOAD_TIMEOUT_MS,
    );
    script.onload = () => finish();
    script.onerror = () => finish(new LiuyaoInterpretError('TURNSTILE_LOAD', '无法载入人机验证，请重试。'));
    document.head.append(script);
  });
  turnstileScript = pending.catch((error) => {
    turnstileScript = null;
    throw error;
  });
  return turnstileScript;
}

async function getTurnstileToken(): Promise<string> {
  await loadTurnstile();
  const turnstile = window.turnstile;
  if (!turnstile) throw new LiuyaoInterpretError('TURNSTILE_LOAD', '无法启动人机验证。');
  const sitekey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? TEST_SITE_KEY : PRODUCTION_SITE_KEY);
  if (!sitekey) throw new LiuyaoInterpretError('CONFIG', '网站尚未配置人机验证。');

  const mount = document.createElement('div');
  mount.className = 'liuyao-turnstile';
  document.body.append(mount);
  return new Promise<string>((resolve, reject) => {
    let widgetId = '';
    let settled = false;
    const timeout = window.setTimeout(() => {
      finish(undefined, new LiuyaoInterpretError('TURNSTILE_FAILED', '人机验证等待超时，请重试。'));
    }, TURNSTILE_CHALLENGE_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeout);
      if (widgetId) {
        try { turnstile.remove(widgetId); } catch { /* widget may already be gone */ }
      }
      mount.remove();
    };
    const finish = (token?: string, error?: LiuyaoInterpretError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (token) resolve(token);
      else reject(new LiuyaoInterpretError('TURNSTILE_FAILED', '人机验证没有返回结果，请重试。'));
    };
    try {
      widgetId = turnstile.render(mount, {
        sitekey,
        appearance: 'interaction-only',
        theme: 'auto',
        callback: (token: string) => finish(token),
        'error-callback': (code: string) => finish(undefined, new LiuyaoInterpretError('TURNSTILE_FAILED', `人机验证失败（${code}），请重试。`)),
        'expired-callback': () => finish(undefined, new LiuyaoInterpretError('TURNSTILE_FAILED', '人机验证已过期，请重试。')),
        'timeout-callback': () => finish(undefined, new LiuyaoInterpretError('TURNSTILE_FAILED', '人机验证挑战已超时，请重试。')),
        'unsupported-callback': () => finish(undefined, new LiuyaoInterpretError('TURNSTILE_FAILED', '当前浏览器不支持人机验证，请更新浏览器后重试。')),
      });
    } catch {
      finish(undefined, new LiuyaoInterpretError('TURNSTILE_FAILED', '无法启动人机验证，请重试。'));
    }
  });
}

async function readQuota(): Promise<Quota | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/quota`, { credentials: 'include' });
  } catch {
    throw new LiuyaoInterpretError('NETWORK', '无法连接解读服务，请检查网络后重试。');
  }
  if (response.status === 401) return null;
  const payload = await parseEnvelope<Quota>(response);
  if (!response.ok || !payload.ok || !payload.data) {
    const code = payload.error?.code || `HTTP_${response.status}`;
    throw new LiuyaoInterpretError(code, friendlyError(code, payload.error?.message));
  }
  return payload.data;
}

async function ensureWebSession(): Promise<Quota> {
  const existing = await readQuota();
  if (existing) return existing;
  const turnstileToken = await getTurnstileToken();
  const data = await request<{ expires_at: number; quota: Quota }>('/auth/web', {
    method: 'POST',
    body: JSON.stringify({ turnstile_token: turnstileToken }),
  });
  return data.quota;
}

export async function interpretHexagram(result: any, question: string) {
  await ensureWebSession();
  const data = await request<{
    choices: Array<{ message: { content: string } }>;
    quota_after: Quota;
    trace_id: string;
  }>('/interpret', {
    method: 'POST',
    body: JSON.stringify(buildInterpretationPayload(result, question)),
  });
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new LiuyaoInterpretError('BAD_FORMAT', 'DeepSeek 没有返回解读正文。');
  return { text: stripMd(content), quota: data.quota_after, traceId: data.trace_id };
}
