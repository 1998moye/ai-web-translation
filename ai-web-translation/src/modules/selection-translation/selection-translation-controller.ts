import { createRequestId, createSessionId, createUnitId, type ProfileId } from '@/shared/ids';
import { normalizeText } from '@/shared/text';
import type {
  TranslationProfileCatalog,
  TranslationProfileSummary,
} from '../translation-contract/profile-catalog';
import type { TranslationEngine } from '../translation-contract/translation-engine';
import type { TranslationUnit } from '../translation-contract/types';
import { classifyText } from '../language/language';
import { containsCjk, extractTranslatableSegments } from './translation-segments';

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

/** 选区读取结果；代码内容已从待翻译文本中排除。 */
export interface SelectionReading {
  /** 待翻译文本：已去掉代码块与行内代码。 */
  text: string;
  /** 原始选区文本，用于在气泡里展示原文。 */
  rawText: string;
  rect: SelectionRect;
  /** 选区是否包含或整个落在代码内容里。 */
  codeExcluded: boolean;
}

/** 选区来源：测试可以完全控制文本、位置与代码排除结果。 */
export interface SelectionSource {
  read(): SelectionReading | null;
}

/** 气泡里的一个翻译片段；按原文顺序展示。 */
export interface SelectionBubbleUnit {
  id: string;
  sourceText: string;
  translation?: string;
  error?: string;
}

export type SelectionBubbleStatus = 'loading' | 'success' | 'partial' | 'error';

export interface SelectionBubbleState {
  position: SelectionPoint;
  sourceText: string;
  /** 本次使用的配置 ID；空字符串表示还没有可用配置。 */
  profileId: ProfileId;
  /** 可切换的配置摘要，只有 ID 与名称。 */
  profiles: readonly TranslationProfileSummary[];
  units: readonly SelectionBubbleUnit[];
  status: SelectionBubbleStatus;
  /** 整体失败原因（没有可用配置、选区不可翻译等）。 */
  message?: string;
}

export interface SelectionControllerSnapshot {
  /** 翻译图标位置；null 表示不显示。 */
  iconPosition: SelectionPoint | null;
  /** 图标不可用时的原因；图标仍然显示，点击只说明原因。 */
  iconIssue: string | null;
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
const EMPTY_SNAPSHOT: SelectionControllerSnapshot = { iconPosition: null, iconIssue: null, bubble: null };

interface FrozenSelection {
  rawText: string;
  segments: readonly string[];
  position: SelectionPoint;
}

/**
 * 划词翻译编排：选区识别与内容保护、图标位置、配置切换、气泡状态与过期结果丢弃。
 *
 * 只做「选区 → Translation Engine → 气泡」这一段；分批、缓存、并发与重试都在
 * Translation Engine 内部，这里只消费公开事件。
 */
export class SelectionTranslationController {
  private readonly options: SelectionTranslationControllerOptions;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly listeners = new Set<() => void>();

  private reading: SelectionReading | null = null;
  private segments: readonly string[] = [];
  private iconIssue: string | null = null;
  private frozen: FrozenSelection | null = null;
  private bubble: SelectionBubbleState | null = null;
  /** 每次打开气泡、切换配置或选区变化都会推进代数，用于丢弃过期响应。 */
  private generation = 0;
  private activeSessionId: string | null = null;
  private snapshot: SelectionControllerSnapshot = EMPTY_SNAPSHOT;
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
   * 只有出现新的非空选区时才让旧气泡失效：点击插件图标或气泡本身可能清空
   * 浏览器选区，那种情况下应当保留已经打开的气泡。
   */
  refresh(): void {
    const reading = this.options.source.read();
    const rawText = reading ? normalizeText(reading.rawText) : '';
    if (!reading || !rawText) {
      this.setSnapshot({ iconPosition: null, iconIssue: null, bubble: this.bubble });
      return;
    }

    const segments = extractTranslatableSegments(reading.text);
    const issue = segments.length === 0 ? describeSelectionIssue(reading, rawText) : null;
    const changed = this.reading?.rawText !== rawText || this.segments.join('\u0000') !== segments.join('\u0000');

    this.reading = reading;
    this.segments = segments;
    this.iconIssue = issue;
    if (changed && this.bubble) this.invalidateBubble();

    this.setSnapshot({ iconPosition: iconPositionOf(reading.rect), iconIssue: issue, bubble: this.bubble });
  }

