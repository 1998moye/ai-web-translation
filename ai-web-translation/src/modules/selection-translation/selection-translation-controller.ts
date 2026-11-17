import { createUnitId, createRequestId, createSessionId } from '@/shared/ids';
import { normalizeText } from '@/shared/text';
import { classifyText } from '../language/language';
import type { TranslationProfileCatalog } from '../translation-contract/profile-catalog';
import type { TranslationEngine } from '../translation-contract/translation-engine';
import type { TranslationUnit } from '../translation-contract/types';

/** 视口坐标；只依赖选择区域的几何信息，不依赖具体浏览器 API。 */
export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SelectionPoint {
  left: number;
  top: number;
}

/** 选区来源：测试可以完全控制文本与位置。 */
export interface SelectionSource {
  read(): { text: string; rect: SelectionRect } | null;
}

export type SelectionBubbleState =
  | { status: 'loading'; position: SelectionPoint; sourceText: string }
  | { status: 'success'; position: SelectionPoint; sourceText: string; translation: string }
  | { status: 'error'; position: SelectionPoint; sourceText: string; message: string };

export interface SelectionControllerSnapshot {
  /** 翻译图标位置；null 表示不显示。 */
  iconPosition: SelectionPoint | null;
  /** 译文气泡；null 表示没有打开的气泡。同一时刻只有一个气泡。 */
  bubble: SelectionBubbleState | null;
}

export interface SelectionTranslationControllerOptions {
  engine: TranslationEngine;
  profiles: TranslationProfileCatalog;
  source: SelectionSource;
  doc?: Document;
  win?: Window;
}

const ICON_OFFSET = 8;

/**
 * 划词翻译编排：选区识别、图标位置、气泡状态与过期结果丢弃。
 *
 * 只做「选区 → Translation Engine → 气泡」这一段；扫描、分批、缓存与
 * 重试都在 Translation Engine 内部，这里只消费公开事件。
 */
export class SelectionTranslationController {
  private readonly options: SelectionTranslationControllerOptions;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly listeners = new Set<() => void>();

  private selection: { text: string; rect: SelectionRect } | null = null;
  private bubble: SelectionBubbleState | null = null;
  /** 每次打开气泡或选区变化都会推进代数，用于丢弃过期响应。 */
  private generation = 0;
  private activeSessionId: string | null = null;
  private snapshot: SelectionControllerSnapshot = { iconPosition: null, bubble: null };
  private mounted = false;

  constructor(options: SelectionTranslationControllerOptions) {
    this.options = options;
    this.doc = options.doc ?? document;
    this.win = options.win ?? window;
  }

  getSnapshot(): SelectionControllerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;

