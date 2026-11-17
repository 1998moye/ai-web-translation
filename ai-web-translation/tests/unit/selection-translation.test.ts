import { describe, expect, it, vi } from 'vitest';
import {
  SelectionTranslationController,
  type SelectionReading,
  type SelectionRect,
  type SelectionSource,
} from '@/modules/selection-translation/selection-translation-controller';
import { createFakeProfileCatalog } from '@/modules/translation-fake/fake-profile-catalog';
import type { TranslationContext } from '@/modules/translation-contract/types';
import { complete, createManualEngine, fail, succeed } from './helpers/manual-engine';

const ENGLISH_TEXT = 'Selecting this English sentence should offer a translation icon.';
const RECT: SelectionRect = { left: 100, top: 200, width: 200, height: 20 };
const API_KEY_LEAK = 'sk-live-secret-abcd1234';

interface FakeSource {
  source: SelectionSource;
  set(
    value: {
      text: string;
      rect?: SelectionRect;
      rawText?: string;
      codeExcluded?: boolean;
      context?: TranslationContext;
    } | null,
  ): void;
}

function createSource(): FakeSource {
  let current: SelectionReading | null = null;
  return {
    source: { read: () => current },
    set(value) {
      current = value
        ? {
            text: value.text,
            rawText: value.rawText ?? value.text,
            rect: value.rect ?? RECT,
            codeExcluded: value.codeExcluded ?? false,
            ...(value.context ? { context: value.context } : {}),
          }
        : null;
    },
  };
}

function setup() {
  const { source, set } = createSource();
  const manual = createManualEngine();
  const profiles = createFakeProfileCatalog();
  const controller = new SelectionTranslationController({
    engine: manual.engine,
    profiles,
    source,
    doc: document,
    win: window,
  });

  return { controller, manual, source, profiles, set };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function bubbleOf(controller: SelectionTranslationController) {
  const bubble = controller.getSnapshot().bubble;
  if (!bubble) throw new Error('气泡没有打开');
  return bubble;
}

describe('选区识别', () => {
  it('选中普通英文文本后显示翻译图标，且不发起翻译请求', () => {
    const { controller, manual, set } = setup();

    set({ text: ENGLISH_TEXT });
    controller.refresh();

    const snapshot = controller.getSnapshot();
    expect(snapshot.iconPosition).not.toBeNull();
    expect(snapshot.iconIssue).toBeNull();
    expect(snapshot.iconPosition!.left).toBeGreaterThanOrEqual(RECT.left);
    expect(snapshot.iconPosition!.left).toBeLessThanOrEqual(RECT.left + RECT.width);
    expect(snapshot.iconPosition!.top).toBeGreaterThanOrEqual(RECT.top + RECT.height);
    expect(manual.requests).toHaveLength(0);
  });

  it('没有选区或选区为空时不显示图标', () => {
    const { controller, set } = setup();

    controller.refresh();
    expect(controller.getSnapshot().iconPosition).toBeNull();

    set({ text: '   ' });
    controller.refresh();
    expect(controller.getSnapshot().iconPosition).toBeNull();
  });

  it('已有中文的选区显示不可翻译提示，且不发起请求', () => {
    const { controller, manual, set } = setup();

    set({ text: '这已经是中文内容，不需要翻译。' });
    controller.refresh();

    expect(controller.getSnapshot().iconIssue).toContain('中文');
    expect(manual.requests).toHaveLength(0);
  });

  it('纯数字与纯符号选区显示提示，且不发起请求', () => {
    const { controller, manual, set } = setup();

    set({ text: '123 456 7890' });
    controller.refresh();
    expect(controller.getSnapshot().iconIssue).toContain('数字');

    set({ text: '### 42%% ···' });
    controller.refresh();
    expect(controller.getSnapshot().iconIssue).not.toBeNull();
    expect(manual.requests).toHaveLength(0);
  });

  it('代码内容选区不发起请求，并说明原因', () => {
    const { controller, manual, set } = setup();

    set({ text: '', rawText: 'npm install --save-dev wxt', codeExcluded: true });
    controller.refresh();

    expect(controller.getSnapshot().iconIssue).toContain('代码');
    expect(manual.requests).toHaveLength(0);
  });

  it('挂载后鼠标抬起会更新图标', () => {
    const { controller, set } = setup();
    controller.mount();

    set({ text: ENGLISH_TEXT });
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(controller.getSnapshot().iconPosition).not.toBeNull();
    controller.destroy();
  });
});

describe('译文气泡', () => {
  it('点击图标后先显示加载状态，成功后展示默认配置的译文', async () => {
    const { controller, manual, set, profiles } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();

    const pending = controller.translateSelection();
    expect(controller.getSnapshot().bubble?.status).toBe('loading');

    await flush();
    expect(manual.requests).toHaveLength(1);
    expect(manual.requests[0]?.units.map((unit) => unit.text)).toEqual([ENGLISH_TEXT]);
    expect(manual.requests[0]?.profileId).toBe((await profiles.getDefaultProfile())?.id);

    succeed(manual, 0, 0, '选中这段英文句子时应该出现翻译图标。');
    complete(manual, 0);
    await pending;

    const bubble = bubbleOf(controller);
    expect(bubble.status).toBe('success');
    expect(bubble.units[0]?.translation).toBe('选中这段英文句子时应该出现翻译图标。');
  });

  it('请求失败时气泡显示脱敏错误，且不修改页面文本', async () => {
    const { controller, manual, set } = setup();
    document.body.innerHTML = `<p>${ENGLISH_TEXT}</p>`;
    const before = document.body.innerHTML;

    set({ text: ENGLISH_TEXT });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();

    fail(manual, 0, 0);
    complete(manual, 0);
    await pending;

    const bubble = bubbleOf(controller);
    expect(bubble.status).toBe('error');
    expect(bubble.units[0]?.error).toContain('模拟失败');
    expect(document.body.innerHTML).toBe(before);
  });

  it('没有可用配置时提示配置不可用，且不发起请求', async () => {
    const { controller, manual, set, profiles } = setup();
    profiles.setProfiles([]);
    set({ text: ENGLISH_TEXT });
    controller.refresh();

    await controller.translateSelection();

    const bubble = bubbleOf(controller);
    expect(bubble.status).toBe('error');
    expect(bubble.message).toContain('翻译服务配置');
    expect(manual.requests).toHaveLength(0);
  });

  it('新选区使旧气泡失效，旧响应不会覆盖新气泡', async () => {
    const { controller, manual, set } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();

    set({ text: 'Another English sentence appears here.', rect: { left: 20, top: 40, width: 120, height: 18 } });
    controller.refresh();

    expect(controller.getSnapshot().bubble).toBeNull();

    succeed(manual, 0, 0, '旧译文本不该出现。');
    complete(manual, 0);
    await pending;

    expect(controller.getSnapshot().bubble).toBeNull();
  });

  it('关闭气泡后不再显示，并取消当前会话', async () => {
    const { controller, manual, set } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();
    const sessionId = manual.requests[0]?.sessionId;

    controller.closeBubble();

    expect(controller.getSnapshot().bubble).toBeNull();
    expect(manual.cancelled).toContain(sessionId);
    expect(manual.requests).toHaveLength(1);

    succeed(manual, 0, 0, '关闭后的译文不该出现。');
    complete(manual, 0);
    await pending;
    expect(controller.getSnapshot().bubble).toBeNull();
  });

  it('加载中重复点击图标不会产生第二个气泡或重复请求', async () => {
    const { controller, manual, set } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();

    const first = controller.translateSelection();
    const second = controller.translateSelection();
    await flush();
    expect(manual.requests).toHaveLength(1);

    succeed(manual, 0, 0, '只有一条译文。');
    complete(manual, 0);
    await Promise.all([first, second]);

    expect(bubbleOf(controller).units[0]?.translation).toBe('只有一条译文。');
  });

  it('订阅者在气泡状态变化时收到通知', () => {
    const { controller, set } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);

    set({ text: ENGLISH_TEXT });
    controller.refresh();

    expect(listener).toHaveBeenCalled();
  });
});

