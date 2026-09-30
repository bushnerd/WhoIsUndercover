# 谁是卧底 · 无境探险 V2

独立的纯静态手机派对游戏。旧版入口和文件保持不变；本目录可以单独部署到 Cloudflare Pages，词库数据、插画和页面资源都随目录一起发布。

## 本地预览

在仓库根目录运行：

```powershell
python -m http.server 8080 --directory v2
```

打开 `http://localhost:8080`。本机 localhost 支持 Service Worker；局域网手机调试相机时请使用 HTTPS。

## Cloudflare Pages

推荐使用 GitHub 集成，这样推送后会自动更新部署：在 Cloudflare Dashboard 的 **Workers & Pages → Create application → Pages → Connect to Git** 中，授权 GitHub 并选择本仓库。项目设置填写：

- Production branch：`main`
- Root directory：留空，使用仓库根目录
- Build command：留空
- Build output directory：`v2`

此仓库是纯静态站点，不需要框架构建、后端或环境变量。首次部署前，`v2/` 文件必须已提交并推送到 GitHub；之后推送到 `main` 会自动部署。Cloudflare 生成的 `*.pages.dev` 项目与 GitHub Pages 独立，原旧版入口不变。

如果暂时不想推送代码，可以在 Cloudflare Dashboard 使用 **Create application → Get started → Drag and drop your files**，上传 `v2/` 目录内容。Direct Upload 项目之后不能转换成 Git 集成项目；若之后需要自动部署，必须另建 Git 集成项目。也可从仓库根目录执行 `npx wrangler login`、`npx wrangler pages project create`，再运行 `npx wrangler pages deploy .\v2 --project-name=<项目名> --branch=main`。

Git 集成和构建目录设置见 [Cloudflare Git 集成文档](https://developers.cloudflare.com/pages/get-started/git-integration/) 与 [构建配置文档](https://developers.cloudflare.com/pages/configuration/build-configuration/)；Direct Upload 限制见 [官方文档](https://developers.cloudflare.com/pages/get-started/direct-upload/)。

`pages.dev` 可用于新版预览，但无法保证中国大陆首次访问稳定。离线缓存只会在页面成功加载后生效，不能代替首次网络访问。

## 文件

- `index.html`、`styles.css`、`app.js`：页面和游戏流程。
- `data/categories.json`：10 个主题及 31 个细分类。
- `data/pairs.json`：600 组词对，每组归属一个细分类。
- `sw.js`、`manifest.json`：离线缓存与可安装应用配置。
- `assets/mascot.svg`：本地卡通插画和应用图标。
- `generate-data.js`、`extra-pairs.txt`：从旧版词库与补充词对重建 JSON 数据；运行 `node v2/generate-data.js`。