    this.doc.addEventListener('selectionchange', this.handleSelectionChange);
    this.doc.addEventListener('mouseup', this.handleSelectionChange);
    this.doc.addEventListener('keyup', this.handleSelectionChange);
    this.win.addEventListener('scroll', this.handleScroll, { passive: true });
  }

  destroy(): void {
    if (!this.mounted) return;
    this.mounted = false;

    this.doc.removeEventListener('selectionchange', this.handleSelectionChange);
    this.doc.removeEventListener('mouseup', this.handleSelectionChange);
    this.doc.removeEventListener('keyup', this.handleSelectionChange);
    this.win.removeEventListener('scroll', this.handleScroll);
    this.closeBubble();
    this.listeners.clear();
  }

  /**
   * 重新读取选区。
   *
   * 只有出现新的非空选区时才让旧气泡失效：点击插件图标本身可能清空浏览器选区，
   * 那种情况下应当保留已经打开的气泡。
   */
  refresh(): void {
    const next = this.options.source.read();
    const text = next ? normalizeText(next.text) : '';

    if (!next || classifyText(text) !== 'english') {
      // 选区清空时只隐藏图标，但保留最后一次有效选区：
      // 点击插件图标本身可能让浏览器清空选区，此时点击处理仍需原文。
      this.setSnapshot({ iconPosition: null, bubble: this.bubble });
      return;
    }

    const changed = !this.selection || this.selection.text !== text;
    this.selection = { text, rect: next.rect };
    if (changed && this.bubble) this.invalidateBubble();

    this.setSnapshot({
      iconPosition: iconPositionOf(next.rect),
      bubble: this.bubble,
    });
  }

  /** 点击翻译图标：用最后记录的有效选区打开气泡并请求译文。 */
  async translateSelection(): Promise<void> {
    const selection = this.selection;
    if (!selection) return;
    // 气泡正在加载时忽略重复点击，避免出现两份互相竞争的结果。
    if (this.bubble?.status === 'loading') return;

    const generation = ++this.generation;
    const position = bubblePositionOf(selection.rect);
    this.setSnapshot({
      iconPosition: this.snapshot.iconPosition,
      bubble: { status: 'loading', position, sourceText: selection.text },
    });

    const profile = await this.options.profiles.getDefaultProfile();
    if (generation !== this.generation) return;

    if (!profile) {
      this.settleError(generation, position, selection.text, '没有可用的翻译服务配置，请先在设置中创建并选择默认配置。');
      return;
    }

    const sessionId = createSessionId();
    this.activeSessionId = sessionId;
    const units: TranslationUnit[] = [{ id: createUnitId(), kind: 'body', text: selection.text }];
    let settled = false;

    try {
      for await (const event of this.options.engine.translate({
        sessionId,
        requestId: createRequestId(),
        profileId: profile.id,
        units,
      })) {
        if (generation !== this.generation) return;

        if (event.type === 'unit-succeeded') {
          settled = true;
          this.settleSuccess(generation, position, selection.text, event.text);
          continue;
        }
        if (event.type === 'unit-failed') {
          settled = true;
          this.settleError(generation, position, selection.text, event.error.message);
          continue;
        }
        if (!settled) {
          this.settleError(generation, position, selection.text, '翻译服务没有返回可用的译文。');
        }
      }
    } catch {
      this.settleError(generation, position, selection.text, '翻译请求失败，请稍后重试。');
    } finally {
      if (this.activeSessionId === sessionId) this.activeSessionId = null;
    }
  }

  closeBubble(): void {
    this.invalidateBubble();
    this.setSnapshot({ iconPosition: this.snapshot.iconPosition, bubble: null });
  }

  private readonly handleSelectionChange = (): void => {
    this.refresh();
  };

  private readonly handleScroll = (): void => {
    // 选区视觉位置随滚动变化，图标位置已失效；气泡是独立浮层，保持打开。
    if (!this.snapshot.iconPosition) return;
    this.setSnapshot({ iconPosition: null, bubble: this.bubble });
  };

  private invalidateBubble(): void {
    this.generation += 1;
    const sessionId = this.activeSessionId;
    this.activeSessionId = null;
    this.bubble = null;
    if (sessionId) void this.options.engine.cancelSession(sessionId);
  }

  private settleSuccess(
    generation: number,
    position: SelectionPoint,
    sourceText: string,
    translation: string,
  ): void {
    if (generation !== this.generation) return;
    this.setSnapshot({
      iconPosition: this.snapshot.iconPosition,
      bubble: { status: 'success', position, sourceText, translation },
    });
  }

  private settleError(
    generation: number,
    position: SelectionPoint,
    sourceText: string,
    message: string,
  ): void {
    if (generation !== this.generation) return;
    this.setSnapshot({
      iconPosition: this.snapshot.iconPosition,
      bubble: { status: 'error', position, sourceText, message },
    });
  }

  private setSnapshot(next: SelectionControllerSnapshot): void {
    const previous = this.snapshot;
    const changed =
      previous.bubble !== next.bubble ||
      previous.iconPosition?.left !== next.iconPosition?.left ||
      previous.iconPosition?.top !== next.iconPosition?.top;

    this.bubble = next.bubble;
    this.snapshot = next;
    if (!changed) return;

    for (const listener of [...this.listeners]) listener();
  }
}

function iconPositionOf(rect: SelectionRect): SelectionPoint {
  return { left: rect.left + rect.width / 2, top: rect.top + rect.height + ICON_OFFSET };
}

function bubblePositionOf(rect: SelectionRect): SelectionPoint {
  return { left: rect.left + rect.width / 2, top: rect.top + rect.height + ICON_OFFSET + 36 };
}