describe('划词切换配置', () => {
  it('气泡列出配置摘要并标识当前配置', async () => {
    const { controller, set } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();

    void controller.translateSelection();
    await flush();

    const bubble = bubbleOf(controller);
    expect(bubble.profiles.map((profile) => profile.name)).toEqual(['模拟翻译服务（默认）', '模拟翻译服务（备选）']);
    expect(bubble.profiles.find((profile) => profile.id === bubble.profileId)?.isDefault).toBe(true);
  });

  it('切换配置会用同一选区重新翻译，旧结果不会混入', async () => {
    const { controller, manual, set } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();

    const first = controller.translateSelection();
    await flush();
    const alternate = bubbleOf(controller).profiles.find((profile) => !profile.isDefault);

    const switching = controller.selectProfile(alternate!.id);
    await flush();

    expect(manual.requests).toHaveLength(2);
    expect(manual.requests[1]?.profileId).toBe(alternate!.id);
    expect(manual.requests[1]?.units.map((unit) => unit.text)).toEqual([ENGLISH_TEXT]);

    succeed(manual, 0, 0, '旧配置的译文不该出现。');
    complete(manual, 0);
    succeed(manual, 1, 0, '备选配置的译文。');
    complete(manual, 1);
    await first;
    await switching;
    await flush();

    const bubble = bubbleOf(controller);
    expect(bubble.profileId).toBe(alternate!.id);
    expect(bubble.units[0]?.translation).toBe('备选配置的译文。');
  });

  it('配置已不可用时提示选择其他配置，且不发起请求', async () => {
    const { controller, manual, set, profiles } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();

    profiles.setProfiles([]);
    const switching = controller.selectProfile('fake-alternate');
    await switching;

    const bubble = bubbleOf(controller);
    expect(bubble.status).toBe('error');
    expect(bubble.message).toContain('不可用');
    expect(manual.requests).toHaveLength(1);

    complete(manual, 0);
    await pending;
  });

  it('页面侧只拿到配置 ID 与名称，不含密钥与请求地址', async () => {
    const { controller, set } = setup();
    set({ text: ENGLISH_TEXT });
    controller.refresh();

    void controller.translateSelection();
    await flush();

    const serialized = JSON.stringify(controller.getSnapshot());
    expect(serialized).not.toContain(API_KEY_LEAK);
    expect(serialized).not.toContain('api.example.com');
    expect(serialized).not.toContain('Authorization');
  });
});

