# 10: 显示可拖动的悬浮翻译按钮

**What to build:** 在浏览器允许注入的普通网站默认显示右侧中下部的悬浮翻译按钮。按钮支持拖动、全局位置记忆和悬停展开设置入口，为后续整页翻译与恢复原文提供统一入口。

**Blocked by:** 01: 建立扩展骨架与共享契约

**Status:** ready-for-human

- [x] 可注入的 HTTP/HTTPS 网站默认显示悬浮翻译按钮，无需扩展内逐站授权。
- [x] 按钮默认位于右侧中下部，使用 Shadow DOM 隔离样式，不依赖网站自身样式。
- [x] 用户可以拖动按钮，拖动与点击具有明确区分，不会在拖动结束时误触翻译。
- [x] 拖动后的位置在所有网站共享，并在重新加载和其他网站打开后保持。
- [x] 按钮位置在常见窗口尺寸下保持可见，窗口缩放后不会永久移出可视区域。
- [x] 悬停按钮会展开设置入口，点击设置可以打开扩展的相应设置页。
- [x] 按钮提供后续翻译与恢复原文所需的清晰状态入口，本 ticket 不伪造真实 AI 翻译结果。
- [x] 展示按钮本身不会发送网页文本或翻译请求。
- [x] 在真实浏览器中验证显示、拖动、点击区分、位置持久化、设置入口和 Shadow DOM 隔离。

## Comments

### 2026-11-17 实现完成

- 实现：`src/modules/floating-button/`（Shadow DOM 组件、拖动阈值、位置存储、resize 夹取、悬停面板）、`src/modules/content-shell/`、`src/entrypoints/content/index.tsx`、`src/modules/assembly/content-assembly.ts`。
- 默认位置右侧中下部；拖动结束才写入 `aiwt.floatingButtonPosition`，所有网站共享；窗口缩放重新夹取；拖动与点击用 4px 阈值区分。
- 悬停展开设置、关闭一次、永久关闭、自动翻译、重试/停止/重新翻译等入口；展示按钮本身不发起翻译。
- 验收：`tests/unit/button-position.test.ts`（7 用例）；`tests/e2e/floating-button.spec.ts` 覆盖默认显示、Shadow DOM 样式隔离、拖动后刷新与跨站保持、resize 可见、悬停展开、设置页打开、关闭一次、永久关闭。
- 备注：设置入口通过后台消息打开设置页（内容脚本不能直接调用 `runtime.openOptionsPage`）；系统 Chrome 137+ 禁止 `--load-extension`，手动加载步骤见 `ai-web-translation/README.md`。

### 2026-11-17 复核补丁

- 修复按钮拖到视口左侧时展开面板溢出屏幕的问题：面板按按钮位置自动翻到右侧（`panelSideFor`），补充单元与端到端用例。
- 补充"拖动结束后点击仍能正常触发翻译"的端到端断言。
