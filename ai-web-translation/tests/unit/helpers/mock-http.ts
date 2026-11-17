import type { HttpAdapter, HttpOutcome, HttpRequest } from '@/modules/translation-chat-completions/http-adapter';

export type MockHttpAdapter = HttpAdapter & { readonly requests: HttpRequest[] };

type Outcome = HttpOutcome | ((request: HttpRequest) => HttpOutcome | Promise<HttpOutcome>);

/** 可控的 HTTP Adapter 替身：记录请求，按预设结果返回。 */
export function createMockHttpAdapter(outcome: Outcome): MockHttpAdapter {
  const requests: HttpRequest[] = [];

  return {
    requests,
    async send(request: HttpRequest): Promise<HttpOutcome> {
      requests.push(request);
      return typeof outcome === 'function' ? await outcome(request) : outcome;
    },
  };
}

export function jsonOutcome(body: unknown, status = 200): HttpOutcome {
  return { ok: true, status, headers: {}, text: JSON.stringify(body) };
}

/** 标准 Chat Completions 响应，content 为助手回复文本。 */
export function completionOutcome(content: string, status = 200): HttpOutcome {
  return jsonOutcome({ choices: [{ message: { role: 'assistant', content } }] }, status);
}

export function textOutcome(text: string, status = 200, headers: Record<string, string> = {}): HttpOutcome {
  return { ok: true, status, headers, text };
}
