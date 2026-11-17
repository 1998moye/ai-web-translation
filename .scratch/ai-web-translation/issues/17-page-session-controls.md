# 17: 完成页面会话控制

**What to build:** 为整页翻译提供可理解的进度、取消、失败重试和重新翻译。成功内容先显示，失败内容保留原文；重新翻译通过新页面翻译会话应用最新配置。

**Blocked by:** 16: 处理原文变化与页面节点复用

**Status:** ready-for-human

- [x] 页面可以展示待处理、成功和失败数量所构成的翻译进度，动态新增后进度能够正确调整。
- [x] 成功批次先显示，失败翻译单元保留英文并提供明确失败状态，不回滚整页成功内容。
- [x] 取消通过 Translation Engine Interface 取消当前会话，停止排队任务且不会继续插入过期译文。
- [x] 恢复原文会取消任务、停止动态处理并恢复正文和界面文本，译文缓存保持可用。
- [x] 失败重试只重新提交失败或已失效的翻译单元，不重复提交未变化的成功单元。
- [x] 重新翻译创建新页面翻译会话并使用最新配置，不与旧会话的配置快照或事件混合。
- [x] 旧会话的延迟事件不能修改新会话的进度、译文或状态。
- [x] 悬浮翻译按钮能够区分未翻译、翻译中、部分失败、已完成和已取消等公开状态。
- [x] 使用 fake Translation Engine 覆盖进度、部分失败、取消、失败重试、恢复、重新翻译和跨会话乱序事件。

## Comments

### 2026-11-17 实现完成

- 实现：`PageTranslationSession` 公开 `status` 与 `progress`（pending/translating/succeeded/failed/total），动态新增后自动调整；失败单元保留英文并插入失败标记；`retryFailed` 只重新提交失败单元；`cancel` 停止排队任务并忽略后续事件；`restore` 取消任务、停止监听、恢复正文与界面文本；重新翻译由 Controller 结束旧会话并创建新会话，使用最新默认配置。
- 悬浮按钮公开状态：未翻译、翻译中、部分失败、已完成、已取消，含进度文案与停止/重试/重新翻译入口。
- 验收：`tests/unit/page-translation-session.test.ts`（部分失败与重试、取消保留成功译文、恢复、进度、迟到事件）；`tests/unit/page-translation-controller.test.ts`（取消状态、重新翻译使用最新配置、旧会话迟到事件不影响新会话）；`tests/e2e/page-translation.spec.ts`（`aria-label` 与 `data-aiwt-phase` 状态切换）。
