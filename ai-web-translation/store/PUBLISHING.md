# 发布清单：Chrome Web Store + Microsoft Edge Add-ons

> 版本：1.0.0 · 2026-11-18
> 这是人工提交清单。扩展代码、图标、商店截图、宣传图和 ZIP 已经准备好；下面几步必须由开发者账号持有人完成。

## 0. 先说清楚：哪些已完成，哪些必须你本人操作

已完成：

- 新图标（16/32/48/128 PNG）与 `manifest.json` 图标配置
- 商店图标 128×128、Edge 300×300
- 3 张 1280×800 商店截图
- 440×280 与 1400×560 宣传图
- 中文/英文商店文案、权限说明、数据披露草稿、隐私政策
- Chrome / Edge 共用 ZIP：`store/packages/ai-web-translation-1.0.0-chrome.zip` 与 `...-edge.zip`

必须你本人完成：

1. 注册 Chrome Web Store 开发者账号（一次性 $5 费用）并完成身份/发布者验证。
2. 注册 Microsoft Edge Partner Center 开发者账号（免费）。
3. 确定公开的 **发布者名称** 与 **支持邮箱**。
4. 把隐私政策放到公开 HTTPS 地址。
5. 准备一个**临时低额度测试 API Key** 或测试端点，填在商店审核备注里（不要提交到仓库）。
6. 在 Chrome / Edge 后台点击上传、填写表单、勾选协议并提交审核。

我不能代替你登录账号、支付费用、同意开发者协议或完成 2FA；这些步骤必须由账号持有人完成。

## 1. 一次性注册

### Chrome Web Store

1. 打开 <https://chromewebstore.google.com/devconsole>
2. 用 Google 账号登录，支付一次性注册费（当前为 $5，以页面显示为准）。
3. 填写发布者名称、联系邮箱，完成账号验证。
4. 开启 2FA；商店通知会发送到该邮箱。

### Microsoft Edge Add-ons

1. 打开 <https://partner.microsoft.com/dashboard/microsoftedge/>
2. 用 Microsoft 账号（Outlook/Live/Hotmail，或 GitHub 登录后创建 MSA）注册 Microsoft Edge 计划。
3. 选择 Individual 或 Company，填写发布者名称、联系信息和验证资料。
4. Edge 计划**没有注册费**；账号审核可能需要几天。

## 2. 填写公开信息并部署隐私政策

先确定两个值：

- `{{PUBLISHER_NAME}}`：商店公开显示的名称（个人或公司）。
- `{{SUPPORT_EMAIL}}`：公开支持邮箱，必须能收信。

替换以下文件中的占位符：

```text
store/privacy-policy.html
store/privacy-policy.md
CHROMEWEBSTORE.md
EDGESTORE.md
store/listing-en.md
```

然后把 `store/privacy-policy.html` 部署到公开 HTTPS 地址。推荐 GitHub Pages：

1. 新建一个公开仓库（只放隐私政策即可）。
2. 上传 `privacy-policy.html`，并把 `store/assets/icon-128.png` 放到同目录的 `assets/` 下。
3. 仓库 Settings → Pages → Deploy from a branch → `main` / root。
4. 得到类似 `https://<你的用户名>.github.io/<仓库名>/privacy-policy.html` 的地址。
5. 用无痕窗口打开，确认不是 404，且正文没有 `{{SUPPORT_EMAIL}}` 占位符。
6. 把该 URL 填到 Chrome 后台和 Edge 后合的 Privacy Policy URL。

> GitHub Gist 也可以，但页面样式和稳定性不如 Pages。不要把隐私政策放在需要登录的页面。

## 3. 准备审核测试凭据

这是 BYO-AI 扩展最常见的审核卡点：审核员没有你的 API Key，无法看到翻译结果。

- 让审核员在 **Settings → 翻译服务** 新建配置，填入一个可用的 OpenAI 兼容端点、模型和临时 Key。
- 在 Chrome 的“审核备注 / Certification notes”和 Edge 的“Certification notes”里写清楚测试步骤和凭据。
- 临时 Key 只放在商店后台的私有审核备注里，**不要**写进仓库、截图、README 或聊天记录。
- 审核通过后立刻轮换/删除该 Key。

如果不想提供 Key，可以准备一个只返回固定 JSON 的临时 HTTPS mock 端点，并在审核备注里提供；但不要把它作为产品内置服务。

## 4. 构建与打包

```bash
cd ai-web-translation
npm ci
npx playwright install chromium

npm run verify          # compile + 单测 + 生产/演示构建
npm run store:assets    # 重新生成图标、商店图、宣传图
npm run store:screenshots
npm run store:package
```

产物：

