import { StyleCache } from '../dom/style-cache';

/**
 * 图表与可视化区域：这些文本通常参与画布/坐标计算，插译文或替换文字都会错位。
 * recharts / highcharts / echarts 等库的标签是 HTML，不在 svg 里，必须单独排除。
 */
const CHART_REGION_SELECTOR = [
  '[class*="recharts"]',
  '[class*="highcharts"]',
  '[class*="echarts"]',
  '[class*="plotly"]',
  '[class*="vega"]',
  '[class*="chart-container"]',
  '[class*="chart-wrapper"]',
  '[class*="chart-root"]',
  '[class*="chartjs"]',
  '[class*="sparkline"]',
  '[class*="data-visualization"]',
  '[data-recharts]',
  '[data-chart]',
  '[data-testid*="chart"]',
  '[data-testid*="graph"]',
  '[role="img"]',
].join(', ');

const FLEX_OR_GRID = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);
const TABLE_LAYOUT = new Set(['table', 'inline-table', 'table-row', 'table-row-group', 'table-header-group']);

export function isChartRegion(element: Element): boolean {
  return element.closest(CHART_REGION_SELECTOR) !== null;
}

function isPositioned(style: CSSStyleDeclaration): boolean {
  const position = style.getPropertyValue('position');
  return position === 'absolute' || position === 'fixed';
}

function hidesOverflow(style: CSSStyleDeclaration): boolean {
  const overflow = [
    style.getPropertyValue('overflow'),
    style.getPropertyValue('overflow-x'),
    style.getPropertyValue('overflow-y'),
  ].join(' ');
  return /(hidden|clip)/.test(overflow);
}

/**
 * 元素是否真的把内容裁掉了。
 *
 * 只看计算样式的高度判断不出来：块级元素算出来的 height 一律是像素值，
 * 「overflow: hidden + 有高度」于是会把圆角卡片的边框盒、表格容器这类正常布局
 * 全部判成裁剪（GitHub 仓库页的文件列表与侧栏就是这么被整块跳过的）。
 * 真正会裁掉内容的是滚动尺寸大于可视尺寸的容器。
 */
function clipsContent(element: Element): boolean {
  const doc = element.ownerDocument;
  if (!doc || element === doc.documentElement || element === doc.body) return false;

  const scrollHeight = (element as HTMLElement).scrollHeight;
  const scrollWidth = (element as HTMLElement).scrollWidth;
  if (typeof scrollHeight !== 'number' || typeof scrollWidth !== 'number') return false;
  return scrollHeight > element.clientHeight + 1 || scrollWidth > element.clientWidth + 1;
}

function isTightlyClipped(element: Element, style: CSSStyleDeclaration): boolean {
  if (!hidesOverflow(style)) return false;
  return clipsContent(element);
}

function isLayoutContainer(style: CSSStyleDeclaration): boolean {
  const display = style.getPropertyValue('display');
  if (FLEX_OR_GRID.has(display)) return true;
  // 表格结构容器本身不能塞入译文块；td/th 由 placeBlock 放进单元格内部。
  if (TABLE_LAYOUT.has(display)) return true;
  return false;
}

/**
 * 正文译文只能插在普通文档流里。
 * flex/grid 行、图表标签、绝对定位的浮层一旦多出块级子节点，就会挤压或覆盖原布局，
 * 因此宁可跳过这一处，也不让整页排版错位。
 */
export function isBodyTargetLayoutSafe(element: Element, cache: StyleCache): boolean {
  if (isChartRegion(element)) return false;

  const style = cache.get(element);
  if (!style) return true;
  if (isPositioned(style)) return false;
  if (isLayoutContainer(style)) return false;
  if (isTightlyClipped(element, style) && !element.matches('td, th, caption')) return false;

  // 只检查最近的布局祖先：再往上通常是页面主框架，跳过会让整页正文都翻不了。
  let ancestor = element.parentElement;
  for (let depth = 0; ancestor && depth < 3; depth += 1, ancestor = ancestor.parentElement) {
    const ancestorStyle = cache.get(ancestor);
    if (!ancestorStyle) continue;
    if (isTightlyClipped(ancestor, ancestorStyle)) return false;
    if (isPositioned(ancestorStyle) && ancestorStyle.getPropertyValue('height') !== 'auto') return false;
  }

  return true;
}
