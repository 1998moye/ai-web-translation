import { INLINE_MARKER_PATTERN, stripInlineMarkers } from '@/shared/inline-markers';
import { normalizeText } from '@/shared/text';

export type InlineWrapTag = 'a' | 'em' | 'strong';

export type InlineFormat =
  | { marker: string; kind: 'opaque'; tag: 'code'; text: string }
  | {
      marker: string;
      kind: 'wrap';
      tag: InlineWrapTag;
      href?: string;
      target?: string;
      rel?: string;
    };

export interface InlinePayload {
  /** 提交给 Translation Engine 的原文，含行内格式占位标记。 */
  text: string;
  formats: InlineFormat[];
}

const CODE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TT']);

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'VIDEO',
  'AUDIO', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'META', 'LINK', 'MAP', 'AREA',
]);

const WRAP_TAGS: Record<string, InlineWrapTag> = {
  A: 'a',
  EM: 'em',
  I: 'em',
  STRONG: 'strong',
  B: 'strong',
};

/** 渲染层创建的所有节点都带这个属性，扫描与监听据此忽略插件自身内容。 */
export const OWN_NODE_ATTRIBUTE = 'data-aiwt';

export const OWN_NODE_SELECTOR = `[${OWN_NODE_ATTRIBUTE}]`;

export function isCodeElement(element: Element): boolean {
  return CODE_TAGS.has(element.tagName.toUpperCase());
}

export function isHiddenElement(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  if (element.getAttribute('aria-hidden') === 'true') return true;
  const inlineStyle = (element as HTMLElement).style;
  if (inlineStyle) {
    if (inlineStyle.display === 'none') return true;
    if (inlineStyle.visibility === 'hidden' || inlineStyle.visibility === 'collapse') return true;
  }
  const view = element.ownerDocument?.defaultView;
  if (!view) return false;
  try {
    const computed = view.getComputedStyle(element);
    return computed.display === 'none' || computed.visibility === 'hidden' || computed.visibility === 'collapse';
  } catch {
    return false;
  }
}

function shouldSkipElement(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName.toUpperCase())) return true;
  if (element.hasAttribute(OWN_NODE_ATTRIBUTE)) return true;
  if (isHiddenElement(element)) return true;
  if (element.getAttribute('contenteditable') === '' || element.getAttribute('contenteditable') === 'true') {
    return true;
  }
  return false;
}

/**
 * 把一个元素的可见文本收集为翻译单元原文：
 * - 行内代码变为不可翻译的占位标记，内容不进入请求；
 * - 链接与强调被标记包裹，便于渲染层还原（不注入模型返回的 HTML）；
 * - 脚本、样式、隐藏内容、表单输入和插件自身节点被跳过。
 */
export function buildInlinePayload(root: Element): InlinePayload | null {
  if (shouldSkipElement(root) || isCodeElement(root)) return null;

  const formats: InlineFormat[] = [];
  const parts: string[] = [];
  let opaqueSlot = 0;
  let wrapSlot = 0;

  const walkChildren = (element: Element): void => {
    for (const child of Array.from(element.childNodes)) walk(child);
  };

  const walk = (node: Node): void => {
    if (node.nodeType === node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== node.ELEMENT_NODE) return;

    const element = node as Element;
    if (shouldSkipElement(element)) return;

    if (element.tagName === 'BR') {
      parts.push(' ');
      return;
    }

    if (isCodeElement(element)) {
      const code = normalizeText(element.textContent ?? '');
      if (code) {
        opaqueSlot += 1;
        const marker = `⟦o${opaqueSlot}⟧`;
        formats.push({ marker, kind: 'opaque', tag: 'code', text: code });
        parts.push(` ${marker} `);
      }
      return;
    }

    const wrapTag = WRAP_TAGS[element.tagName.toUpperCase()];
    if (wrapTag) {
      wrapSlot += 1;
      const key = `w${wrapSlot}`;
      const href = wrapTag === 'a' ? element.getAttribute('href') : null;
      const format: InlineFormat = { marker: `⟦${key}⟧`, kind: 'wrap', tag: wrapTag };
      if (href) {
        format.href = href;
        const target = element.getAttribute('target');
        const rel = element.getAttribute('rel');
        if (target) format.target = target;
        if (rel) format.rel = rel;
      }
      formats.push(format);
      parts.push(`⟦${key}⟧`);
      walkChildren(element);
      parts.push(`⟦/${key}⟧`);
      return;
    }

    walkChildren(element);
  };

  walkChildren(root);

  const text = normalizeMarkerSpacing(parts.join(''));
  if (!text) return null;
  if (!/[A-Za-z]/.test(stripInlineMarkers(text))) return null;

  return { text, formats };
}

/** 折叠空白，并去掉格式标记内侧的空格，避免译文里出现首尾空白。 */
function normalizeMarkerSpacing(text: string): string {
  return normalizeText(text)
    .replace(/⟦(w\d+)⟧\s+/g, '⟦$1⟧')
    .replace(/\s+⟦\/(w\d+)⟧/g, '⟦/$1⟧');
}

