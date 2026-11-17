# 02: 建立基础翻译服务配置

**What to build:** 用户可以在设置页创建、编辑、删除和命名多份翻译服务配置，填写完整 Chat Completions URL、API Key 和模型名，并选择默认配置。配置在本机持久保存，密钥不会完整展示或传播到页面。

**Blocked by:** 01: 建立扩展骨架与共享契约

**Status:** ready-for-agent

- [ ] 用户可以创建、编辑、删除多份命名配置，每份配置具有稳定 ID 并保存完整 URL、API Key 和模型名。
- [ ] 必填名称、URL 和模型名具有明确校验与错误提示；API Key 可以留空。
- [ ] 用户可以指定一份默认配置，默认选择在扩展重新加载后仍然保持。
- [ ] 配置和默认选择保存在本机扩展存储，重新打开设置页后内容一致。
- [ ] API Key 默认脱敏显示，不出现在日志、公开错误、页面消息或 Translation Profile Catalog 中。
- [ ] 删除配置时不会留下指向不存在配置的默认选择；删除当前使用配置不会影响其他有效配置。
- [ ] 设置页可以列出配置摘要，页面侧只能读取 ID、名称和默认状态。
- [ ] 测试覆盖创建、编辑、删除、默认切换、重新加载和密钥不外泄等外部行为。

## Comments

### 2026-11-17 状态：未开始（等待实现组）

共享前置 ticket 01 已完成（见 `01-extension-foundation.md` 的 Comments）：扩展骨架、Translation Engine / Translation Profile Catalog Interface、fake Adapter 与测试工具已就绪，本 ticket 的阻塞已解除。实现位置为 `ai-web-translation/`。

## Comments

已完成（提交 `a8603e0`）。

- 落地：`src/modules/translation-profile/profile.ts`、`profile-store.ts`（CRUD、默认选择、悬空默认回落、损坏数据规范化、串行写入）、`profile-catalog.ts`（只读目录，仅 ID/名称/默认）、设置页 `translation-profiles-panel.tsx` + `profile-editor.tsx`。
- 验证：`tests/unit/translation-profiles.test.ts`（15）、`tests/e2e/translation-profiles.spec.ts`（新建、重载持久化、默认切换、删除回落、密钥脱敏）。
- 说明：删除默认配置时默认选择回落到剩余第一份配置，不留空默认。
