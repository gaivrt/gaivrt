// 错误码常量 + 标准 ApiError
//
// 用法：
//   throw new ApiError(401, 'UNAUTHENTICATED', 'session token missing');
// errorBoundary 中间件捕获后归一化为：
//   { ok: false, error: { code, message, trace_id } }

export class ApiError extends Error {
  public status: number;
  public code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

// 错误码字典（前端按此对照中文文案）
export const ERR = {
  INVALID_CODE:     { status: 400, code: 'INVALID_CODE' },
  BAD_FORMAT:       { status: 400, code: 'BAD_FORMAT' },
  BAD_REQUEST:      { status: 400, code: 'BAD_REQUEST' },
  UNAUTHENTICATED:  { status: 401, code: 'UNAUTHENTICATED' },
  QUOTA_EXHAUSTED:  { status: 402, code: 'QUOTA_EXHAUSTED' },
  BAD_HMAC:         { status: 403, code: 'BAD_HMAC' },
  TURNSTILE_FAILED: { status: 403, code: 'TURNSTILE_FAILED' },
  CODE_NOT_FOUND:   { status: 404, code: 'CODE_NOT_FOUND' },
  NOT_FOUND:        { status: 404, code: 'NOT_FOUND' },
  CODE_USED:        { status: 409, code: 'CODE_USED' },
  CODE_EXPIRED:     { status: 410, code: 'CODE_EXPIRED' },
  GONE:             { status: 410, code: 'GONE' },
  BAD_REDEMPTION:   { status: 422, code: 'BAD_REDEMPTION' },  // payload 字段非法（管理员录错）
  RATE_LIMIT:       { status: 429, code: 'RATE_LIMIT' },
  INTERNAL:         { status: 500, code: 'INTERNAL' },
  WX_API_FAIL:      { status: 502, code: 'WX_API_FAIL' },
  UPSTREAM_FAIL:    { status: 502, code: 'UPSTREAM_FAIL' },
  SERVICE_UNAVAIL:  { status: 503, code: 'SERVICE_UNAVAIL' },
} as const;

export function fail(kind: keyof typeof ERR, message: string): never {
  const e = ERR[kind];
  throw new ApiError(e.status, e.code, message);
}
