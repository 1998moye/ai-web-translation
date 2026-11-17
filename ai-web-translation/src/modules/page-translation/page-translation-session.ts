import { createRequestId, createSessionId, createUnitId } from '@/shared/ids';
import type { ProfileId, RequestId, SessionId, TranslationUnitId } from '@/shared/ids';
import { scanTranslatableTargets, type TranslatableTarget } from '../content-scan/scan-translatable-targets';
import { OWN_NODE_ATTRIBUTE, type InlineFormat } from '../inline-format/inline-format';
import { classifyText } from '../language/language';
import type { TranslationProfileCatalog } from '../translation-contract/profile-catalog';
import { sanitizeError } from '../translation-contract/sanitized-error';
import type { StartTranslationRequest, TranslationEngine } from '../translation-contract/translation-engine';
import type {
  SanitizedTranslationError,
  TranslationContext,
  TranslationEvent,
  TranslationUnit,
  TranslationUnitKind,
} from '../translation-contract/types';
import {
  computeProgress,
  deriveActiveStatus,
  type PageSessionProgress,
  type PageSessionState,
  type PageSessionStatus,
  type UnitPhase,
} from './page-session-state';
import { buildTranslationContext } from './translation-context';
import {
  isRendering,
  renderBodyTranslation,
  renderFailureMarker,
  renderInterfaceTranslation,
  type RenderedTranslation,
} from './translation-renderer';

export interface PageTranslationSessionOptions {
  engine: TranslationEngine;
  profiles: TranslationProfileCatalog;
  doc?: Document;
  /** 单个请求最多包含的翻译单元数。 */
  batchUnitLimit?: number;
  /** 单个请求最多包含的原文长度，用于控制请求体积。 */
  batchCharLimit?: number;
  /** 动态内容重新扫描的防抖时间。 */
  mutationDebounceMs?: number;
  /** 测试可在不启用 MutationObserver 的情况下手动触发扫描。 */
  observeMutations?: boolean;
}

interface UnitRecord {
  id: TranslationUnitId;
  kind: TranslationUnitKind;
  element: HTMLElement;
  originalText: string;
  fingerprint: string;
  formats: InlineFormat[];
  phase: UnitPhase;
  requestId?: RequestId;
  translatedText?: string;
  error?: SanitizedTranslationError;
  rendered?: RenderedTranslation;
}

const DEFAULT_BATCH_UNIT_LIMIT = 20;
const DEFAULT_BATCH_CHAR_LIMIT = 4000;
const DEFAULT_MUTATION_DEBOUNCE_MS = 200;

/**
 * 页面翻译会话：对调用方隐藏扫描、语言判断、翻译单元状态、动态监听、
 * 渲染、恢复和进度。调用方只发起翻译、取消、失败重试或恢复，并观察公开状态。
 */
export class PageTranslationSession {
  readonly sessionId: SessionId = createSessionId();

  private readonly engine: TranslationEngine;
  private readonly profiles: TranslationProfileCatalog;
  private readonly doc: Document;
  private readonly source: PageTranslationSessionOptions;
  private readonly registry = new Map<TranslationUnitId, UnitRecord>();
  private readonly elementRecords = new Map<Element, UnitRecord>();
  private readonly listeners = new Set<(state: PageSessionState) => void>();

