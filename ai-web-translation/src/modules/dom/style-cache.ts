/**
 * 单次扫描/渲染内共享的样式与可见性缓存。
 *
 * `getComputedStyle` 与逐层祖先检查都会触发布局/样式计算；页面越大，
 * 对每个候选元素、每个后代重复检查越容易把主线程卡住。缓存以 Element 为键：
 * 同一元素在本次扫描中只读一次样式，隐藏状态也只计算一次。
 */
export class StyleCache {
  private readonly doc: Document;
  private readonly styles = new Map<Element, CSSStyleDeclaration | null>();
  private readonly hidden = new Map<Element, boolean>();

  constructor(doc: Document) {
    this.doc = doc;
  }

  get(element: Element): CSSStyleDeclaration | null {
    const cached = this.styles.get(element);
    if (cached !== undefined) return cached;

    let style: CSSStyleDeclaration | null;
    try {
      style = this.doc.defaultView?.getComputedStyle(element) ?? null;
    } catch {
      style = null;
    }
    this.styles.set(element, style);
    return style;
  }

  isHidden(element: Element): boolean {
    const cached = this.hidden.get(element);
    if (cached !== undefined) return cached;

    const result = this.computeHidden(element);
    this.hidden.set(element, result);
    return result;
  }

  private computeHidden(element: Element): boolean {
    if (element.hasAttribute('hidden')) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;

    const inlineStyle = (element as HTMLElement).style;
    if (inlineStyle) {
      if (inlineStyle.display === 'none') return true;
      if (inlineStyle.visibility === 'hidden' || inlineStyle.visibility === 'collapse') return true;
      if (inlineStyle.opacity === '0') return true;
    }

    // 祖先隐藏时后代必然隐藏；递归缓存让同一条祖先链只检查一遍。
    const parent = element.parentElement;
    if (parent && this.isHidden(parent)) return true;

    const style = this.get(element);
    if (!style) return false;

    // display: contents 的元素没有自己的盒子，浏览器会一律判成不可见，
    // 但它包住的正文照常绘制。GitHub 仓库页的外壳就是这样包住整片正文的，
    // 一旦据此跳过，整页只剩下外壳以外的几条导航链接能翻。
    if (style.display !== 'contents') {
      const checkVisibility = (element as Element & {
        checkVisibility?: (options?: { checkVisibilityCSS?: boolean }) => boolean;
      }).checkVisibility;
      if (typeof checkVisibility === 'function') {
        try {
          if (!checkVisibility.call(element, { checkVisibilityCSS: true })) return true;
        } catch {
          // 回退到 computed style 检查。
        }
      }
    }

    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
      return true;
    }
    return isVisuallyHidden(style);
  }
}

/**
 * 无障碍用的「仅屏幕阅读器可见」文本：绝对定位并裁剪到 1px 左右。
 *
 * 例如徽章里的 reputation score。这类文字用户看不见，却会被算进所在容器的
 * 文字里，让一个纯数字徽章变成翻译单元，于是在旁边多出一份译文。
 */
export function isVisuallyHidden(computed: CSSStyleDeclaration): boolean {
  // content-visibility: hidden 的子树不会被绘制，等价于隐藏（折叠 <details> 也走这条）。
  if (computed.getPropertyValue('content-visibility') === 'hidden') return true;

  const opacity = Number.parseFloat(computed.getPropertyValue('opacity'));
  if (Number.isFinite(opacity) && opacity === 0) return true;

  const fontSize = Number.parseFloat(computed.getPropertyValue('font-size'));
  if (Number.isFinite(fontSize) && fontSize === 0) return true;

  const textIndent = Number.parseFloat(computed.getPropertyValue('text-indent'));
  if (Number.isFinite(textIndent) && textIndent <= -999) return true;

  const clipPath = computed.getPropertyValue('clip-path');
  if (clipPath && clipPath.includes('inset(50%)')) return true;

  const position = computed.getPropertyValue('position');
  const width = Number.parseFloat(computed.getPropertyValue('width'));
  const height = Number.parseFloat(computed.getPropertyValue('height'));
  const tiny = Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1;
  const overflow = computed.getPropertyValue('overflow');

  // sr-only 文本有时用绝对定位 + 1px 尺寸，有时用 overflow:hidden + 1px 尺寸。
  if (tiny && (position === 'absolute' || position === 'fixed' || overflow === 'hidden')) return true;

  const clip = computed.getPropertyValue('clip');
  return Boolean(clip && clip !== 'auto');
}
