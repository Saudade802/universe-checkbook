# 宇宙无限银行 · 财富显化支票

可部署到 Vercel 的 Next.js 网页，提供支票填写、实时预览、登录和图片下载。

## 功能

- 五项必填：日期、收款人、金额、用于/目标、填写人。
- 邮箱注册和登录，每个账号独立保存填写次数。
- 每位用户共 50 次提交机会；填错或未填完整的提交也计次。
- Supabase 数据库事务和账号行锁保证并发请求不会超过 50 次。
- 同一请求的网络重试不重复扣次。
- 成功提交后下载 PNG / JPG，尺寸 2990 × 2178。
- 修改已生成的内容需要重新提交；次数用完后仍能下载最近一次成功支票。
- 数据库行级权限保证填写内容只有对应账号可以读取。

## Vercel 部署

导入本仓库，选择 **Next.js**，项目根目录为仓库根目录。

- Install Command：`npm ci`
- Build Command：`npm run build`
- Output Directory：使用 Next.js 默认值，不要填 `dist`。
- Node.js：22.x 或更新的受支持版本。

`vercel.json` 已声明框架和构建命令。原有 Cloudflare/Vinext 构建已切换为标准 Next.js 构建。

### 数据库与登录

使用 Supabase Auth 和 PostgreSQL。`supabase/public-config.json` 包含已连接项目的公开 URL 和 publishable key；这些是面向客户端公开的连接信息，不是 service-role 密钥。

对应数据库迁移为 `supabase/migrations/202610140001_manifestation_checkbook.sql`，已应用到关联 Supabase 项目。复用该项目时不需要重复运行迁移。

如果换成自己的 Supabase 项目，在 SQL Editor 运行迁移，并在 Vercel 中配置：

```text
NEXT_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的publishable-key
```

环境变量会覆盖公开连接文件。不要在这些变量中使用 service-role 或 secret key。

在 Supabase 的 Authentication → URL Configuration 中把 Site URL 设为正式网站地址，并允许 `https://正式网站地址/auth/confirm`。注册需要确认邮箱，之后可以回到网站使用邮箱和密码登录。默认邮件模板可用，也支持自定义 token-hash 确认模板。

GitHub 提交后 Vercel 会自动构建；也可以在 Deployments 中手动 Redeploy 最新提交。

## 本地运行

需要 Node.js 22.13 或更新版本。

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:3000`。

如果只想本地检查界面和下载，在 `.env.local` 写入 `CHECKBOOK_LOCAL_PREVIEW=1`，登录页会出现“本地预览登录”。它使用独立本地测试数据库，只在开发环境启用，生产环境及 Vercel 均不能使用该测试登录。

## 验证

```sh
npm test
npm run build
```

`tests/supabase-quota.sql` 可以在关联 Supabase 的 SQL Editor 运行数据库权限与计数检查，测试数据在结束时回滚。

## 主要文件

- `app/checkbook.tsx`：填写界面、实时预览、图片导出。
- `app/api/checks/route.ts`：提交与个人次数接口。
- `app/auth/`、`app/api/auth/`：邮箱注册、登录、确认及退出。
- `proxy.ts`：刷新和验证 Supabase 登录会话。
- `supabase/migrations/`：50 次限制、事务锁、去重与账号隔离。
- `public/check-template.jpg`：用户提供的原始支票图片。

金额按人民币填写，最多 15 位整数和 2 位小数；收款人和填写人最多 30 个字，目标最多 80 个字。
