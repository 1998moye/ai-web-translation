import { describe, expect, it } from 'vitest';
import {
  buildInlinePayload,
  createInlineNodes,
  expandOpaqueMarkers,
  formatPlainText,
} from '@/modules/inline-format/inline-format';
import { setPage } from './helpers/dom';

function rootOf(html: string): HTMLElement {
  setPage(html);
  const root = document.body.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('样本缺少根元素');
  return root;
}

function containerOf(nodes: readonly Node[]): HTMLElement {
  const container = document.createElement('div');
  container.append(...nodes);
  return container;
}

describe('buildInlinePayload', () => {
  it('把行内代码换成占位标记，代码内容不进入请求', () => {
    const payload = buildInlinePayload(rootOf('<p>Run <code>npm install</code> to set up the project.</p>'));
    expect(payload?.text).toBe('Run ⟦o1⟧ to set up the project.');
    expect(payload?.text).not.toContain('npm install');
    expect(payload?.formats).toEqual([
      expect.objectContaining({ kind: 'opaque', tag: 'code', text: 'npm install' }),
    ]);
  });

  it('保留链接与强调的格式定义', () => {
    const payload = buildInlinePayload(
      rootOf('<p>Read <a href="/docs">the documentation</a> and <strong>follow</strong> it.</p>'),
    );
    expect(payload?.text).toBe('Read ⟦w1⟧the documentation⟦/w1⟧ and ⟦w2⟧follow⟦/w2⟧ it.');
    expect(payload?.formats[0]).toMatchObject({ kind: 'wrap', tag: 'a', href: '/docs' });
    expect(payload?.formats[1]).toMatchObject({ kind: 'wrap', tag: 'strong' });
  });

  it('跳过脚本、样式、隐藏内容和用户输入', () => {
    const payload = buildInlinePayload(
      rootOf(
        '<p>Visible text <script>alert(1)</script><span style="display:none">hidden words</span><input value="ignored"> more text.</p>',
      ),
    );
    expect(payload?.text).toBe('Visible text more text.');
  });

  it('折叠空白并去掉标记内侧空格', () => {
    const payload = buildInlinePayload(rootOf('<p>Start\n  <a href="/x">  linked words </a>\n end.</p>'));
    expect(payload?.text).toBe('Start ⟦w1⟧linked words⟦/w1⟧ end.');
  });

  it('没有英文的单元不产生原文', () => {
    expect(buildInlinePayload(rootOf('<p>1234 !!!</p>'))).toBeNull();
    expect(buildInlinePayload(rootOf('<p> </p>'))).toBeNull();
  });

  it('仅屏幕阅读器可见的文本不进入原文', () => {
    // 徽章里藏着的 reputation score：用户看不见，却会把纯数字徽章变成翻译单元。
    const payload = buildInlinePayload(
      rootOf(
        '<span class="badge"><span style="position: absolute; width: 1px; height: 1px; overflow: hidden">reputation score</span>21</span>',
      ),
    );

    expect(payload).toBeNull();
  });

  it('代码块本身作为翻译单元时被拒绝', () => {
    expect(buildInlinePayload(rootOf('<pre>const x = 1</pre>'))).toBeNull();
  });

  it('去标记后的纯文本可用于悬停查看原文', () => {
    expect(formatPlainText('Read ⟦w1⟧the docs⟦/w1⟧ and ⟦o1⟧ now.')).toBe('Read the docs and now.');
  });

  it('悬停原文里的数字按占位标记还原成原文', () => {
    const formats = [{ marker: '⟦o1⟧', kind: 'opaque' as const, tag: 'number' as const, text: '2026-11-14' }];
    expect(formatPlainText('Released ⟦o1⟧ for good.', formats)).toBe('Released 2026-11-14 for good.');
  });

  it('还原占位标记得到可用于比对内容变化的文本', () => {
    const payload = buildInlinePayload(rootOf('<p>Version 5.2 shipped on 2026-11-14.</p>'));
    expect(expandOpaqueMarkers(payload?.text ?? '', payload?.formats ?? [])).toBe(
      'Version 5.2 shipped on 2026-11-14.',
    );
  });

  it('数字变化会改变指纹，live 计数更新后能重新翻译', () => {
    const before = buildInlinePayload(rootOf('<p>Votes: 1826 today.</p>'));
    const after = buildInlinePayload(rootOf('<p>Votes: 1827 today.</p>'));
    expect(before?.text).toBe(after?.text);
    expect(expandOpaqueMarkers(before?.text ?? '', before?.formats ?? [])).not.toBe(
      expandOpaqueMarkers(after?.text ?? '', after?.formats ?? []),
    );
  });

  it('数字、版本号与日期变成不可翻译的原子内容', () => {
    const payload = buildInlinePayload(rootOf('<p>Claude 5.2 released 2026-11-14 with 1,007,405 votes.</p>'));

    expect(payload?.text).toBe('Claude ⟦o1⟧ released ⟦o2⟧ with ⟦o3⟧ votes.');
    expect(payload?.formats.map((format) => (format.kind === 'opaque' ? format.text : ''))).toEqual([
      '5.2',
      '2026-11-14',
      '1,007,405',
    ]);
  });
});

describe('createInlineNodes', () => {
  it('按标记还原链接、强调和行内代码', () => {
    const payload = buildInlinePayload(
      rootOf('<p>Run <code>npm i</code> and read <a href="/d">docs</a>.</p>'),
    );
    const nodes = createInlineNodes(document, '运行 ⟦o1⟧ 并阅读 ⟦w1⟧文档⟦/w1⟧。', payload?.formats ?? []);
    const container = containerOf(nodes);

    expect(container.querySelector('code')?.textContent).toBe('npm i');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/d');
    expect(container.textContent).toContain('文档');
  });

  it('未知标记退回纯文本，不猜测结构', () => {
    const container = containerOf(createInlineNodes(document, '文本 ⟦w9⟧内容⟦/w9⟧', []));
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('文本 内容');
  });

  it('不配对标记退回纯文本', () => {
    const formats = [{ marker: '⟦w1⟧', kind: 'wrap', tag: 'em' } as const];
    const container = containerOf(createInlineNodes(document, '⟦w1⟧未闭合的强调', formats));
    expect(container.querySelector('em')).toBeNull();
    expect(container.textContent).toBe('未闭合的强调');
  });

  it('错序标记退回纯文本', () => {
    const formats = [
      { marker: '⟦w1⟧', kind: 'wrap', tag: 'em' } as const,
      { marker: '⟦w2⟧', kind: 'wrap', tag: 'strong' } as const,
    ];
    const container = containerOf(createInlineNodes(document, '⟦w1⟧a⟦w2⟧b⟦/w1⟧c⟦/w2⟧', formats));
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('模型返回的 HTML 只作为文本，不创建可执行节点', () => {
    const formats = [{ marker: '⟦w1⟧', kind: 'wrap', tag: 'a', href: '/' } as const];
    const container = containerOf(
      createInlineNodes(document, '<script>alert(1)</script> <img src=x onerror=alert(1)> ⟦w1⟧链接⟦/w1⟧', formats),
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/');
  });

  it('空译文不产生节点', () => {
    expect(createInlineNodes(document, '   ', [])).toHaveLength(0);
  });
});
