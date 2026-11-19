/** 可中止的 HTTP 请求描述；与具体传输实现无关。 */
export interface HttpRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export type HttpFailureReason = 'network' | 'timeout' | 'aborted';

/**
 * 传输层的归一结果：HTTP 状态码不在这里判断，
 * 由 Chat Completions 层分类为脱敏错误。
 */
export type HttpOutcome =
  | { ok: true; status: number; headers: Record<string, string>; text: string }
  | { ok: false; reason: HttpFailureReason };

/** 测试用 mock Adapter 与生产 fetch Adapter 共同实现的最小接口。 */
export interface HttpAdapter {
  send(request: HttpRequest): Promise<HttpOutcome>;
}

/** 后台使用：直接连接用户选择的翻译服务，不经过任何中转。 */
export function createFetchHttpAdapter(fetchImpl: typeof fetch = fetch): HttpAdapter {
  return {
    async send(request: HttpRequest): Promise<HttpOutcome> {
      try {
        const response = await fetchImpl(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          credentials: 'omit',
          cache: 'no-store',
          ...(request.signal ? { signal: request.signal } : {}),
        });
        const text = await response.text();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        return { ok: true, status: response.status, headers, text };
      } catch (error) {
        return { ok: false, reason: failureReason(error) };
      }
    },
  };
}

function failureReason(error: unknown): HttpFailureReason {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  if (name === 'TimeoutError') return 'timeout';
  if (name === 'AbortError') return 'aborted';
  return 'network';
}
