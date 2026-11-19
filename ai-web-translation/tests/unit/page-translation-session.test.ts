import { afterEach, describe, expect, it } from 'vitest';
import type { TranslationEngine } from '@/modules/translation-contract/translation-engine';
import { PageTranslationSession, type PageTranslationSessionOptions } from '@/modules/page-translation/page-translation-session';
import { scanTranslatableTargets } from '@/modules/content-scan/scan-translatable-targets';
import { FakeTranslationEngine } from '@/modules/translation-fake/fake-translation-engine';
import { createFakeProfileCatalog } from '@/modules/translation-fake/fake-profile-catalog';
import { setPage, waitFor } from './helpers/dom';
import { complete, createManualEngine, emitRaw, fail, succeed } from './helpers/manual-engine';

const activeSessions: PageTranslationSession[] = [];

function createSession(
  engine: TranslationEngine,
  options: Partial<PageTranslationSessionOptions> = {},
): PageTranslationSession {
  const session = new PageTranslationSession({
    engine,
    profiles: createFakeProfileCatalog(),
    mutationDebounceMs: 5,
    observeMutations: false,
    ...options,
  });
  activeSessions.push(session);
  return session;
}

afterEach(() => {
  for (const session of activeSessions.splice(0)) session.dispose();
});

const bodyTranslations = (): string[] =>
  [...document.querySelectorAll('[data-aiwt="body-translation"]')].map((node) => node.textContent ?? '');