describe('长选区、上下文与乱序返回', () => {
  it('多句选区拆成多个单元，气泡按原文顺序展示', async () => {
    const { controller, manual, set } = setup();
    set({ text: 'First English sentence. Second English sentence. Third English sentence.' });
    controller.refresh();

    const pending = controller.translateSelection();
    await flush();

    expect(manual.requests[0]?.units.map((unit) => unit.text)).toEqual([
      'First English sentence.',
      'Second English sentence.',
      'Third English sentence.',
    ]);

    for (let index = 0; index < 3; index += 1) succeed(manual, 0, index, `译文${index}`);
    complete(manual, 0);
    await pending;

    expect(bubbleOf(controller).units.map((unit) => unit.sourceText)).toEqual([
      'First English sentence.',
      'Second English sentence.',
      'Third English sentence.',
    ]);
  });

  it('批次乱序返回时译文仍按原选区顺序呈现', async () => {
    const { controller, manual, set } = setup();
    set({ text: 'First English sentence. Second English sentence.' });
    controller.refresh();

    const pending = controller.translateSelection();
    await flush();

    // 后一句先返回，前一句后返回。
    succeed(manual, 0, 1, '第二句译文');
    succeed(manual, 0, 0, '第一句译文');
    complete(manual, 0);
    await pending;

    const bubble = bubbleOf(controller);
    expect(bubble.status).toBe('success');
    expect(bubble.units.map((unit) => unit.translation)).toEqual(['第一句译文', '第二句译文']);
  });

  it('长选区附带只读上下文，短选区不附加上下文', async () => {
    const { controller, manual, set } = setup();
    const context: TranslationContext = {
      pageTitle: 'Example Domain',
      sectionTitle: 'Overview',
      previousText: 'The paragraph before the selection.',
    };

    set({ text: 'Short English text.', context });
    controller.refresh();
    const shortRun = controller.translateSelection();
    await flush();
    expect(manual.requests[0]?.context).toBeUndefined();
    complete(manual, 0);
    await shortRun;

    controller.closeBubble();
    set({
      text: `${'A long English sentence that keeps going and going. '.repeat(4)}Short English text.`,
      context,
    });
    controller.refresh();
    const longRun = controller.translateSelection();
    await flush();
    expect(manual.requests[1]?.context).toEqual(context);
    complete(manual, 1);
    await longRun;
  });

  it('缺失译文的单元保留原文并标记失败，其他单元不回滚', async () => {
    const { controller, manual, set } = setup();
    set({ text: 'First English sentence. Second English sentence. Third English sentence.' });
    controller.refresh();

    const pending = controller.translateSelection();
    await flush();

    succeed(manual, 0, 0, '第一句');
    fail(manual, 0, 2);
    complete(manual, 0);
    await pending;

    const bubble = bubbleOf(controller);
    expect(bubble.status).toBe('partial');
    expect(bubble.units[0]?.translation).toBe('第一句');
    expect(bubble.units[1]?.error).toContain('没有返回');
    expect(bubble.units[1]?.sourceText).toBe('Second English sentence.');
    expect(bubble.units[2]?.error).toContain('模拟失败');
  });
});

describe('中英混排选区', () => {
  it('只提交英文片段，不修改已有中文', async () => {
    const { controller, manual, set } = setup();
    document.body.innerHTML = '<p>Read the documentation 阅读文档 and run npm install</p>';
    const before = document.body.innerHTML;

    set({ text: 'Read the documentation 阅读文档 and run npm install' });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();

    expect(manual.requests).toHaveLength(1);
    expect(manual.requests[0]?.units.map((unit) => unit.text)).toEqual([
      'Read the documentation',
      'and run npm install',
    ]);

    succeed(manual, 0, 0, '阅读文档');
    succeed(manual, 0, 1, '并运行 npm install');
    complete(manual, 0);
    await pending;

    const bubble = bubbleOf(controller);
    expect(bubble.units.map((unit) => unit.translation)).toEqual(['阅读文档', '并运行 npm install']);
    expect(bubble.sourceText).toContain('阅读文档');
    expect(document.body.innerHTML).toBe(before);
  });

  it('片段全部失败时整体状态为失败，成功片段仍然可见', async () => {
    const { controller, manual, set } = setup();
    set({ text: 'First English sentence. Second English sentence.' });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();

    succeed(manual, 0, 0, '第一句');
    fail(manual, 0, 1);
    complete(manual, 0);
    await pending;

    const bubble = bubbleOf(controller);
    expect(bubble.status).toBe('partial');
    expect(bubble.units[0]?.translation).toBe('第一句');
    expect(bubble.units[1]?.error).toContain('模拟失败');
  });
});
