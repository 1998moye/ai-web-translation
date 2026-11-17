import { describe, expect, it, vi } from 'vitest';
import {
  SelectionTranslationController,
  type SelectionRect,
  type SelectionSource,
} from '@/modules/selection-translation/selection-translation-controller';
import { createFakeProfileCatalog } from '@/modules/translation-fake/fake-profile-catalog';
import { complete, createManualEngine, fail, succeed } from './helpers/manual-engine';

const ENGLISH_TEXT = 'Selecting this English sentence should offer a translation icon.';
const RECT: SelectionRect = { left: 100, top: 200, width: 200, height: 20 };

interface FakeSource {
  source: SelectionSource;
  set(value: { text: string; rect: SelectionRect } | null): void;
}

function createSource(): FakeSource {
  let current: { text: string; rect: SelectionRect } | null = null;
  return {
    source: { read: () => current },
    set(value) {
      current = value;
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

function select(source: FakeSource, text: string, rect: SelectionRect = RECT): void {
  source.set({ text, rect });
}

/** 让引擎事件流里的微任务先跑完。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('选区识别', () => {
  it('选中普通英文文本后显示翻译图标，且不发起翻译请求', () => {
    const { controller, manual, set } = setup();

    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();

    const { iconPosition } = controller.getSnapshot();
    expect(iconPosition).not.toBeNull();
    expect(iconPosition!.left).toBeGreaterThanOrEqual(RECT.left);
    expect(iconPosition!.left).toBeLessThanOrEqual(RECT.left + RECT.width);
    expect(iconPosition!.top).toBeGreaterThanOrEqual(RECT.top + RECT.height);
    expect(manual.requests).toHaveLength(0);
  });

  it('没有选区或选区为空时不显示图标', () => {
    const { controller, set } = setup();

    controller.refresh();
    expect(controller.getSnapshot().iconPosition).toBeNull();

    set({ text: '   ', rect: RECT });
    controller.refresh();
    expect(controller.getSnapshot().iconPosition).toBeNull();
  });

  it('已有中文或纯数字选区不显示图标', () => {
    const { controller, set } = setup();

    set({ text: '这已经是中文内容，不需要翻译。', rect: RECT });
    controller.refresh();
    expect(controller.getSnapshot().iconPosition).toBeNull();

    set({ text: '123 456 7890', rect: RECT });
    controller.refresh();
    expect(controller.getSnapshot().iconPosition).toBeNull();
  });

  it('挂载后鼠标抬起会更新图标', () => {
    const { controller, set } = setup();
    controller.mount();

    set({ text: ENGLISH_TEXT, rect: RECT });
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(controller.getSnapshot().iconPosition).not.toBeNull();
    controller.destroy();
  });
});

describe('译文气泡', () => {
  it('点击图标后先显示加载状态，成功后展示默认配置的译文', async () => {
    const { controller, manual, set, profiles } = setup();
    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();

    const pending = controller.translateSelection();

    const loading = controller.getSnapshot().bubble;
    expect(loading?.status).toBe('loading');
    await flush();
    expect(manual.requests).toHaveLength(1);
    expect(manual.requests[0]?.units.map((unit) => unit.text)).toEqual([ENGLISH_TEXT]);
    expect(manual.requests[0]?.profileId).toBe((await profiles.getDefaultProfile())?.id);

    succeed(manual, 0, 0, '选中这段英文句子时应该出现翻译图标。');
    complete(manual, 0);
    await pending;

    expect(controller.getSnapshot().bubble).toMatchObject({
      status: 'success',
      translation: '选中这段英文句子时应该出现翻译图标。',
    });
  });

  it('请求失败时气泡显示脱敏错误，且不修改页面文本', async () => {
    const { controller, manual, set } = setup();
    document.body.innerHTML = `<p>${ENGLISH_TEXT}</p>`;
    const before = document.body.innerHTML;

    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();
    fail(manual, 0, 0);
    complete(manual, 0);
    await pending;

    const bubble = controller.getSnapshot().bubble;
    expect(bubble?.status).toBe('error');
    expect(bubble && 'message' in bubble ? bubble.message : '').toContain('模拟失败');
    expect(document.body.innerHTML).toBe(before);
  });

  it('没有可用配置时提示选择配置，且不发起请求', async () => {
    const { controller, manual, set, profiles } = setup();
    profiles.setDefaultProfile(null);
    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();

    await controller.translateSelection();

    const bubble = controller.getSnapshot().bubble;
    expect(bubble?.status).toBe('error');
    expect(bubble && 'message' in bubble ? bubble.message : '').toContain('翻译服务配置');
    expect(manual.requests).toHaveLength(0);
  });

  it('新选区使旧气泡失效，旧响应不会覆盖新气泡', async () => {
    const { controller, manual, set } = setup();
    set({ text: ENGLISH_TEXT, rect: RECT });
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
    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();
    const pending = controller.translateSelection();
    await flush();
    const sessionId = manual.requests[0]?.sessionId;

    controller.closeBubble();

    expect(controller.getSnapshot().bubble).toBeNull();
    expect(manual.cancelled).toContain(sessionId);

    succeed(manual, 0, 0, '关闭后的译文不该出现。');
    complete(manual, 0);
    await pending;
    expect(controller.getSnapshot().bubble).toBeNull();
  });

  it('加载中重复点击图标不会产生第二个气泡或重复请求', async () => {
    const { controller, manual, set } = setup();
    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();

    const first = controller.translateSelection();
    const second = controller.translateSelection();

    await flush();
    expect(manual.requests).toHaveLength(1);

    succeed(manual, 0, 0, '只有一条译文。');
    complete(manual, 0);
    await Promise.all([first, second]);

    expect(controller.getSnapshot().bubble).toMatchObject({ status: 'success', translation: '只有一条译文。' });
  });

  it('订阅者在气泡状态变化时收到通知', async () => {
    const { controller, set } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);

    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();
    expect(listener).toHaveBeenCalled();
  });
});

describe('选区快照', () => {
  it('记录点击图标时使用的原文', async () => {
    const { controller, set } = setup();
    set({ text: ENGLISH_TEXT, rect: RECT });
    controller.refresh();

    void controller.translateSelection();

    expect(controller.getSnapshot().bubble).toMatchObject({ sourceText: ENGLISH_TEXT });
  });
});
