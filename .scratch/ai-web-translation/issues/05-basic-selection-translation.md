# 05: 完成默认配置下的划词翻译

**What to build:** 用户选中普通英文文本后会看到一个小翻译图标，点击图标才在选区附近打开译文气泡，并使用默认翻译服务配置获得真实译文。划选本身不发起请求。

**Blocked by:** 04: 配置翻译提示词并测试真实连接

**Status:** ready-for-agent

- [ ] 选中普通英文文本后显示位置合理的翻译图标，未点击时不会产生翻译请求。
- [ ] 点击图标后在选区附近显示 Shadow DOM 隔离的译文气泡，并提供明确的加载状态。
- [ ] 气泡通过 Translation Engine Interface 使用默认配置翻译当前选区，成功后展示对应简体中文译文。
- [ ] 内容脚本只传配置 ID，不能读取 API Key、敏感请求头或完整翻译服务配置。
- [ ] 请求失败时气泡显示脱敏错误并保留当前选区，不插入无关内容或修改原网页文本。
- [ ] 新选区会使旧选区的待处理结果失效，旧响应不能覆盖新选区气泡。
- [ ] 页面滚动、选择变化和气泡关闭具有可预测行为，不会造成多个无法关闭的气泡。
- [ ] 使用 mock Translation Engine 验证图标、加载、成功、失败和选区切换，并使用真实兼容服务手动验证普通英文选区。

## Comments

### 2026-11-17 状态：未开始（等待实现组）

ticket 01 已完成共享骨架与接口；本 ticket 依赖 04。内容脚本入口 `ContentShell` 已提供 `selectionLayer` 装配位置（`ai-web-translation/src/modules/content-shell/content-shell.tsx`），划词浮层与悬浮按钮共用同一个 Shadow DOM 容器，不需要修改整页翻译实现。

## Comments

已完成（提交 `aa0f105`）。

- 落地：`selection-translation/`（controller、dom selection source、React 浮层、样式）；后台 `translation-engine/chat-completions-engine.ts`；`messaging/translation-transport.ts`（Port 逐条推事件）与 `profile-catalog-transport.ts`；`content-assembly` 生产装配改用真实 Adapter。
- 验证：`tests/unit/selection-translation.test.ts`（manual engine 覆盖图标、加载、成功、失败、选区切换、重复点击）；`tests/e2e-production/selection-translation.spec.ts` 用生产构建 + mock Chat Completions 端点覆盖真实链路。
- 说明：点击图标时用 `mousedown` 阻止默认行为，避免浏览器清空选区导致点击后拿不到原文。
