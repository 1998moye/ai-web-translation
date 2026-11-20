import { describe, expect, it, vi } from 'vitest';
import { StyleCache } from '@/modules/dom/style-cache';
import { setPage } from './helpers/dom';

describe('StyleCache', () => {
  it('同一元素只读取一次 computed style', () => {
    setPage('<p id="text">Cached paragraph.</p>');
    const element = document.getElementById('text');
    if (!element) throw new Error('缺少段落');

    const span = vi.spyOn(window, 'getComputedStyle');
    const cache = new StyleCache(document);
    cache.get(element);
    cache.get(element);
    cache.get(element);

    expect(span).toHaveBeenCalledTimes(1);
    span.mockRestore();
  });

  it('隐藏祖先的结论会缓存到后代，重复检查不再逐层读样式', () => {
    setPage('<div style="display: none"><span id="child">Hidden text</span></div>');
    const child = document.getElementById('child');
    if (!child) throw new Error('缺少子节点');

    const span = vi.spyOn(window, 'getComputedStyle');
    const cache = new StyleCache(document);

    expect(cache.isHidden(child)).toBe(true);
    const callsAfterFirstCheck = span.mock.calls.length;
    expect(cache.isHidden(child)).toBe(true);
    expect(span).toHaveBeenCalledTimes(callsAfterFirstCheck);

    span.mockRestore();
  });

  it('display: contents 的外壳不算隐藏，后代照常可翻译', () => {
    setPage('<div style="display: contents"><span id="child">Visible text</span></div>');
    const child = document.getElementById('child');
    if (!child) throw new Error('缺少子节点');

    const cache = new StyleCache(document);
    expect(cache.isHidden(child)).toBe(false);
  });

  it('content-visibility: hidden 的容器把后代算作隐藏', () => {
    setPage('<div style="content-visibility: hidden"><span id="child">Collapsed text</span></div>');
    const child = document.getElementById('child');
    if (!child) throw new Error('缺少子节点');

    const cache = new StyleCache(document);
    expect(cache.isHidden(child)).toBe(true);
  });
});
