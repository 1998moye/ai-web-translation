# 14: 完成可翻译内容识别与格式保护

**What to build:** 完善页面翻译会话的内容筛选，使只有需要翻译的英文内容进入 Translation Engine，同时保护代码内容、用户输入、非英文内容、链接和行内格式，避免翻译破坏页面。

**Blocked by:** 13: 完成界面文本译文优先显示

**Status:** ready-for-human

- [x] 按翻译单元识别英文，中英混排页面只提交英文，已有中文、纯数字和纯符号不产生请求。
- [x] 代码块、命令、参数名和行内代码等代码内容保持英文且不进入翻译请求。
- [x] 脚本、样式、隐藏内容和用户自己填写的输入内容不进入翻译请求。
- [x] 非英文内容不会被误提交，页面是否触发自动翻译所需的英文判断可以复用同一语言识别结果。
- [x] 正文和界面文本中的链接、强调及其他行内格式在翻译后保持语义和交互。
- [x] 模型返回内容经过安全处理，不作为可执行页面 HTML 直接注入，不引入脚本或事件处理器。
- [x] 空白、换行和必要的格式标记得到保留，不因规范化导致原文与译文错位。
- [x] 固定样本覆盖技术文档、代码、混排语言、隐藏元素、表单输入、链接和恶意格式输出。
- [x] 测试通过 Page Translation Session 观察提交内容和最终 DOM，不依赖私有扫描函数。

## Comments

### 2026-11-17 实现完成

- 实现：`src/modules/content-scan/scan-translatable-targets.ts`（正文/界面文本识别、代码与隐藏内容保护、最内层单元去重）、`src/modules/inline-format/inline-format.ts`（行内格式占位标记与安全渲染）、`src/modules/language/language.ts`（英文识别）。
- 只提交英文单元：含中日韩字符、明显非英文虚词（法/德/西等）、纯数字与符号都不产生请求；语言识别结果同时用于按网站自动翻译判断。
- 行内代码以占位标记代替，代码内容不进入请求；翻译后按标记还原为 `code`，链接/强调还原为 `a`/`em`/`strong`；模型输出只走 `textContent` 与白名单元素，`script`/`img` 等不会变成可执行节点。
- 验收：`tests/unit/inline-format.test.ts`（13 用例，含未知/不配对/错序标记回退纯文本、HTML 注入防护）、`tests/unit/content-scan.test.ts`（11 用例）、`tests/unit/language.test.ts`（11 用例）、`tests/e2e/page-translation.spec.ts`（中文/法语段落不翻译、代码保持、表单输入不变）。

### 2026-11-17 复核补丁

- 修复隐藏容器（如 `display:none` 折叠面板）内的英文仍被提交的问题：优先使用 `checkVisibility`，其他环境逐层检查祖先的 display/visibility/hidden。
- 补充会话级测试，确认隐藏内容不进入请求、可见内容照常翻译。

### 2026-11-17 修复仓库元数据行译文错位

- 正文扫描新增“紧凑控制行”判断：`div` 内有 2 个以上链接/按钮等界面控件，且直接文本不足 30 字符时，不再当作正文段落。GitHub Trending 的 `TypeScript · 8,480 · 729 · Built by … · stars this week` 这类元数据行因此不会在下方插入整块译文、挤开下一行。
- 元数据里的链接仍按界面文本原位翻译；普通正文 `div`（直接文本足够长）不受影响。
- 验收：`tests/unit/content-scan.test.ts` 新增“仓库元数据行”与“长多链接 div”用例（15 用例）；真实 GitHub Trending 用 fake Engine 抽查，元数据行不再出现 `body-translation`；单测 311、fake e2e 29 passed / 1 skipped、生产 e2e 27 passed。
