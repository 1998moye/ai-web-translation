# 12: 完成正文整页双语翻译与恢复原文

**What to build:** 用户点击悬浮翻译按钮后，Page Translation Session 通过 Translation Engine Interface 翻译英文正文，并在每个原文段落下插入对应简体中文译文。用户可以无需刷新恢复原文。此 ticket 使用 fake Translation Engine 完成独立端到端验证。

**Blocked by:** 10: 显示可拖动的悬浮翻译按钮

**Status:** ready-for-human

- [x] 点击悬浮翻译按钮会创建页面翻译会话，并通过 Translation Engine Interface 提交英文正文翻译单元。
- [x] 正文翻译单元具有稳定 ID，返回译文只渲染到对应原文段落，不依赖网络返回顺序。
- [x] 每个已翻译正文段落保留英文，并在段落下显示对应的简体中文译文。
- [x] 原文段落、链接和网页事件保持可用，译文不会替换原始正文。
- [x] 点击恢复原文会移除本插件插入的正文译文并恢复原页面，不需要刷新。
- [x] 重复点击不会创建相互冲突的会话或在同一段落下插入多份相同译文。
- [x] fake Translation Engine 可以模拟分批成功、乱序和失败，测试只通过 Page Translation Session 的公开行为验收。
- [x] fake Adapter 仅用于独立开发和测试，不被描述为真实 AI 翻译，也不进入最终生产装配。
- [x] 固定文章样本可以完成“点击、逐批显示、对应正确、恢复完整”的浏览器演示。

## Comments

### 2026-11-17 实现完成

- 实现：`src/modules/page-translation/page-translation-session.ts`、`translation-renderer.ts`、`translation-context.ts`、`page-session-state.ts`；正文译文本插在原文段落之后，原文与网页事件保持可用。
- 稳定单元 ID、批次 ID、会话 ID 贯穿请求与事件；渲染按单元 ID 对应，不依赖网络返回顺序。
- 恢复原文移除插件插入节点，无需刷新；重复点击不会创建冲突会话或插入重复译文。
- 验收：`tests/unit/page-translation-session.test.ts`（插入位置、乱序对应、恢复、配置缺失、上下文、失败与取消）；`tests/e2e/page-translation.spec.ts`（点击→5 段译文→恢复→再次翻译无重复）。
- fake Translation Engine 仅用于单元测试与 `npm run build:dev-fake`；生产构建为占位 Engine，提示"没有可用的翻译服务配置"，不伪造译文。