function plainText(text: string): string {
  return normalizeText(stripInlineMarkers(text));
}

/** 供悬停查看原文使用：去掉标记后的纯文本。 */
export function formatPlainText(text: string): string {
  return plainText(text);
}

interface TextToken {
  type: 'text';
  value: string;
}

interface OpaqueToken {
  type: 'opaque';
  format: Extract<InlineFormat, { kind: 'opaque' }>;
}

interface OpenToken {
  type: 'open';
  marker: string;
  format: Extract<InlineFormat, { kind: 'wrap' }>;
}

interface CloseToken {
  type: 'close';
  marker: string;
}

type RenderToken = TextToken | OpaqueToken | OpenToken | CloseToken;

type ParseResult = { ok: true; tokens: RenderToken[] } | { ok: false };

/**
 * 严格解析模型返回的标记：
 * 未知标记、不配对或错序的包裹标记都会导致解析失败，
 * 此时退回纯文本渲染，绝不猜测性结构。
 */
function parseRenderedText(text: string, formats: readonly InlineFormat[]): ParseResult {
  const byMarker = new Map(formats.map((format) => [format.marker, format]));
  const tokens: RenderToken[] = [];
  const openStack: string[] = [];
  let cursor = 0;

  const pattern = new RegExp(INLINE_MARKER_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [raw, slash, kind, digits] = match;
    if (match.index > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, match.index) });
    }
    cursor = match.index + raw.length;

    const marker = `⟦${slash}${kind}${digits}⟧`;

    if (slash) {
      const openMarker = `⟦${kind}${digits}⟧`;
      const format = byMarker.get(openMarker);
      if (!format || format.kind !== 'wrap') return { ok: false };
      if (openStack.pop() !== openMarker) return { ok: false };
      tokens.push({ type: 'close', marker: openMarker });
      continue;
    }

    const format = byMarker.get(marker);
    if (!format) return { ok: false };

    if (format.kind === 'opaque') {
      tokens.push({ type: 'opaque', format });
      continue;
    }

    openStack.push(marker);
    tokens.push({ type: 'open', marker, format });
  }

  if (openStack.length > 0) return { ok: false };
  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) });

  return { ok: true, tokens: normalizeTokens(tokens) };
}

function normalizeTokens(tokens: RenderToken[]): RenderToken[] {
  const normalized: RenderToken[] = [];

  for (const token of tokens) {
    if (token.type !== 'text') {
      normalized.push(token);
      continue;
    }
    const value = token.value.replace(/\s+/g, ' ');
    if (!value) continue;
    const previous = normalized[normalized.length - 1];
    if (previous?.type === 'text') {
      normalized[normalized.length - 1] = { type: 'text', value: previous.value + value };
    } else {
      normalized.push({ type: 'text', value });
    }
  }

  const first = normalized[0];
  if (first?.type === 'text') normalized[0] = { type: 'text', value: first.value.replace(/^\s+/, '') };
  const last = normalized[normalized.length - 1];
  if (last?.type === 'text') {
    normalized[normalized.length - 1] = { type: 'text', value: last.value.replace(/\s+$/, '') };
  }

  return normalized.filter((token) => token.type !== 'text' || token.value.length > 0);
}

/**
 * 把译文文本与格式定义还原为安全的 DOM 节点。
 * 只创建白名单元素（a/em/strong/code），文本一律走 textContent，
 * 因此模型输出中的 HTML、脚本或事件处理器不会变成可执行内容。
 */
export function createInlineNodes(
  doc: Document,
  translatedText: string,
  formats: readonly InlineFormat[],
): Node[] {
  const parsed = parseRenderedText(translatedText, formats);
  if (!parsed.ok) {
    const fallback = plainText(translatedText);
    return fallback ? [doc.createTextNode(fallback)] : [];
  }

  const nodes: Node[] = [];
  const stack: Element[] = [];

  const append = (node: Node): void => {
    const parent = stack[stack.length - 1];
    if (parent) parent.appendChild(node);
    else nodes.push(node);
  };

  for (const token of parsed.tokens) {
    if (token.type === 'text') {
      append(doc.createTextNode(token.value));
    } else if (token.type === 'opaque') {
      const code = doc.createElement('code');
      code.setAttribute(OWN_NODE_ATTRIBUTE, 'inline');
      code.textContent = token.format.text;
      append(code);
    } else if (token.type === 'open') {
      const element = doc.createElement(token.format.tag);
      element.setAttribute(OWN_NODE_ATTRIBUTE, 'inline');
      if (token.format.href) element.setAttribute('href', token.format.href);
      if (token.format.target) element.setAttribute('target', token.format.target);
      element.setAttribute('rel', token.format.rel ?? 'noopener noreferrer');
      append(element);
      stack.push(element);
    } else {
      stack.pop();
    }
  }

  return nodes;
}