```text
store/packages/ai-web-translation-1.0.0-chrome.zip
store/packages/ai-web-translation-1.0.0-edge.zip
```

两个 ZIP 内容相同；Chrome 和 Edge 都可以上传。ZIP 根目录必须直接是 `manifest.json`，不要多套一层文件夹。

提交前检查：

- `manifest.json` 的 `version` 是 `1.0.0`，且比商店里已有版本高。
- `manifest.json` 的 `name`、`description` 与商店文案一致。
- 4 个图标都存在且尺寸正确。
- ZIP 里没有 `.env`、`node_modules`、测试文件、`*.map`。
- 本机构建中不包含 `模拟译文` / `FakeTranslationEngine`（生产产物已由 e2e 检查）。
- 隐私政策 URL 可公开访问，且与数据披露一致。

## 5. Chrome Web Store 提交

1. 打开 <https://chromewebstore.google.com/devconsole> → New item。
2. 上传 `store/packages/ai-web-translation-1.0.0-chrome.zip`。
3. 填写 Store listing，直接复制 [`CHROMEWEBSTORE.md`](CHROMEWEBSTORE.md) 中的：
   - Extension name
   - Short description
   - Detailed description
   - Category: Productivity
   - Primary language: Chinese (Simplified)
4. 上传图形：
   - Store icon: `store/assets/icon-128.png`
   - Screenshots: `store/assets/screenshots/01..03`
   - Small promo tile: `store/assets/promo-small-440x280.png`
   - Marquee: `store/assets/promo-large-1400x560.png`
5. Privacy practices：
   - Single purpose：`在用户自行配置的 AI 翻译服务下，把英文网页翻译成中文。`
   - 权限说明：复制 `CHROMEWEBSTORE.md` 的 Permissions Justification 表。
   - 数据使用：勾选 **Website content** 和 **Authentication information**；不要勾选 analytics/ads/sale。
   - Remote code：**No**。
   - Privacy policy URL：第 2 步部署的地址。
6. Distribution：Public，All regions。
7. 在审核备注里写测试步骤和临时 Key（不要写进公开描述）。
8. Submit for review。
9. 审核通过后，Chrome 后台可选择 **Publish**；批准后通常需在 30 天内发布。

## 6. Microsoft Edge Add-ons 提交

1. 打开 <https://partner.microsoft.com/dashboard/microsoftedge/>。
2. 进入 Microsoft Edge → New extension。
3. 上传 `store/packages/ai-web-translation-1.0.0-edge.zip`。
4. 填写 Store listing，复制 [`EDGESTORE.md`](EDGESTORE.md) 的：
   - Category: Productivity
   - Detailed description
   - Search terms
   - Primary language: Chinese (Simplified)
5. 上传图形：
   - Extension logo: `store/assets/icon-300.png`
   - Screenshots: `store/assets/screenshots/01..03`（1280×800）
   - Small promotional tile: `store/assets/promo-small-440x280.png`
   - Large promotional tile: `store/assets/promo-large-1400x560.png`
6. Privacy：
   - Single purpose
   - Permission justification（`storage`、`http://*/*`、`https://*/*`）
   - Remote code: **No**
   - Data usage: Website content / Authentication information
   - Privacy policy URL
7. Certification notes：填写测试步骤和临时 Key。
8. Submit。
9. 审核通过后发布。

> Edge 的扩展名称和短描述来自 ZIP 里的 `manifest.json`，在 Partner Center 里是只读的；要改只能改 manifest 后重新上传。

## 7. 发布后

- 在 Chrome 和 Edge 各安装一次商店版本，确认图标、悬浮按钮、整页翻译、划词翻译和设置页正常。
- 用商店版本再跑一次“无配置 → 提示配置”的路径。
- 监控 `{{SUPPORT_EMAIL}}` 和商店后台的审核/用户反馈。
- 立刻轮换审核用的临时 API Key。
- 为本次发布打 tag：`git tag v1.0.0`。
- 以后每次更新：修改 `package.json` / manifest 版本 → 更新 `CHROMEWEBSTORE.md` 的 Version History → `npm run verify && npm run store:package` → 上传新 ZIP。

## 8. 仍需确认的信息

发布前请把下面四项补上；在补齐之前，商店后台会卡在必填项：

- [ ] 发布者名称（`{{PUBLISHER_NAME}}`）
- [ ] 公开支持邮箱（`{{SUPPORT_EMAIL}}`）
- [ ] 隐私政策公开 URL（`[待部署]`）
- [ ] Chrome / Edge 开发者账号已注册，且能登录后台

不要通过聊天发送 API Key 或账号密码；测试 Key 由你直接填在商店后台的私有审核备注里。
