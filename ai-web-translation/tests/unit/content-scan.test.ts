import { describe, expect, it } from 'vitest';
import { scanTranslatableTargets } from '@/modules/content-scan/scan-translatable-targets';
import { setPage } from './helpers/dom';

function scan(html: string, title = 'Test page') {
  setPage(html, { title });
  return scanTranslatableTargets(document);
}

describe('scanTranslatableTargets', () => {
  it('识别正文段落与标题，保持文档顺序', () => {
    const targets = scan('<main><h1>Getting started</h1><p>The quick brown fox.</p></main>');
    expect(targets.filter((target) => target.kind === 'body').map((target) => target.element.tagName)).toEqual([
      'H1',
      'P',
    ]);
  });

  it('导航链接和按钮识别为界面文本，不重复翻译', () => {
    const targets = scan(
      '<nav><ul><li><a href="/docs">Documentation</a></li></ul></nav><button>Sign in</button><p>Body text here.</p>',
    );

    expect(targets.filter((target) => target.kind === 'interface').map((target) => target.text)).toEqual([
      'Documentation',
      'Sign in',
    ]);
    expect(targets.filter((target) => target.kind === 'body').map((target) => target.text)).toEqual([
      'Body text here.',
    ]);
  });

  it('正文段落里的链接不是独立界面文本', () => {
    const targets = scan('<p>Read <a href="/docs">the documentation</a> now.</p>');
    expect(targets).toHaveLength(1);
    expect(targets[0]?.kind).toBe('body');
    expect(targets[0]?.text).toBe('Read ⟦w1⟧the documentation⟦/w1⟧ now.');
  });

  it('只含链接的内容标题作为正文保留英文，并在下方显示译文', () => {
    const targets = scan(
      '<article><h3><a href="/questions/1">Dereferencing a null pointer undefined behavior?</a></h3></article>',
    );
    expect(targets.filter((target) => target.kind === 'body').map((target) => target.element.tagName)).toEqual([
      'H3',
    ]);
    expect(targets.map((target) => target.text)).toEqual([
      '⟦w1⟧Dereferencing a null pointer undefined behavior?⟦/w1⟧',
    ]);
  });

  it('只保留最内层正文单元', () => {
    const targets = scan('<ul><li><p>Nested paragraph text.</p></li></ul>');
    expect(targets.map((target) => target.element.tagName)).toEqual(['P']);
  });

  it('保护代码块、行内代码、隐藏内容、输入内容和可编辑区域', () => {
    const targets = scan(`
      <pre><code>const x = 1;</code></pre>
      <p>Visible <code>inlineCode</code> text.</p>
      <p style="display:none">Hidden paragraph.</p>
      <div contenteditable="true">Editable text.</div>
      <label>Search <input value="typed" /></label>
      <p>Another visible paragraph.</p>
    `);

    const texts = targets.map((target) => target.text);
    expect(texts.some((text) => text.includes('inlineCode'))).toBe(false);
    expect(texts.some((text) => text.includes('Hidden'))).toBe(false);
    expect(texts.some((text) => text.includes('Editable'))).toBe(false);
    expect(texts.some((text) => text.includes('typed'))).toBe(false);
    expect(texts).toContain('Search');
    expect(texts).toContain('Another visible paragraph.');
  });

  it('把只含行内内容的长 div 当作正文', () => {
    const targets = scan('<div>This div holds a long paragraph of text that should be translated.</div>');
    expect(targets.filter((target) => target.kind === 'body')).toHaveLength(1);
  });

  it('紧凑的仓库元数据行不当作正文，避免在行下插入译文块', () => {
    const targets = scan(`
      <article>
        <div class="repo-meta">
          <span>TypeScript</span>
          <a href="/stars">8,480</a>
          <a href="/forks">729</a>
          <span>Built by <a href="/people">people</a></span>
          <span>7,015 stars this week</span>
        </div>
      </article>
    `);

    expect(targets.filter((target) => target.kind === 'body')).toHaveLength(0);
  });

  it('只有单个用户链接的紧凑元数据行也不当作正文', () => {
    const targets = scan(`
      <article>
        <div class="repo-meta">
          <span>TypeScript</span>
          <a href="/people">octocat</a>
          <span>8,480 stars this week</span>
        </div>
      </article>
    `);

    expect(targets.filter((target) => target.kind === 'body')).toHaveLength(0);
  });

  it('直接文本足够长的多链接 div 仍按正文翻译', () => {
    const targets = scan(
      '<div>Read the <a href="/guide">guide</a> and the <a href="/docs">documentation</a> before starting the migration.</div>',
    );
    expect(targets.filter((target) => target.kind === 'body')).toHaveLength(1);
  });

  it('含块级子元素的 div 不作为正文', () => {
    const targets = scan('<div><p>Child paragraph text.</p><p>Second paragraph.</p></div>');
    expect(targets.filter((target) => target.kind === 'body').map((target) => target.element.tagName)).toEqual([
      'P',
      'P',
    ]);
  });

  it('忽略插件自身插入的节点', () => {
    const targets = scan(
      '<p>The original English paragraph.</p><div data-aiwt="body-translation">【模拟译文】</div>',
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]?.text).toBe('The original English paragraph.');
  });

  it('没有字母的内容不建立翻译单元，非英文语言交给会话判断', () => {
    const targets = scan('<p>12345 ——</p><p>Le chat est noir et les chiens sont grands.</p>');
    expect(targets.map((target) => target.text)).toEqual(['Le chat est noir et les chiens sont grands.']);
  });

  it('相同原文产生相同指纹', () => {
    const first = scan('<p>Same text.</p>')[0];
    const second = scan('<p>Same text.</p>')[0];
    expect(second?.fingerprint).toBe(first?.fingerprint);
  });

  it('没有 body 时返回空列表', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    expect(scanTranslatableTargets(document)).toEqual([]);
  });

  it('只有按钮或链接的容器不算正文，交给界面文本原地翻译', () => {
    setPage(
      '<ul><li><summary>Watch 52</summary></li><li><a href="/x">Documentation</a></li>' +
        '<li>Read the <a href="/y">guide</a> before you start.</li></ul>',
    );

    const targets = scanTranslatableTargets(document);
    const body = targets.filter((target) => target.kind === 'body').map((target) => target.text);
    const interfaces = targets.filter((target) => target.kind === 'interface').map((target) => target.text);

    expect(body).toEqual(['Read the ⟦w1⟧guide⟦/w1⟧ before you start.']);
    // 数字被占位标记保护，渲染时还原成原文。
    expect(interfaces).toEqual(['Watch ⟦o1⟧', 'Documentation']);
  });

  it('只含数字与屏幕阅读器文本的徽章不算正文', () => {
    setPage(
      '<div><span class="badge"><span style="position: absolute; width: 1px; height: 1px">reputation score</span>21</span></div>',
    );

    expect(scanTranslatableTargets(document)).toHaveLength(0);
  });

  it('透明度为零的屏幕阅读器标签不会把纯数字徽章变成译文', () => {
    setPage('<div><span>59.3k</span><span style="opacity: 0">reputation</span></div>');

    expect(scanTranslatableTargets(document)).toHaveLength(0);
  });

  it('浏览器 checkVisibility 认为可见时，仍跳过 1px 裁剪的 sr-only 文本', () => {
    setPage(
      '<div><span id="sr" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0)">reputation</span><span>59.3k</span></div>',
    );
    const hidden = document.getElementById('sr');
    if (!hidden) throw new Error('缺少隐藏标签');
    Object.defineProperty(hidden, 'checkVisibility', { value: () => true });

    expect(scanTranslatableTargets(document)).toHaveLength(0);
  });
});