describe('PageTranslationSession 正文翻译', () => {
  it('在每段原文后插入对应译文，保留英文原文', async () => {
    setPage('<main><p>The quick brown fox jumps over the lazy dog.</p><p>Another English sentence about the project.</p></main>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    expect(bodyTranslations()).toEqual([
      '【模拟译文】The quick brown fox jumps over the lazy dog.',
      '【模拟译文】Another English sentence about the project.',
    ]);
    expect(document.querySelectorAll('p')[0]?.textContent).toContain('The quick brown fox');
    expect(session.getState().progress).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
  });

  it('乱序返回时译文仍对应各自段落', async () => {
    setPage(
      '<main><p>First paragraph of the page.</p><p>Second paragraph of the page.</p><p>Third paragraph of the page.</p></main>',
    );
    const engine = new FakeTranslationEngine({
      delayForUnit: (unit) => (unit.text.startsWith('Third') ? 0 : unit.text.startsWith('Second') ? 20 : 40),
    });
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    expect(bodyTranslations()).toEqual([
      '【模拟译文】First paragraph of the page.',
      '【模拟译文】Second paragraph of the page.',
      '【模拟译文】Third paragraph of the page.',
    ]);
  });

  it('只提交英文单元，已有中文与纯符号不产生请求', async () => {
    setPage('<p>这是一段中文内容。</p><p>The quick brown fox.</p><p>12345 6789</p>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const submitted = engine.requests.flatMap((request) => request.units.map((unit) => unit.text));
    expect(submitted).toEqual(['The quick brown fox.']);
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(1);
  });

  it('隐藏容器内的英文不会提交，可见内容照常翻译', async () => {
    setPage(
      '<div style="display:none"><p>Hidden English paragraph inside a collapsed panel.</p></div>' +
        '<section hidden><p>Hidden English paragraph inside a hidden section.</p></section>' +
        '<p>The visible English paragraph should be translated.</p>',
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const submitted = engine.requests.flatMap((request) => request.units.map((unit) => unit.text));
    expect(submitted).toEqual(['The visible English paragraph should be translated.']);
    expect(bodyTranslations()).toHaveLength(1);
  });

  it('非英文语言单元不提交', async () => {
    setPage('<p>Le chat est noir et les chiens sont grands.</p><p>The quick brown fox.</p>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const submitted = engine.requests.flatMap((request) => request.units.map((unit) => unit.text));
    expect(submitted).toEqual(['The quick brown fox.']);
  });

  it('行内代码不进入请求，译文里保留代码元素', async () => {
    setPage('<p>Run <code>npm install</code> to set up the project.</p>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const submitted = engine.requests[0]?.units[0]?.text ?? '';
    expect(submitted).not.toContain('npm install');
    expect(submitted).toContain('⟦o1⟧');

    const block = document.querySelector('[data-aiwt="body-translation"]');
    expect(block?.querySelector('code')?.textContent).toBe('npm install');
  });

  it('没有默认配置时不发请求并给出脱敏说明', async () => {
    setPage('<p>The quick brown fox.</p>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { profiles: createFakeProfileCatalog([]) });

    const state = await session.start();

    expect(state.status).toBe('failed');
    expect(state.error?.code).toBe('profile-unavailable');
    expect(state.error?.message).toContain('翻译服务配置');
    expect(engine.requests).toHaveLength(0);
  });

  it('正文请求携带页面标题、小节标题前一段原文，界面文本不强制附带上下文', async () => {
    setPage(
      '<main><h2>Setup</h2><p>The first paragraph of the guide.</p><p>The second paragraph of the guide.</p></main><button>Continue</button>',
      { title: 'Guide' },
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { batchUnitLimit: 1 });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    expect(engine.requests[0]?.context).toEqual({ pageTitle: 'Guide', sectionTitle: 'Setup' });
    expect(engine.requests[2]?.context).toMatchObject({
      pageTitle: 'Guide',
      sectionTitle: 'Setup',
      previousText: 'The first paragraph of the guide.',
    });
    const interfaceRequest = engine.requests.find((request) =>
      request.units.some((unit) => unit.kind === 'interface'),
    );
    expect(interfaceRequest?.context).toBeUndefined();
  });
});

describe('PageTranslationSession 界面文本', () => {
  it('界面文本译文优先，悬停可查看原文，并可恢复', async () => {
    setPage('<nav><a href="/docs">Documentation</a></nav><button>Sign in</button>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const link = document.querySelector('a');
    expect(link?.textContent).toBe('【模拟译文】Documentation');
    expect(link?.getAttribute('title')).toBe('Documentation');
    expect(link?.getAttribute('href')).toBe('/docs');

    session.restore();

    expect(link?.textContent).toBe('Documentation');
    expect(link?.hasAttribute('title')).toBe(false);
    expect(link?.hasAttribute('data-aiwt-translated')).toBe(false);
    expect(document.querySelector('button')?.textContent).toBe('Sign in');
  });

  it('翻译表单标签和带图标的按钮时保留输入框与图标', async () => {
    setPage(
      '<form><label>Search <input id="q" value="typed" /></label>' +
        '<button type="button"><svg aria-hidden="true"></svg> Save changes</button></form>',
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const label = document.querySelector('label');
    const input = document.querySelector<HTMLInputElement>('#q');
    const button = document.querySelector('button');
    expect(label?.textContent).toBe('【模拟译文】Search');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('typed');
    expect(label?.contains(input)).toBe(true);
    expect(button?.textContent).toBe('【模拟译文】Save changes');
    expect(button?.querySelector('svg')).not.toBeNull();

    session.restore();
    expect(label?.textContent).toBe('Search ');
    expect(label?.contains(input)).toBe(true);
    expect(button?.querySelector('svg')).not.toBeNull();
  });

  it('页面发生无关变动时已翻译的界面文本不会来回闪', async () => {
    setPage('<nav><a href="/docs">Documentation</a></nav><button>Sign in</button>');
    const manual = createManualEngine();
    const session = createSession(manual.engine, { observeMutations: true });

    await session.start();
    // 译文里没有拉丁字母：替换之后这两个元素不再是扫描目标。
    const [request] = manual.requests;
    if (!request) throw new Error('缺少翻译请求');
    for (const [index, unit] of request.units.entries()) {
      succeed(manual, 0, index, unit.kind === 'interface' ? '中文界面文本' : '中文正文');
    }
    complete(manual, 0);

    await waitFor(() => session.getState().status === 'completed');
    expect(document.querySelector('a')?.textContent).toBe('中文界面文本');

    // 站点自己插入无关节点，触发一次重扫。
    document.querySelector('nav')?.append(document.createElement('span'));
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(document.querySelector('a')?.textContent).toBe('中文界面文本');
    expect(document.querySelector('button')?.textContent).toBe('中文界面文本');
    expect(manual.requests).toHaveLength(1);
    expect(session.getState().progress).toMatchObject({ total: 2, succeeded: 2 });
  });

  it('界面文本原文变化后重新翻译，不沿用旧译文', async () => {
    setPage('<button>Sign in</button>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { observeMutations: true });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const button = document.querySelector('button');
    if (!button) throw new Error('缺少按钮');
    button.textContent = 'Sign out';

    await waitFor(() => button.textContent === '【模拟译文】Sign out');
    expect(engine.requests).toHaveLength(2);
    expect(document.querySelectorAll('[data-aiwt="body-translation"]')).toHaveLength(0);
  });
});

describe('PageTranslationSession 动态内容与原文变化', () => {
  it('翻译动态新增内容，未变化内容不重复提交', async () => {
    setPage('<main><p>The first paragraph of the page.</p></main>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { observeMutations: true });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const paragraph = document.createElement('p');
    paragraph.textContent = 'A dynamically added paragraph of text.';
    document.querySelector('main')?.append(paragraph);

    await waitFor(() => session.getState().progress.total === 2 && session.getState().status === 'completed');
    expect(bodyTranslations()).toHaveLength(2);

    document.querySelector('main')?.append(document.createElement('span'));
    await new Promise((resolve) => setTimeout(resolve, 40));

    const submitted = engine.requests.flatMap((request) => request.units.map((unit) => unit.text));
    expect(submitted.filter((text) => text === 'The first paragraph of the page.')).toHaveLength(1);
    expect(submitted.filter((text) => text.includes('dynamically added'))).toHaveLength(1);
  });

  it('动态新增界面文本也会被翻译', async () => {
    setPage('<nav><a href="/docs">Documentation</a></nav>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { observeMutations: true });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const button = document.createElement('button');
    button.textContent = 'Download now';
    document.querySelector('nav')?.append(button);

    await waitFor(() => session.getState().progress.total === 2 && session.getState().status === 'completed');
    expect(button.textContent).toBe('【模拟译文】Download now');
  });

  it('原文变化使旧译文失效，迟到的旧结果不会渲染', async () => {
    setPage('<main><p>Old text of the paragraph.</p></main>');
    const engine = new FakeTranslationEngine({
      delayForUnit: (unit) => (unit.text.includes('Old') ? 80 : 0),
    });
    const session = createSession(engine, { observeMutations: true });

    await session.start();
    const paragraph = document.querySelector('p');
    if (!paragraph) throw new Error('缺少段落');
    paragraph.textContent = 'New text of the same paragraph.';

    await waitFor(() => bodyTranslations().some((text) => text.includes('New text')));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(bodyTranslations()).toEqual(['【模拟译文】New text of the same paragraph.']);
  });

  it('译文被站点移除但原文未变时直接重渲染，不重复请求', async () => {
    setPage('<main><p>Stable English paragraph.</p></main>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { observeMutations: true });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    document.querySelector('[data-aiwt="body-translation"]')?.remove();
    document.querySelector('main')?.append(document.createElement('span'));

    await waitFor(() => document.querySelector('[data-aiwt="body-translation"]') !== null);
    expect(engine.requests).toHaveLength(1);
  });

  it('原文节点被移除时清理对应译文', async () => {
    setPage('<main><p>Paragraph that will be removed.</p></main>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { observeMutations: true });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    document.querySelector('p')?.remove();
    await waitFor(() => document.querySelector('[data-aiwt="body-translation"]') === null);
    expect(session.getState().progress.total).toBe(0);
  });
});

describe('PageTranslationSession 译文排版', () => {
  it('界面文本只改写文字，保留包裹文字的 span 与样式类名', async () => {
    setPage(
      '<nav><a href="/issues" class="nav-link"><svg aria-hidden="true"></svg><span class="nav-label">Views</span></a></nav>',
    );
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    succeed(manual, 0, 0, '视图');
    complete(manual, 0);
    await waitFor(() => session.getState().status === 'completed');

    const link = document.querySelector('a');
    // span 一旦被替换掉，class 就没了，侧边栏宽度塌成一条竖排文字。
    expect(link?.querySelector('span.nav-label')?.textContent).toBe('视图');
    expect(link?.querySelector('svg')).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/issues');

    session.restore();
    expect(link?.querySelector('span.nav-label')?.textContent).toBe('Views');
    expect(link?.querySelector('svg')).not.toBeNull();
  });

  it('译文与原文完全相同时不插入重复内容', async () => {
    setPage('<main><p>.agents/skills</p><p>The quick brown fox jumps.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    const [request] = manual.requests;
    if (!request) throw new Error('缺少翻译请求');
    for (const [index, unit] of request.units.entries()) {
      succeed(manual, 0, index, unit.text === '.agents/skills' ? unit.text : '敏捷的棕色狐狸跳了起来。');
    }
    complete(manual, 0);
    await waitFor(() => session.getState().status === 'completed');

    // 只有真正翻译过的那一段有译文块，标识符不再重复出现两份。
    expect(bodyTranslations()).toEqual(['敏捷的棕色狐狸跳了起来。']);
    expect(session.getState().progress.succeeded).toBe(2);
  });

  it('标题译文沿用原文的字重，但字号相对化，不照抄绝对像素', async () => {
    setPage('<main><h2 style="font-size: 32px; font-weight: 700">Release notes</h2></main>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const block = document.querySelector('[data-aiwt="body-translation"]') as HTMLElement;
    const style = block.getAttribute('style') ?? '';
    expect(style).toContain('font-size: clamp(0.82rem, 0.9em, 1.3rem)');
    expect(style).not.toContain('32px');
    expect(style).toContain('font-weight: 700');
  });

  it('多个子节点时，取承载文字最多的元素颜色', async () => {
    setPage(
      '<table><tbody><tr><td><div><span style="color: rgb(110, 119, 129)">feat: configure and record reasoning</span>' +
        '<span>4 days ago</span></div></td></tr></tbody></table>',
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const style = document.querySelector('td [data-aiwt="body-translation"]')?.getAttribute('style') ?? '';
    expect(style).toContain('color: rgb(110, 119, 129)');
  });

  it('flex 容器里的译文放进原文内部，不会被挤成逐字竖排', async () => {
    setPage(
      '<div style="display: flex; gap: 8px"><p>Flex row paragraph text here.</p><span>Another element</span></div>',
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const container = document.querySelector('div');
    // 新块成了 flex 项目就会被挤成一条竖排文字，因此放进元素内部。
    expect([...(container?.children ?? [])].map((child) => child.tagName)).toEqual(['P', 'SPAN']);
    expect(container?.querySelector('[data-aiwt="body-translation"]')).not.toBeNull();
  });

  it('表格译文的颜色与原文一致，只把字号调小', async () => {
    setPage(
      '<table><tbody><tr><td><span style="color: rgb(87, 96, 106)">Update the commit message</span></td></tr></tbody></table>',
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const style = document.querySelector('td [data-aiwt="body-translation"]')?.getAttribute('style') ?? '';
    expect(style).toContain('color: rgb(87, 96, 106)');
    expect(style).toContain('font-size: clamp(0.75rem, 0.82em, 1rem)');
  });

  it('表格里的译文比正文更小，避免撑开行高与列宽', async () => {
    setPage(
      '<main><p>Regular paragraph outside the table.</p>' +
        '<table><tbody><tr><td>Cell text inside the table.</td></tr></tbody></table></main>',
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const paragraphBlock = document.querySelector('p + [data-aiwt="body-translation"]') as HTMLElement;
    const cellBlock = document.querySelector('td [data-aiwt="body-translation"]') as HTMLElement;

    expect(cellBlock.getAttribute('style')).toContain('font-size: clamp(0.75rem, 0.82em, 1rem)');
    expect(paragraphBlock.getAttribute('style')).toContain('font-size: clamp(0.82rem, 0.9em, 1.3rem)');
    // flex 容器里不占满整行，中文会被挤成逐字竖排。
    expect(paragraphBlock.getAttribute('style')).toContain('flex-basis: 100%');
  });

  it('日期与相对时间不进入可翻译文本', () => {
    setPage('<main><p>Opened on Oct 17, 2026 by paulirish, updated 4 days ago.</p></main>');

    const targets = scanTranslatableTargets(document);
    const text = targets[0]?.text ?? '';
    expect(text).not.toMatch(/Oct|days ago/);
    expect(text).toContain('Opened on ⟦o1⟧');
  });
});

describe('PageTranslationSession 表格与数字', () => {
  it('表格单元格的译文写在单元格内部，不改变表格结构', async () => {
    setPage(
      '<table><tbody><tr><td>Rank one cell text goes here.</td><td>Another cell with English text.</td></tr></tbody></table>',
    );
    const engine = new FakeTranslationEngine();
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'completed');

    const row = document.querySelector('tr');
    // 行里只有单元格：译文块插在 tr 里会撑坏整张表的列宽。
    expect([...(row?.children ?? [])].map((child) => child.tagName)).toEqual(['TD', 'TD']);

    const cells = document.querySelectorAll('td');
    expect(cells[0]?.querySelector('[data-aiwt="body-translation"]')?.textContent).toContain('Rank one cell');
    expect(cells[1]?.querySelector('[data-aiwt="body-translation"]')).not.toBeNull();
  });

  it('数字、版本号与日期不进入可翻译文本，译文里的数字保持原样', async () => {
    setPage('<main><p>Released 2026-11-14 with 1,007,405 votes at 5.2 percent.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    const [request] = manual.requests;
    const unit = request?.units[0];
    if (!request || !unit) throw new Error('缺少翻译请求');

    // 数字被占位标记保护起来，模型没有机会改写它们。
    const plain = unit.text.replace(/⟦[^⟧]*⟧/g, '');
    expect(plain).not.toMatch(/\d/);
    expect(unit.text.match(/⟦o\d+⟧/g)?.length ?? 0).toBeGreaterThanOrEqual(3);

    // 模型保留占位标记，只把句子翻译成中文。
    succeed(manual, 0, 0, '于 ⟦o1⟧ 发布，共 ⟦o2⟧ 票，占 ⟦o3⟧%。');
    complete(manual, 0);
    await waitFor(() => session.getState().status === 'completed');

    expect(bodyTranslations()).toEqual(['于 2026-11-14 发布，共 1,007,405 票，占 5.2%。']);
  });
});

describe('PageTranslationSession 就地重试', () => {
  it('失败段落可以在原文位置点重试，只重新提交这一段', async () => {
    setPage('<main><p>Good paragraph text here.</p><p>Broken paragraph text here.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    succeed(manual, 0, 0, '第一段译文。');
    fail(manual, 0, 1);
    complete(manual, 0);
    await waitFor(() => session.getState().status === 'partial-failure');

    const marker = document.querySelector('[data-aiwt="failure"]');
    expect(marker?.textContent).toContain('本段译文获取失败');
    const retry = marker?.querySelector('button');
    expect(retry?.textContent).toBe('重试');

    retry?.click();

    await waitFor(() => manual.requests.length === 2);
    expect(manual.requests[1]?.units).toHaveLength(1);
    expect(manual.requests[1]?.units[0]?.text).toBe('Broken paragraph text here.');
    expect(session.getState().status).toBe('translating');

    succeed(manual, 1, 0, '第二段译文。');
    complete(manual, 1);
    await waitFor(() => session.getState().status === 'completed');

    expect(document.querySelector('[data-aiwt="failure"]')).toBeNull();
    expect(bodyTranslations()).toEqual(['第一段译文。', '第二段译文。']);
  });

  it('点击重试不会冒泡到页面自己的点击处理', async () => {
    setPage('<main><p>Only failing paragraph here.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    fail(manual, 0, 0);
    complete(manual, 0);
    await waitFor(() => session.getState().status === 'partial-failure');

    let bubbled = 0;
    document.body.addEventListener('click', () => {
      bubbled += 1;
    });

    document.querySelector('[data-aiwt="failure"] button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(bubbled).toBe(0);
    expect(manual.requests).toHaveLength(2);
  });
});

describe('PageTranslationSession 失败、取消与恢复', () => {
  it('部分失败保留英文并可只重试失败单元', async () => {
    setPage('<main><p>Good paragraph one.</p><p>Bad paragraph two.</p><p>Good paragraph three.</p></main>');
    let failBad = true;
    const engine = new FakeTranslationEngine({
      translate: (unit) => (unit.text.includes('Bad') && failBad ? null : `【模拟译文】${unit.text}`),
    });
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().status === 'partial-failure');

    expect(bodyTranslations()).toHaveLength(2);
    expect(document.querySelector('[data-aiwt="failure"]')).not.toBeNull();
    expect(document.querySelectorAll('p')[1]?.textContent).toContain('Bad paragraph two.');
    expect(session.getState().progress).toMatchObject({ succeeded: 2, failed: 1 });

    failBad = false;
    const requestCount = engine.requests.length;
    session.retryFailed();

    await waitFor(() => session.getState().status === 'completed');
    expect(engine.requests.length).toBe(requestCount + 1);
    expect(engine.requests.at(-1)?.units).toHaveLength(1);
    expect(engine.requests.at(-1)?.units[0]?.text).toContain('Bad');
    expect(document.querySelector('[data-aiwt="failure"]')).toBeNull();
    expect(bodyTranslations()).toHaveLength(3);
  });

  it('取消后保留已成功译文，迟到的结果不再渲染', async () => {
    setPage('<main><p>Fast paragraph one.</p><p>Slow paragraph two.</p><p>Slow paragraph three.</p></main>');
    const engine = new FakeTranslationEngine({
      delayForUnit: (unit) => (unit.text.startsWith('Fast') ? 0 : 80),
    });
    const session = createSession(engine);

    await session.start();
    await waitFor(() => session.getState().progress.succeeded === 1);

    session.cancel();
    expect(session.getState().status).toBe('cancelled');

    await new Promise((resolve) => setTimeout(resolve, 140));
    expect(bodyTranslations()).toEqual(['【模拟译文】Fast paragraph one.']);
    expect(session.getState().status).toBe('cancelled');
  });

  it('恢复原文会移除全部译文并停止处理新增内容', async () => {
    setPage('<main><p>The original English paragraph.</p></main><button>Continue</button>');
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { observeMutations: true });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');
    expect(document.querySelectorAll('[data-aiwt]')).not.toHaveLength(0);

    session.restore();
    expect(session.getState().status).toBe('restored');
    expect(document.querySelectorAll('[data-aiwt]')).toHaveLength(0);
    expect(document.querySelector('button')?.textContent).toBe('Continue');

    const paragraph = document.createElement('p');
    paragraph.textContent = 'Content added after the session ended.';
    document.body.append(paragraph);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(engine.requests).toHaveLength(1);
    expect(document.querySelectorAll('[data-aiwt]')).toHaveLength(0);
  });
});

describe('PageTranslationSession 单元 ID 校验', () => {
  it('缺失结果的单元不会被猜测性渲染', async () => {
    setPage('<main><p>The only paragraph in this page.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    complete(manual, 0);

    await waitFor(() => session.getState().status === 'partial-failure');
    expect(document.querySelector('[data-aiwt="body-translation"]')).toBeNull();
    expect(document.querySelector('[data-aiwt="failure"]')).not.toBeNull();
  });

  it('重复 ID 只渲染第一次结果', async () => {
    setPage('<main><p>The only paragraph in this page.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    succeed(manual, 0, 0, '第一份译文');
    succeed(manual, 0, 0, '重复的译文');
    complete(manual, 0);

    await waitFor(() => session.getState().status === 'completed');
    expect(bodyTranslations()).toEqual(['第一份译文']);
  });

  it('未知 ID 与会话不匹配的事件被忽略', async () => {
    setPage('<main><p>The only paragraph in this page.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    const request = manual.requests[0];
    if (!request) throw new Error('缺少请求');

    emitRaw(manual, 0, {
      type: 'unit-succeeded',
      sessionId: 'other-session',
      requestId: request.requestId,
      unitId: request.units[0]?.id ?? '',
      text: '不该渲染',
    });
    emitRaw(manual, 0, {
      type: 'unit-succeeded',
      sessionId: request.sessionId,
      requestId: 'other-request',
      unitId: request.units[0]?.id ?? '',
      text: '也不该渲染',
    });
    emitRaw(manual, 0, {
      type: 'unit-succeeded',
      sessionId: request.sessionId,
      requestId: request.requestId,
      unitId: 'unknown-unit',
      text: '未知单元',
    });
    succeed(manual, 0, 0, '正确译文');
    complete(manual, 0);

    await waitFor(() => session.getState().status === 'completed');
    expect(bodyTranslations()).toEqual(['正确译文']);
  });

  it('空译文按失败处理', async () => {
    setPage('<main><p>The only paragraph in this page.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    succeed(manual, 0, 0, '   ');
    complete(manual, 0);

    await waitFor(() => session.getState().status === 'partial-failure');
    expect(document.querySelector('[data-aiwt="body-translation"]')).toBeNull();
    expect(document.querySelector('[data-aiwt="failure"]')).not.toBeNull();
  });

  it('事件流抛错时批次内单元进入失败状态', async () => {
    setPage('<main><p>The only paragraph in this page.</p></main>');
    const manual = createManualEngine();
    const session = createSession(manual.engine);

    await session.start();
    fail(manual, 0, 0);
    complete(manual, 0);

    await waitFor(() => session.getState().status === 'partial-failure');
    expect(document.querySelector('[data-aiwt="failure"]')).not.toBeNull();
  });
});

describe('PageTranslationSession 配置快照', () => {
  it('会话首次请求固定配置，设置变化只影响新会话', async () => {
    setPage('<main><p>The first paragraph of the page.</p></main>');
    const catalog = createFakeProfileCatalog();
    const engine = new FakeTranslationEngine();
    const session = createSession(engine, { profiles: catalog, observeMutations: true });

    await session.start();
    await waitFor(() => session.getState().status === 'completed');
    expect(engine.requests[0]?.profileId).toBe('fake-default');

    catalog.setDefaultProfile('fake-alternate');

    const paragraph = document.createElement('p');
    paragraph.textContent = 'Another paragraph added later.';
    document.querySelector('main')?.append(paragraph);
    await waitFor(() => session.getState().progress.total === 2);

    expect(engine.requests.every((request) => request.profileId === 'fake-default')).toBe(true);
  });
});
