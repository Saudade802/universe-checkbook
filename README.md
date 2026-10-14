# 宇宙无限银行 · 财富显化支票

按照参考支票图片制作的网页，支持填写、提交和下载专属支票。

## 功能

- 可编辑日期、收款人、金额、用于/目标、填写人，实时预览。
- 使用 ChatGPT 账号登录，每个账号有 50 次提交机会。
- 成功或错误提交都扣除一次，服务器保存次数，刷新或换设备不会重置。
- 网络重试不会重复扣次，并发提交也不能突破 50 次限制。
- 五项信息通过校验后，下载 PNG 或 JPG，尺寸为 2990 × 2178。
- 修改已生成的内容需要重新提交；次数用完后仍可下载最近成功支票。
- 支票数据按账户隔离，匿名访问可以查看页面。

## 技术

React 19、TypeScript、Vinext / Vite、Cloudflare Workers、Cloudflare D1、Drizzle。

## 本地开发

需要 Node.js 22.13 或更新版本。

```sh
npm ci
npm run build
```

应用本地数据库迁移：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_optimal_devos.sql
npm run dev
```

本地登录仅为开发测试身份，生产登录由 Sites 平台提供。

## 检查

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/checks.test.mjs
```

已通过 TypeScript 检查、生产构建、字段校验和 50 次计数测试，以及真实接口处理器的账户隔离、重试去重和并发上限测试。完整浏览器下载验证尚未完成。

## 部署

此项目需要支持服务器运行和 D1 数据库的托管平台，不能仅通过 GitHub Pages 运行。

Sites 项目配置在 `.openai/hosting.json`，已有项目应复用其中的 `project_id`。发布时应用 `drizzle/` 中的数据库迁移。GitHub 仓库用于保存源码；网站托管需要另行部署。

## 文件

- `app/checkbook.tsx`：表单、实时预览和图片导出。
- `app/api/checks/route.ts`：登录校验、提交与次数查询。
- `lib/checks.ts`：字段校验与计数 SQL。
- `db/schema.ts`、`drizzle/`：数据库结构与迁移。
- `public/check-template.jpg`：用户提供的支票底图。

金额按人民币填写，最多 15 位整数及 2 位小数；收款人和填写人最多 30 个字，目标最多 80 个字。