  private profileId: ProfileId | null = null;
  private status: PageSessionStatus = 'idle';
  private stateError?: SanitizedTranslationError;
  private started = false;
  private closed = false;
  private mutating = 0;
  private observer: MutationObserver | null = null;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PageTranslationSessionOptions) {
    this.source = options;
    this.engine = options.engine;
    this.profiles = options.profiles;
    this.doc = options.doc ?? document;
  }

  /** 开始会话：固定配置快照、扫描初始内容并开始监听动态内容。 */
  async start(): Promise<PageSessionState> {
    if (this.started) return this.getState();
    this.started = true;
    this.status = 'translating';

    let profile = null;
    try {
      profile = await this.profiles.getDefaultProfile();
    } catch {
      profile = null;
    }

    if (this.closed) return this.getState();

    if (!profile) {
      this.status = 'failed';
      this.stateError = {
        code: 'profile-unavailable',
        message: '没有可用的翻译服务配置，请先在设置中创建并选择默认配置。',
        retryable: false,
      };
      this.emit();
      return this.getState();
    }

    // 配置快照：本次会话后续批次与新增内容都使用这个配置 ID。
    this.profileId = profile.id;
    this.reconcileScan();
    this.observe();
    this.emit();
    return this.getState();
  }

  cancel(): void {
    if (this.closed || this.status === 'restored' || this.status === 'cancelled') return;
    this.closed = true;
    this.stopObserving();
    void this.engine.cancelSession(this.sessionId).catch(() => undefined);

    for (const record of this.registry.values()) {
      if (record.phase === 'pending' || record.phase === 'translating') record.phase = 'cancelled';
      record.requestId = undefined;
    }

    this.status = 'cancelled';
    this.emit();
  }

  /** 恢复原文：取消任务、停止动态处理，保留已经成功的译文缓存（由 Translation Engine 负责）。 */
  restore(): void {
    if (this.status === 'restored') return;
    const wasCancelled = this.closed;
    this.closed = true;
    this.stopObserving();
    if (!wasCancelled) void this.engine.cancelSession(this.sessionId).catch(() => undefined);

    this.runOwnMutation(() => {
      for (const record of this.registry.values()) record.rendered?.restore();
    });

    this.registry.clear();
    this.elementRecords.clear();
    this.status = 'restored';
    this.emit();
  }

  /** 只重新提交失败单元，不重复提交未变化的成功单元。 */
  retryFailed(): void {
    if (this.closed || !this.profileId) return;

    const failed = [...this.registry.values()].filter((record) => record.phase === 'failed');
    if (failed.length === 0) return;

    this.runOwnMutation(() => {
      for (const record of failed) {
        record.rendered?.restore();
        record.rendered = undefined;
        record.error = undefined;
        record.phase = 'pending';
      }
    });

    this.status = 'translating';
    this.dispatch(failed);
    this.emit();
  }

  getState(): PageSessionState {
    const progress = computeProgress([...this.registry.values()].map((record) => record.phase));
    const status = this.status === 'translating' ? deriveActiveStatus(progress) : this.status;
    return {
      status,
      progress,
      ...(this.stateError ? { error: this.stateError } : {}),
    };
  }

  getProgress(): PageSessionProgress {
    return this.getState().progress;
  }

  subscribe(listener: (state: PageSessionState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 页面卸载或装配销毁时调用，不改变已经渲染的内容。 */
  dispose(): void {
    this.closed = true;
    this.stopObserving();
    this.listeners.clear();
  }

  private reconcileScan(): void {
    if (this.closed) return;

    const targets = scanTranslatableTargets(this.doc);
    const seen = new Set<Element>();
    const fresh: UnitRecord[] = [];

    for (const target of targets) {
      seen.add(target.element);
      const existing = this.elementRecords.get(target.element);

      if (existing) {
        // 界面文本被我们替换成译文后，DOM 文本已不是原文；只要译文仍完整，就视为未变化。
        if (existing.kind === 'interface' && existing.phase === 'translated' && this.renderingIntact(existing)) {
          continue;
        }

        const sameText = existing.fingerprint === target.fingerprint;
        if (sameText && existing.phase !== 'translated') continue;
        if (sameText && this.renderingIntact(existing)) continue;
        if (sameText && this.rerender(existing)) continue;

        this.invalidate(existing);
      }

      const record = this.createRecord(target);
      if (record) fresh.push(record);
    }

    for (const [element, record] of [...this.elementRecords]) {
      if (seen.has(element)) continue;
      this.invalidate(record);
    }

    this.dispatch(fresh);
  }

  private createRecord(target: TranslatableTarget): UnitRecord | null {
    if (classifyText(target.text) !== 'english') return null;

    const record: UnitRecord = {
      id: createUnitId(),
      kind: target.kind,
      element: target.element,
      originalText: target.text,
      fingerprint: target.fingerprint,
      formats: target.formats,
      phase: 'pending',
    };

    this.registry.set(record.id, record);
    this.elementRecords.set(target.element, record);
    return record;
  }

  private invalidate(record: UnitRecord): void {
    record.rendered?.restore();
    record.rendered = undefined;
    record.requestId = undefined;
    this.registry.delete(record.id);
    if (this.elementRecords.get(record.element) === record) this.elementRecords.delete(record.element);
  }

  private renderingIntact(record: UnitRecord): boolean {
    if (!record.element.isConnected) return false;
    if (!record.rendered) return false;
    if (record.kind === 'body') return record.rendered.nodes.every((node) => node.isConnected);
    return isRendering(record.element, record.rendered.nodes);
  }

  /** 原文未变但译文被站点移除：直接用已有译文重渲染，不重新请求。 */
  private rerender(record: UnitRecord): boolean {
    if (!record.translatedText) return false;
    const rendered = this.renderRecord(record, record.translatedText);
    if (!rendered) return false;
    record.rendered = rendered;
    this.emit();
    return true;
  }

  private dispatch(records: UnitRecord[]): void {
    if (this.closed || !this.profileId || records.length === 0) return;

    const bodyElements = new Set(
      [...this.registry.values()].filter((record) => record.kind === 'body').map((record) => record.element),
    );

    for (const batch of splitIntoBatches(
      records,
      this.source.batchUnitLimit ?? DEFAULT_BATCH_UNIT_LIMIT,
      this.source.batchCharLimit ?? DEFAULT_BATCH_CHAR_LIMIT,
    )) {
      const requestId = createRequestId();
      for (const record of batch) {
        record.phase = 'translating';
        record.requestId = requestId;
      }

      const request: StartTranslationRequest = {
        sessionId: this.sessionId,
        requestId,
        profileId: this.profileId,
        units: batch.map(toTranslationUnit),
        context: this.contextFor(batch, bodyElements),
      };

      void this.consume(request, batch);
    }

    this.emit();
  }

  private contextFor(batch: UnitRecord[], bodyElements: ReadonlySet<Element>): TranslationContext | undefined {
    const bodyUnit = batch.find((record) => record.kind === 'body');
    if (!bodyUnit) return undefined;
    return buildTranslationContext(this.doc, bodyUnit.element, bodyElements);
  }

  private async consume(request: StartTranslationRequest, batch: UnitRecord[]): Promise<void> {
    try {
      for await (const event of this.engine.translate(request)) {
        this.handleEvent(request, event);
      }
    } catch (error) {
      this.failBatch(batch, sanitizeError(error));
    } finally {
      if (!this.closed) {
        this.failBatch(batch, {
          code: 'response-invalid',
          message: '翻译服务未返回该段落的译文。',
          retryable: true,
        });
        this.emit();
      }
    }
  }

  private failBatch(batch: UnitRecord[], error: SanitizedTranslationError): void {
    for (const record of batch) {
      if (this.registry.get(record.id) !== record) continue;
      if (record.phase !== 'translating') continue;
      this.failRecord(record, error);
    }
  }

  private handleEvent(request: StartTranslationRequest, event: TranslationEvent): void {
    if (this.closed) return;
    if (event.sessionId !== request.sessionId || event.requestId !== request.requestId) return;
    if (event.type === 'request-completed') return;

    const record = this.registry.get(event.unitId);
    if (!record) return;
    if (record.requestId !== request.requestId) return;
    if (record.phase !== 'translating') return;

    if (event.type === 'unit-failed') {
      this.failRecord(record, event.error);
      return;
    }

    const translated = typeof event.text === 'string' ? event.text.trim() : '';
    if (!translated) {
      this.failRecord(record, {
        code: 'response-invalid',
        message: '翻译服务返回了空译文。',
        retryable: true,
      });
      return;
    }

    const rendered = this.renderRecord(record, translated);
    if (!rendered) {
      this.failRecord(record, {
        code: 'response-invalid',
        message: '译文无法渲染到当前页面。',
        retryable: true,
      });
      return;
    }

    record.translatedText = translated;
    record.phase = 'translated';
    record.rendered = rendered;
    this.emit();
  }

  private renderRecord(record: UnitRecord, translatedText: string): RenderedTranslation | null {
    return this.runOwnMutation(() => {
      try {
        return record.kind === 'body'
          ? renderBodyTranslation(this.doc, record.element, translatedText, record.formats, record.id)
          : renderInterfaceTranslation(
              this.doc,
              record.element,
              translatedText,
              record.formats,
              record.originalText,
            );
      } catch {
        return null;
      }
    });
  }

  private failRecord(record: UnitRecord, error: SanitizedTranslationError): void {
    record.phase = 'failed';
    record.error = error;
    record.requestId = undefined;

    this.runOwnMutation(() => {
      record.rendered?.restore();
      record.rendered =
        record.kind === 'body' ? (renderFailureMarker(this.doc, record.element, record.id) ?? undefined) : undefined;
    });

    this.emit();
  }

  /**
   * 标记插件自身正在写 DOM。MutationObserver 回调是微任务，会先于这里排队的
   * 微任务执行，因此同步写入产生的 DOM 变化不会触发自我翻译。
   */
  private runOwnMutation<T>(action: () => T): T {
    this.mutating += 1;
    try {
      return action();
    } finally {
      queueMicrotask(() => {
        this.mutating = Math.max(0, this.mutating - 1);
      });
    }
  }

  private observe(): void {
    if (this.source.observeMutations === false) return;
    const target = this.doc.body;
    if (!target) return;

    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  private stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  private onMutations(records: MutationRecord[]): void {
    if (this.closed || this.mutating > 0) return;
    if (!records.some((record) => !isOwnMutation(record))) return;
    this.scheduleReconcile();
  }

  private scheduleReconcile(): void {
    if (this.reconcileTimer !== null) return;
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      this.reconcileScan();
      this.emit();
    }, this.source.mutationDebounceMs ?? DEFAULT_MUTATION_DEBOUNCE_MS);
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of [...this.listeners]) listener(state);
  }
}

