---
title: SvelteKit 部署到 Cloudflare Pages 全紀錄
date: 2026-08-22
tags: [Cloudflare, SvelteKit, 部署]
summary: 從 adapter 選擇、wrangler.toml 綁定 D1/R2、本地開發直接讀 binding，到 deployment 流程 — 附上我踩過的所有坑。
cover: /covers/cloudflare-pages.svg
---

這篇是這個網站自身的部署紀錄。`SvelteKit 2` 跑在 `Cloudflare Pages`，資料庫用 `D1`，靜態檔案（封面、圖片）放 `R2`。整套組合每個月的帳單是 $0（R2 只有流出流量才收費，個人博客的規模可以當作免費）。

如果你也想把 SvelteKit 丟上 Cloudflare，照著這篇做就對了 — 我把過程中的每個坑都標出來了。

## 為什麼選 Cloudflare

| 服務    | 成本         | 用途                     |
| ------- | ------------ | ------------------------ |
| Pages   | $0           | 部署與 SSR（Edge 渲染）  |
| Workers | $0（方案內） | 函式後端                 |
| D1      | $0           | SQLite 資料庫            |
| R2      | 接近 $0      | 物件儲存（圖片等靜態檔） |

對個人博客這種流量來說，這幾項都是免費額度內 — 沒有伺服器要顧、不用煩 TLS 憑證、也不用半夜被主機商通知開通。Edge 渲染的延遲也夠低，光這三點就贏過自己架 VPS。

## 第一步：換掉 adapter-auto

SvelteKit 預設的 `adapter-auto` 在 Pages 上也能跑，但綁定（D1／R2）的型別、`platform` 的注入方式都需要 `adapter-cloudflare` 的支援，所以直接換掉：

```bash
pnpm add -D @sveltejs/adapter-cloudflare
```

```typescript
// vite.config.ts
import adapter from '@sveltejs/adapter-cloudflare';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				config: 'wrangler.toml',
				platformProxy: {
					configPath: 'wrangler.toml',
					persist: true
				}
			})
		})
	]
});
```

`platformProxy` 這行很關鍵：它讓 `pnpm dev` 時也能讀到 D1 / R2 binding，**本地開發完全不需要另外開服務**。

## 第二步：wrangler.toml 綁定

```toml
name = "my-blog"
compatibility_date = "2026-08-20"
pages_build_output_dir = ".svelte/cloudflare"

[[d1_databases]]
binding = "DB"
database_name = "my-blog"
database_id = "<從 wrangler d1 create 取得>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "blog-assets"
```

> ⚠️ 最大的坑：`ASSETS` 是 Pages 的保留 binding 名稱，**R2 或 D1 的 binding 都不能叫這個名字**，否則部署會直接失敗且錯誤訊息很不直觀。

`database_id` 用 `pnpm wrangler d1 create <名字>` 建立後抓下來即可。

### D1 的 schema 變更方式

沒有替 D1 排自動 migration 的話，最快的做法是 SQL 檔直接執行：

```bash
pnpm wrangler d1 execute my-blog --remote --file=migrations/0002_xxx.sql
```

把 migration 檔案留在 `migrations/` 資料夾，就是最陽春的版本控制。

## 第三步：型別聲明

```typescript
// src/app.d.ts
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				BUCKET: R2Bucket;
			};
		}
	}
}
```

有了這個，`platform?.env.DB` 就會有完整的型別提示。我不太喜歡 `platform?.env` 的可選鏈寫法 — 直接拆一支 `getDb()`/`getBucket()` 的 wrapper 包起來，好處是 DB 沒配好時錯誤訊息能統一。

## 部署

兩種方式：

1. **GitHub 串接**：把 repo 連上 Cloudflare Pages，push 即自動部署。Build 指令 `pnpm build`，輸出目錄 `.svelte/cloudflare`。
2. **手動指令**（我目前用的方式）：

```bash
pnpm wrangler pages deploy .svelte/cloudflare --project-name my-blog
```

手動部署的好處是部署前可以先 `pnpm lint && pnpm check && pnpm build`，不過這邊的內容埋了坑，提醒一下：**改完資料庫 schema 記得先跑 migration 再部署**，不然新舊程式碼對不上，會有很神奇的 500。

## 踩過的坑總結

- `ASSETS` 是保留名，binding 別用它
- `platformProxy.persist: true` 才能讓本地 dev 的 D1 資料持續存在，不然每次重開都得重新 migrate
- Pages 上 `platform.env` 的 Database class 來自 `@cloudflare/workers-types`（D1 是 v1 API），SvelteKit 的 `RequestHandler` 型別記得帶 `platform`
- migration 檔案是唯一 Schema 歷史，**刪了就回不來了**

整體來說，SvelteKit + Cloudflare Pages 這個組合在個人博客規模下體驗很好：免費、Edge 快、繞過所有伺服器維運。如果你也正在考慮搬家，建議直接試 — 半天內就能把部落格搬上去。有問題歡迎留言問我。
