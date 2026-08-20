# vuepress-material

基于 VitePress 和 Vue 3 的 Material 风格博客。线上站点：[ShaofeiZi Blog](https://shaofeizi.github.io/BLOG/)。

## 本地开发

项目固定使用 Node.js 22.22.2、npm 10.9.7，并通过 lockfile 安装完全一致的依赖：

```sh
npm ci
npm run dev
```

提交前运行与 CI 相同的源码检查、生产构建和产物验证：

```sh
npm test
```

生产文件生成到 `docs/`。验证脚本会检查 54 篇文章、分页与 45 个大小写敏感标签、`/BLOG/` base、manifest、Vite 入口，以及 HTML/CSS 引用的全部本地静态资源。标签筛选使用 `/tags/?tag=...`，避免不同平台对仅大小写不同文件名的处理不一致。`npm run deploy` 只在本地执行这些预部署检查，不会直接推送远程仓库。

直接依赖固定为当前 npm `latest` 的 VitePress 1.6.4 和 Vue 3.5.41。VitePress 默认依赖的 Vite 5 已出现安全公告，因此通过 `overrides` 使用其 Vue 插件官方兼容范围内、已修复公告的 Vite 6.4.3；Vite 8 与当前稳定版 VitePress 的构建插件不兼容。

## 自动部署

GitHub Actions 在以下情况构建并发布站点：

- `master` 分支收到 push；
- 在仓库的 **Actions → Build and deploy blog → Run workflow** 中手动触发。

工作流依次执行 `npm ci`、`npm run check`、`npm run build` 和产物验证。全部通过后，它会将 `docs/` 完整同步到 [`ShaofeiZi/BLOG`](https://github.com/ShaofeiZi/BLOG) 的 `master` 分支，补充 `.nojekyll`，再创建普通 Git commit 并 push。部署不会 force-push；并发保护会避免两个发布同时写入目标分支。没有内容变化时不会创建空 commit。

### 部署凭据

仓库已配置以下 repository secret；若需要轮换，请在 **Settings → Secrets and variables → Actions** 中更新：

- 名称：`BLOG_DEPLOY_KEY`
- 值：仅授权 `ShaofeiZi/BLOG` 仓库写入的 Ed25519 Deploy Key 私钥。

源码仓库的默认 `GITHUB_TOKEN` 只有 `contents: read` 权限。跨仓库 Deploy Key 只在构建和验证成功后才交给目标仓库 checkout，不会暴露给依赖安装或项目脚本。

## 回滚

优先在本仓库对有问题的源码提交执行 `git revert <commit>`，再 push 到 `master`；工作流会生成一个新的部署 commit，保留完整历史。若需要紧急恢复已发布内容，也可以在 `ShaofeiZi/BLOG` 中 revert 对应的部署 commit 并普通 push。不要 reset 或 force-push 目标分支；之后仍应在源码仓库完成永久修复或回滚，避免下一次部署重新引入问题。
