# 浏览器 AI 翻译插件：AI 实施交接

这是首版实施的入口。唯一完整需求基线是 [spec.md](spec.md)，每个实现任务在 `issues/` 中单独维护。

## 所有实现者必须先读

1. 根目录 `AGENTS.md` 及其引用的 tracker、triage 和领域文档规则。
2. 根目录 `GLOSSARY.md`，统一使用已经确认的领域术语。
3. `docs/adr/0001-all-websites-floating-button.md`，理解广泛网站权限是刻意选择。
4. 本目录的 `spec.md`，特别是共享 Interface、安全限制、测试决策和 Out of Scope。
5. 自己负责的 ticket 及其全部阻塞 ticket。

## 执行顺序

### 第一步：共享前置

完成 `01-extension-foundation.md`。在它的构建、测试和共享契约验收通过前，两组不开始各自功能。

### 第二步：两组并行

**AI 1：翻译服务与划词翻译，02–09**

- 负责翻译服务配置、翻译提示词、真实连接、划词翻译、Translation Engine、译文缓存和任务控制。
- 通过 mock HTTP Adapter 测试真实外部请求行为，不在自动化测试中使用真实 API Key。
- 不修改 10–18 的页面交互实现，不为局部需要单方面改变共享 Interface。

**AI 2：整页翻译与页面交互，10–18**

- 负责悬浮翻译按钮、网站偏好、Page Translation Session、动态内容、界面文本和自动翻译。
- 使用共享 fake Translation Engine 和 Translation Profile Catalog 独立开发与验收。
- 不实现第二套 AI 请求逻辑，不读取密钥，不修改 02–09 的配置与 Translation Engine Implementation。
- 11 只阻塞自身和最终联调，不阻塞 12；其余页面功能按各自 `Blocked by` 执行。

### 第三步：共同联调

只有 09、11、18 及其全部阻塞 ticket 完成后，才开始 `19-production-integration-acceptance.md`。联调负责生产装配与端到端验收，不把 fake 带入生产，也不在该 ticket 中无限增加新网站适配。

## 共同约束

- 先完成阻塞 ticket，再开始被阻塞 ticket；不要只按文件名猜测依赖。
- 只通过 Module Interface 使用另一组能力，不读取或修改其内部状态。
- 共享契约确需变化时，先停止相关实现并回到 spec 评审，评估两组影响后再改。
- React 页面和面板保持薄，业务规则归属对应 Module，避免浅透传层和重复请求逻辑。
- 不把 API Key、敏感请求头或真实用户网页内容写入代码、测试、日志、ticket 或评论。
- 每个 ticket 必须完成自己的验收标准和相关测试，不能以“留给联调”为由省略核心行为。
- ticket 状态使用 `docs/agents/triage-labels.md` 中的词汇，评论追加到对应 ticket 的 Comments 部分。
