# 03: 配置高级请求与运行参数

**What to build:** 扩展每份翻译服务配置的高级设置，使用户能够配置自定义请求头、额外请求参数和任务运行参数，并在保存或测试前发现不安全的地址、无效 JSON、保留字段冲突和认证冲突。

**Blocked by:** 02: 建立基础翻译服务配置

**Status:** ready-for-agent

- [ ] 每份配置支持自定义请求头，使用其他认证方式时可以留空 API Key 并通过请求头认证。
- [ ] 额外请求参数以 JSON 对象编辑，新配置默认包含 reasoning_effort 为 none，不提供独立的思考等级按钮。
- [ ] model、messages、stream 是保留字段；额外参数包含这些字段时给出明确错误，不静默覆盖或删除。
- [ ] API Key 与自定义 Authorization 同时存在时提示冲突并要求二选一。
- [ ] 并发数、请求超时和自动重试次数可编辑，默认分别为 3、60 秒和 2 次，并明确它们不会进入请求体。
- [ ] 远程 URL 只允许 HTTPS；localhost 和 127.0.0.1 允许 HTTP；其他不安全地址在保存或测试前被拒绝。
- [ ] 非法 JSON、非对象 JSON 和浏览器禁止设置的请求头具有可理解的错误提示，不会被静默忽略。
- [ ] 高级设置在扩展重新加载后保持，敏感请求头不会进入日志、公开错误或页面消息。
- [ ] 测试覆盖默认参数、合法自定义、各类冲突、地址规则和重新加载行为。

## Comments

### 2026-11-17 状态：未开始（等待实现组）

ticket 01 已完成共享骨架与接口；本 ticket 依赖 02。设置页的「翻译服务配置」页签占位已在 `ai-web-translation/src/entrypoints/options/translation-profiles-panel.tsx` 留好，替换该占位即可接入，不需要改动整页翻译组的页面与偏好实现。

## Comments

已完成（提交 `a8603e0`）。

- 落地：`profile.ts`（HTTPS/localhost 地址规则、保留字段、浏览器禁用请求头、运行参数上下限）、`profile-validation.ts`（保存校验、额外参数 JSON 解析、请求头行解析）、`profile-form.ts`（表单唯一保存入口：解析文本域 → 秒转毫秒 → 完整校验）。
- 验证：`tests/unit/profile-validation.test.ts`（27）、`tests/unit/profile-form.test.ts`（9）、设置页 e2e 覆盖高级设置往返与冲突提示。
- 说明：校验错误只回显字段名与请求头名，不回显请求头值、密钥或解析失败的原始片段。