  /** 点击翻译图标：用最后记录的有效选区打开气泡并请求译文。 */
  async translateSelection(): Promise<void> {
    // 气泡正在加载时忽略重复点击，避免出现两份互相竞争的结果。
    if (this.bubble?.status === 'loading') return;

    const reading = this.reading;
    if (!reading) return;

    const rawText = normalizeText(reading.rawText);
    const position = bubblePositionOf(reading.rect);
    const segments = this.segments;
    const generation = ++this.generation;
    this.frozen = { rawText, segments, position };

    if (segments.length === 0) {
      // 不可翻译的选区不发起请求，只说明原因。
      this.releaseSession();
      this.setBubble({
        position,
        sourceText: rawText,
        profileId: '',
        profiles: this.bubble?.profiles ?? [],
        units: [],
        status: 'error',
        message: this.iconIssue ?? '没有识别到需要翻译的英文内容。',
      });
      return;
    }

    // 先展示加载状态，再解析可用配置，避免点击后没有任何反馈。
    this.setBubble({
      position,
      sourceText: rawText,
      profileId: '',
      profiles: this.bubble?.profiles ?? [],
      units: [],
      status: 'loading',
    });

    const catalog = await this.options.profiles.listProfiles();
    if (generation !== this.generation) return;

    const profile = catalog.find((item) => item.isDefault) ?? catalog[0];
    if (!profile) {
      this.setBubble({
        position,
        sourceText: rawText,
        profileId: '',
        profiles: catalog,
        units: [],
        status: 'error',
        message: '没有可用的翻译服务配置，请先在设置中创建并选择默认配置。',
      });
      return;
    }

    await this.runTranslation({ profile, profiles: catalog, generation });
  }

  /** 切换配置：用同一份冻结的选区重新翻译，旧结果全部丢弃。 */
  async selectProfile(profileId: ProfileId): Promise<void> {
    const frozen = this.frozen;
    if (!frozen || !this.bubble) return;
    if (this.bubble.profileId === profileId && this.bubble.status !== 'error') return;

    const generation = ++this.generation;
    this.releaseSession();

    const catalog = await this.options.profiles.listProfiles();
    if (generation !== this.generation) return;

    const profile = catalog.find((item) => item.id === profileId);
    if (!profile) {
      this.setBubble({
        ...this.bubble,
        profiles: catalog,
        status: 'error',
        message: '这个翻译服务配置已不可用，请选择其他配置。',
      });
      return;
    }

    await this.runTranslation({ profile, profiles: catalog, generation });
  }

  closeBubble(): void {
    this.invalidateBubble();
    this.setSnapshot({ ...this.snapshot, bubble: null });
  }

  private async runTranslation(input: {
    profile: TranslationProfileSummary;
    profiles: readonly TranslationProfileSummary[];
    generation: number;
  }): Promise<void> {
    const frozen = this.frozen;
    if (!frozen) return;

    const units: TranslationUnit[] = frozen.segments.map((text) => ({
      id: createUnitId(),
      kind: 'body',
      text,
    }));

    this.setBubble({
      position: frozen.position,
      sourceText: frozen.rawText,
      profileId: input.profile.id,
      profiles: input.profiles,
      units: units.map((unit) => ({ id: unit.id, sourceText: unit.text })),
      status: 'loading',
    });

    const sessionId = createSessionId();
    this.activeSessionId = sessionId;

    try {
      for await (const event of this.options.engine.translate({
        sessionId,
        requestId: createRequestId(),
        profileId: input.profile.id,
        units,
      })) {
        if (input.generation !== this.generation) return;

        if (event.type === 'unit-succeeded') {
          this.applyUnitResult(event.unitId, { translation: event.text });
          continue;
        }
        if (event.type === 'unit-failed') {
          this.applyUnitResult(event.unitId, { error: event.error.message });
          continue;
        }
        this.finishRun();
      }
      this.finishRun();
    } catch {
      if (input.generation !== this.generation) return;
      this.finishRun('翻译请求失败，请稍后重试。');
    } finally {
      if (this.activeSessionId === sessionId) this.activeSessionId = null;
    }
  }