function toTranslationUnit(record: UnitRecord): TranslationUnit {
  return { id: record.id, kind: record.kind, text: record.originalText };
}

function splitIntoBatches(records: UnitRecord[], unitLimit: number, charLimit: number): UnitRecord[][] {
  const batches: UnitRecord[][] = [];
  let current: UnitRecord[] = [];
  let characters = 0;

  for (const record of records) {
    const exceedsLimits = current.length >= unitLimit || characters + record.originalText.length > charLimit;
    if (current.length > 0 && exceedsLimits) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(record);
    characters += record.originalText.length;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

/** 忽略插件自身插入译文、替换界面文本产生的 DOM 变化，避免自我触发。 */
function isOwnMutation(record: MutationRecord): boolean {
  const target = record.target;
  const element =
    target.nodeType === Node.ELEMENT_NODE ? (target as Element) : (target.parentElement as Element | null);
  if (element?.closest(`[${OWN_NODE_ATTRIBUTE}]`)) return true;

  if (record.type === 'childList' && record.addedNodes.length > 0) {
    return Array.from(record.addedNodes).every((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).hasAttribute(OWN_NODE_ATTRIBUTE);
      return node.parentElement ? node.parentElement.closest(`[${OWN_NODE_ATTRIBUTE}]`) !== null : false;
    });
  }

  return false;
}
