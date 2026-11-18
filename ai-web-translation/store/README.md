# 商店发布资料

> 版本 1.0.0 · 2026-11-18

| 文件 | 用途 |
|------|------|
| `PUBLISHING.md` | Chrome / Edge 人工提交清单与审核测试说明 |
| `CHROMEWEBSTORE.md` | Chrome Web Store 文案、权限理由、数据披露 |
| `EDGESTORE.md` | Edge Add-ons 文案、图形要求、认证备注 |
| `privacy-policy.html` / `.md` | 隐私政策；已部署到 <https://1998moye.github.io/ai-web-translation-privacy/> |
| `listing-en.md` | 英文商店文案 |
| `icon.svg` / `icon-small.svg` | 图标矢量源文件 |
| `assets/icon-128.png` | Chrome 商店图标 |
| `assets/icon-300.png` | Edge 商店 Logo |
| `assets/screenshots/` | 3 张 1280×800 商店截图 |
| `assets/promo-small-440x280.png` | 小型宣传图 |
| `assets/promo-large-1400x560.png` | 大型宣传图 |
| `packages/` | 构建产物 ZIP（已 gitignore，可用脚本重新生成） |

## 生成命令

```bash
npm run store:assets
npm run store:screenshots
npm run store:package
```

`store:screenshots` 会启动一个本地 demo 服务，用生产构建渲染英文示例文章并生成中文译文；不会使用真实 API Key。截图中的示例配置使用占位域名/模型，API Key 为明显的 demo 值。

## 已填写的信息

- 发布者名称：`dz`
- 公开支持邮箱：`q1806314252@gmail.com`
- 隐私政策：<https://1998moye.github.io/ai-web-translation-privacy/>

仍需完成：Chrome / Edge 开发者账号注册、审核用临时 API Key。不要把真实 API Key 写入任何 `store/` 文件或提交到 Git；审核用临时 Key 只填在 Chrome/Edge 后台的私有审核备注里。
