/**
 * 用户可选择的接口方式。
 *
 * 目前只有 OpenAI 兼容的 Chat Completions；将来增加其他方式时，
 * 在这里补充一项即可，配置里已经保存了用户选择的方式。
 */
export interface RequestFormat {
  id: RequestFormatId;
  /** 设置页下拉框显示的名称。 */
  label: string;
  /** 用户只填基础地址时要补上的接口路径。 */
  endpointPath: string;
}

export const REQUEST_FORMATS = [
  { id: 'chat-completions', label: 'Chat Completions（OpenAI 兼容）', endpointPath: '/chat/completions' },
] as const satisfies readonly { id: string; label: string; endpointPath: string }[];

export type RequestFormatId = (typeof REQUEST_FORMATS)[number]['id'];

export const DEFAULT_REQUEST_FORMAT_ID: RequestFormatId = 'chat-completions';

const BY_ID = new Map<string, RequestFormat>(REQUEST_FORMATS.map((format) => [format.id, format]));

export function findRequestFormat(id: unknown): RequestFormat | null {
  return typeof id === 'string' ? (BY_ID.get(id) ?? null) : null;
}

/**
 * 把用户填写的地址补成完整端点：
 *
 * - 只填基础地址（`https://host/v1`）时补上该方式的接口路径；
 * - 已经写到完整端点时原样保留，重复保存不会叠加路径；
 * - 空地址保持为空，由地址校验报告问题；协议检查不受影响。
 */
export function resolveRequestUrl(url: string, formatId: RequestFormatId = DEFAULT_REQUEST_FORMAT_ID): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  const endpointPath = (findRequestFormat(formatId) ?? REQUEST_FORMATS[0]).endpointPath;
  const base = trimmed.replace(/\/+$/, '');
  if (base.toLowerCase().endsWith(endpointPath)) return base;
  return `${base}${endpointPath}`;
}