  /** 流结束后仍未返回的片段标记为失败，避免气泡一直停在加载状态。 */
  private finishRun(message = '翻译服务没有返回这个片段的译文。'): void {
    const bubble = this.bubble;
    if (!bubble || bubble.status !== 'loading') return;

    const units = bubble.units.map((unit) =>
      unit.translation === undefined && unit.error === undefined ? { ...unit, error: message } : unit,
    );
    this.setBubble({ ...bubble, units, status: statusOfUnits(units) });
  }

  private applyUnitResult(unitId: string, patch: { translation?: string; error?: string }): void {
    const bubble = this.bubble;
    if (!bubble) return;

    const units = bubble.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch } : unit));
    this.setBubble({ ...bubble, units, status: statusOfUnits(units) });
  }

  private readonly handleSelectionChange = (): void => {
    this.refresh();
  };

  private readonly handleScroll = (): void => {
    // 选区视觉位置随滚动变化，图标位置已失效；气泡是独立浮层，保持打开。
    if (!this.snapshot.iconPosition) return;
    this.setSnapshot({ ...this.snapshot, iconPosition: null });
  };

  private releaseSession(): void {
    const sessionId = this.activeSessionId;
    this.activeSessionId = null;
    if (sessionId) void this.options.engine.cancelSession(sessionId);
  }

  private invalidateBubble(): void {
    this.generation += 1;
    this.releaseSession();
    this.frozen = null;
    this.bubble = null;
  }

  private setBubble(bubble: SelectionBubbleState | null): void {
    this.setSnapshot({ ...this.snapshot, bubble });
  }

  private setSnapshot(next: SelectionControllerSnapshot): void {
    const previous = this.snapshot;
    const changed =
      previous.bubble !== next.bubble ||
      previous.iconIssue !== next.iconIssue ||
      previous.iconPosition?.left !== next.iconPosition?.left ||
      previous.iconPosition?.top !== next.iconPosition?.top;

    this.bubble = next.bubble;
    this.snapshot = next;
    if (!changed) return;

    for (const listener of [...this.listeners]) listener();
  }
}

function statusOfUnits(units: readonly SelectionBubbleUnit[]): SelectionBubbleStatus {
  const pending = units.filter((unit) => unit.translation === undefined && unit.error === undefined).length;
  if (pending > 0) return 'loading';

  const failed = units.filter((unit) => unit.error !== undefined).length;
  if (failed === 0) return 'success';
  return failed === units.length ? 'error' : 'partial';
}

function describeSelectionIssue(reading: SelectionReading, rawText: string): string {
  if (reading.codeExcluded && !reading.text.trim()) {
    return '选中的是代码内容，代码块、命令和行内代码默认不翻译。';
  }
  if (containsCjk(rawText)) {
    return '选区已经是中文，不需要翻译。';
  }
  if (classifyText(rawText) === 'untranslatable') {
    return '选区只有数字或符号，没有需要翻译的英文。';
  }
  return '没有识别到需要翻译的英文内容。';
}

function iconPositionOf(rect: SelectionRect): SelectionPoint {
  return { left: rect.left + rect.width / 2, top: rect.top + rect.height + ICON_OFFSET };
}

function bubblePositionOf(rect: SelectionRect): SelectionPoint {
  return { left: rect.left + rect.width / 2, top: rect.top + rect.height + ICON_OFFSET + 36 };
}
