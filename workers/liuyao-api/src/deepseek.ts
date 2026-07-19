// DeepSeek client · OpenAI-compatible chat/completions
//
// 错误归一化为三类：
//   - network: fetch throw
//   - http: non-2xx 响应
//   - parse: JSON.parse 失败
// 任一类型都抛 ApiError(502, UPSTREAM_FAIL, ...)，让 interpret.ts 统一 refund。

import type { Env } from './types';
import { ApiError } from './errors';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekRequest {
  messages: DeepSeekMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: false;
}

export interface DeepSeekChoice {
  index: number;
  message: { role: 'assistant'; content: string };
  finish_reason: string;
}

export interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface DeepSeekResponse {
  id?: string;
  model?: string;
  choices: DeepSeekChoice[];
  usage?: DeepSeekUsage;
}

export interface CallResult {
  body: DeepSeekResponse;
  upstreamMs: number;
  upstreamStatus: number;
}

export async function callDeepSeek(env: Env, req: DeepSeekRequest): Promise<CallResult> {
  const url = `${env.DEEPSEEK_BASE_URL}/v1/chat/completions`;
  const body = {
    model: req.model || env.DEEPSEEK_MODEL,
    messages: req.messages,
    max_tokens: req.max_tokens ?? 2500,
    temperature: req.temperature ?? 1.0,
    stream: false as const,
  };

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(502, 'UPSTREAM_FAIL', `deepseek fetch: ${(e as Error).message}`);
  }
  const upstreamMs = Date.now() - t0;

  if (!res.ok) {
    // 不要把 DeepSeek 的错误体直接透给客户端（可能含 key 引用 / 内部信息）
    let snippet = '';
    try { snippet = (await res.text()).slice(0, 200); } catch { /* noop */ }
    throw new ApiError(
      502,
      'UPSTREAM_FAIL',
      `deepseek http ${res.status}${snippet ? `: ${snippet}` : ''}`,
    );
  }

  let data: DeepSeekResponse;
  try {
    data = await res.json();
  } catch (e) {
    throw new ApiError(502, 'UPSTREAM_FAIL', `deepseek parse: ${(e as Error).message}`);
  }

  if (!data?.choices?.length) {
    throw new ApiError(502, 'UPSTREAM_FAIL', 'deepseek returned no choices');
  }

  return { body: data, upstreamMs, upstreamStatus: res.status };
}
