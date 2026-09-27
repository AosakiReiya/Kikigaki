# Kikigaki

> 本檔為繁體中文版；主要文件見 [README.md](./README.md)（English）。

Awwwards 級個人博客。SvelteKit + Svelte 5（runes）+ Tailwind CSS v4 + GSAP，全站部署在 Cloudflare（Pages + D1 + R2）。


## 動畫實錄

下列畫面全部來自內建示範內容（`pnpm seed:demo`）——零個人資料：

![示範：開場動畫、雜誌首頁、內嵌元件文章](static/demo/demo.gif)

| 雜誌（預設）                      | 文章與內嵌元件                     | 新聞大報                                | 企業                                         |
| --------------------------------- | ---------------------------------- | --------------------------------------- | -------------------------------------------- |
| ![雜誌首頁](static/demo/home.png) | ![文章頁](static/demo/article.png) | ![新聞主題](static/demo/theme-news.png) | ![企業主題](static/demo/theme-corporate.png) |

## 技術棧

| 面向 | 選型                                               |
| ---- | -------------------------------------------------- |
| 框架 | SvelteKit 2 + Svelte 5（強制 runes）               |
| 樣式 | Tailwind CSS v4（typography / forms 插件）         |
| 動畫 | GSAP（Core / ScrollTrigger / Flip）+ Lenis         |
| 內容 | mdsvex + `content/blog/*.md`                       |
| 資料 | Cloudflare D1（Drizzle ORM）                       |
| 儲存 | Cloudflare R2（圖片）                              |
| i18n | Paraglide.js（base：zh-tw）                        |
| 部署 | Cloudflare Pages（`@sveltejs/adapter-cloudflare`） |

## Fork／自我介紹（開源使用方式）

代碼內**零個人資訊**——站名、作者、社交連結、站網址的出廠預設皆中性佔位，
全部在後台「網站識別／社交連結」填寫（存 DB，非代碼）。流程：

1. Fork → Cloudflare Pages 連 GitHub（或 `docker compose up`，見 Self-host 節）
2. 首次開 `/admin` → 首跑頁建立你的管理員帳號（之後此頁永久關閉）
3. 「設定 → 網站識別」填站名/作者/站網址（canonical 敏感）→「社交連結」填你的 GitHub/X 等
4. 需要評論收件箱：「Email 發送」卡選 provider（Resend 免費 3,000 封/月）＋站長通知地址
5. 想要自己的版面：`pnpm theme:create my-theme --clone terminal` → 改 packs/色盤（或讓站內 AI 幫你改）

已知限制：Workers Free 無 SMTP／函式 10ms CPU（Agent 靠分段泵動適配）；
多語系清單屬建置期（config/locales.json）；自架 SMTP 物理上不可行，
事務信走 HTTPS provider（Resend/SMTP2GO/Postmark/Mailgun/SES）。

## 前置需求

- Node 22+
- pnpm 10+
- 一個 Cloudflare 帳號（用於 D1 / R2 / Pages）

## 本地開發

```sh
pnpm install
pnpm dev
```

本地開發透過 `@sveltejs/adapter-cloudflare` 的 `platformProxy` 讀取 `wrangler.toml` 中的 D1 / R2 binding（讀的是 wrangler 本地模擬資料，見 `.wrangler/state`）。

> 首次執行 D1 相關功能前，先建立並套用 migration：
>
> ```sh
> pnpm db:generate
> pnpm wrangler d1 execute kikigaki --local --file=./migrations/<檔案>.sql
> ```

## 常用指令

```sh
pnpm dev              # 開發伺服器
pnpm build            # 生產建置（輸出 .svelte/cloudflare）
pnpm preview          # 預覽生產建置
pnpm lint             # prettier + eslint
pnpm format           # prettier 寫入
pnpm check            # svelte-check 型別檢查
pnpm test             # vitest（unit + component + storybook）
pnpm storybook        # Storybook 開發
pnpm db:generate      # 產生 drizzle migration
pnpm db:studio        # drizzle studio
pnpm i18n:sync        # 依 config/locales.json 同步編譯語系（CI 自動跑）
pnpm i18n:check       # 只驗證 settings.json 與 config 一致（漂移即 fail）
pnpm i18n:add ko --ai --base-url … --key … --model …   # 新語言入目錄（AI 草稿 125 鍵）
pnpm i18n:add ko --clone en                            # 免 AI：複製現成字典當草稿
pnpm i18n:remove ko                                    # 移出目錄（譯文預設保留）
```

## Cloudflare 設定（一次性）

1. 登入：`pnpm wrangler login`
2. 建立 D1：`pnpm wrangler d1 create kikigaki`，把回傳的 `database_id` 填進 `wrangler.toml`
3. 建立 R2：`pnpm wrangler r2 bucket create blog-assets`
4. 部署時 Cloudflare Pages 會讀取 `wrangler.toml` 的 binding

## 排程發文

文章編輯器的「排程發布時間」（未勾發布時生效）＝未來時間儲存後維持草稿，
到期由所有前台讀取入口（頁面／RSS／sitemap／後台列表）**lazy 自動翻為發布**並觸發搜尋索引等事件；
無到期筆時零寫入、不需任何背景工作。後台列表以 🕒 徽章標示排程中。
Agent 工具 `publish_post` 帶 `publishAt`（ISO）同样入排程。

## 多語系模型（部署時決定，無 runtime 開關）

| 層                               | 位置                                                                            | 改動方式                                                     | 生效         |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------ |
| **目錄**（有哪些語言可用）       | `config/locales-catalog.json` + `messages/*.json`                               | `pnpm i18n:add / i18n:remove`（PR）                          | 入库         |
| **啟用子集**（這次部署載入哪些） | `config/locales.json`（repo 預設）<br>或 GitHub Environment 變數 `I18N_LOCALES` | **GitHub 網頁直接編輯／Settings → Environments → variables** | 下次 CI 部署 |

- 母語（`base: true`，預設 zh-tw）強制啟用：漏了會自動補入並在 CI log 提示
- 字典缺檔／目錄無此語言／重複 → `i18n:check` 於 CI fail-fast，擋在部署前
- 目錄已隨附中文系＋英日＋**ko／es（未啟用草稿）**：在 `config/locales.json` 或 env 變數加上代碼即啟用
- 內容翻譯（文章/系列/分類/標籤）存 DB，與編譯無關；譯文對應的語言未編入時不會出現在前台

## 首次部署（管理員建立）

全新部署的站台 `users` 表為空——開 `/admin` 會自動跳到 **`/admin/setup`** 首跑頁，
建立的第一個帳號即管理員並自動登入；本頁隨即**永久關閉**（無公開註冊）。
之後要加帳號用 `scripts/create-admin.ts`、改密碼用 `scripts/change-password.ts`。

## 評論審核

留言走「規則風險分 → 中風險帶 AI 輔助 → 決策」自動分流：低風險直接公開、
可疑的進後台人工队列。後台「設定 → 評論審核」卡可調五檔強度
（關閉／寬鬆／標準／嚴格／自訂閾值）並維護**站長禁詞表**（一行一個；
命中者永不自動公開）。「關閉」＝全部直接公開，但禁詞名單仍然生效。

## Email 發送（Phase 67）

後台「設定 → Email 發送」選 provider（Resend 免費 3,000 封/月為預設推薦）、貼 API 金鑰
（AES-GCM 加密保存，頁面只顯末四碼）→「驗證設定」→「發送測試信」。
範本在「範本編輯器」以 DSL 組合（`<Email><Hero/><Button/></Email>`，變數限白名單），
存檔即新版本、可啟用／回滾；發送軌跡在 `/admin/email-logs`。
原生 SMTP 不可行（Workers 無 TCP 25/465/587）；自家域名寄件＝在 Resend/SES 驗證域名。
Agent 工具：`save_email_template_version`／`activate_email_template_version`（高風險必審）。

## 數位商品與贊助（Phase 79e）

**僅限數位商品**的 opt-in 店面（電子書、模版、桌布——Gumroad 型態，不是通用電商：
無庫存／物流／稅務／多規格）。內容型別帶上商品契約（price 兩位小數字串＋`goods/`
私有檔案鍵）即自動成為商品；結帳、webhook、憑證下載全自動。金流 provider 完全由
環境變數決定——未設定任何金鑰時整套商店休眠。

```bash
# Provider（全為 plain fetch、零 SDK）。PAYMENT_PROVIDER 逗號清單（"stripe,paypal"）
# 會在結帳時顯示付款方式選擇頁；未設＝所有金鑰齊備的 provider。各家金鑰：
#   stripe:    STRIPE_SECRET, STRIPE_WEBHOOK_SECRET
#   paypal:    PAYPAL_CLIENT_ID, PAYPAL_SECRET（+ PAYPAL_WEBHOOK_ID 啟用 webhook 兜底；
#              PAYPAL_ENV=live 離開沙箱）
#   airwallex: AIRWALLEX_CLIENT_ID, AIRWALLEX_API_KEY, AIRWALLEX_WEBHOOK_SECRET
#              （AIRWALLEX_ENV=prod 才走正式端點）
wrangler secret put STRIPE_SECRET
# 本機示範流（免真金鑰；生產環境絕對不可同時開啟這兩個旗標）：
echo 'PAYMENT_PROVIDER="mock"' >> .dev.vars
echo 'ALLOW_MOCK_PAYMENTS="1"' >> .dev.vars
```

贊助（☕ Buy Me a Coffee 風 tip 訂單）：Admin → 設定勾選放置面（post,support,about），
渲染 SupportZone 卡與 /support 頁。Webhook 指到 `/api/checkout/webhook/<provider>`；
退款事件自動吊銷下載憑證。

## 資料庫備份

`.github/workflows/backup-d1.yml`：每日 16:30 UTC 將 production D1 export 成 SQL dump。
目的地由 repo **Variables** 選擇（需 `CLOUDFLARE_API_TOKEN`／`CLOUDFLARE_ACCOUNT_ID` secrets，與 CI 共用）：

| BACKUP_DEST        | 去處                    | 備註                                                           |
| ------------------ | ----------------------- | -------------------------------------------------------------- |
| `artifact`（預設） | GitHub Actions artifact | 保留 14 天，Actions 頁面下載                                   |
| `r2`               | Cloudflare R2 bucket    | 另設 `R2_BUCKET=<bucket 名>`；token 需 R2 寫權限；自管保留策略 |

手動補備份＝Actions → Run workflow。還原：`wrangler d1 execute kikigaki --remote --file=backup-<stamp>.sql`。

## 排程發文保鮮（Cron）

排程文章靠「讀取時順手翻轉」（lazy publish）即可運作；無流量時段要**準時**發布，
設定 GitHub Actions cron（`.github/workflows/cron-publish.yml`，每 10 分鐘）：

1. 產生一個亂數密鑰，兩邊填同一個值：
   - Cloudflare Pages → 專案 → Settings → Variables → **Secret** `CRON_SECRET`
   - GitHub repo → Settings → Secrets and variables → Actions → **`CRON_SECRET`**
2. Actions → 「Cron — Scheduled Posts」→ Run workflow 手動測一次（回應 `{"ok":true}` 即通）

未設 secret 時端點 fail-closed（403），lazy publish 照常，不影響 correctness。

## OG 分享圖兜底

文章無封面且未設站級 default OG 圖時，分享卡自動用品牌圖 `static/og-default.jpg`
（1200×630 @2x）。換圖＝直接覆蓋該檔（或於設定頁指定 default OG 優先）。

## 建立新主題（theme:create）

```bash
pnpm theme:create my-theme --clone terminal --label "My Theme"   # 結構級換肤（複製元件包）
pnpm theme:create my-look --preloader                            # token-only（版面沿用 abstract）
```

腳手架自動完成四處註冊（`theme-scaffold:*` 標記注入）：THEME_IDS、themes manifest
（label/description/swatches/behavior）、registry pack 表、themes.css 令牌區塊（從來源複製）。
之後只改兩處：`src/lib/themes/packs/<id>/*.svelte`（版面）＋themes.css 的 `[data-ui-theme]`
色盤 → 後台「外觀主題」即刻可切換預覽（清單是 manifest 驅動，零額外接線）。

### DB 主題（免 Git 換肤）

不想碰 Git？**後台 → 主題工作台**（`/admin/themes`）直接建主題：選基底主題、貼設計
令牌 CSS、逐槽位（Header/Footer/Home/Blog/Post…11 個）貼 Svelte 碼——儲存前全槽試編
閘把關，採用後即時生效，AI Agent 也能產主題（高風險審批後才落地）。

誠實邊界：DB 主題的槽位元件在瀏覽器端編譯掛載（Workshop 同管線），**SSR 與編譯完成前
回落基底主題的版面**；令牌（色彩/字型）全站即時生效。要「SSR 級完整版面」請用上面的
`theme:create`（編譯期打包）。

主題可**流通**：工作台「匯出」產 `.zip`（`kikigaki-theme/1` 格式：manifest＋tokens＋
槽位元件碼），「匯入」載入他人主題（路徑/體積/安全三重閘，匯入後不自動啟用）。

## Self-host（Docker／Node 自託管）— Phase 77

與 Cloudflare 版**同 repo 雙 adapter**（`ADAPTER=node`）：SQLite（better-sqlite3 的 D1 shim）＋
本地媒體檔（R2 shim），`platform.env` 由 `node-shim/` 在啟動時注入——後台、文章、評論、
Email、Agent 全功能，無 Cloudflare 帳號也能跑。

```bash
docker compose up -d --build      # 首次自動跑完 35 條遷移
open http://localhost:3000/admin  # 首跑頁：建立第一個管理員帳號（即站長）
```

- 生產反向代理（https）：把 compose 的 `ORIGIN` 改成你的網域（或設 `PROTOCOL_HEADER`/`HOST_HEADER`）
- `AI_SECRET` 必改（憑證加密主鑰）；`TURNSTILE_SECRET` 留空＝評論跳過 Turnstile
- Agent 在 self-host 自動全速（每 advance 10 步、單請求 12 tool；Cloudflare 版為適配免費方案 CPU 而分段泵動——架構相同，非能力上限）。前方有反代且 timeout 60s 時設 `SELF_HOST_STEPS=5` 之類的值調低單請求步數
- 開發注意：`ADAPTER=node pnpm build` 會污染 `.svelte-kit`，回到 CF 開發前 `rm -rf .svelte-kit` 重啟 dev
- 免 Docker：`ADAPTER=node pnpm build && node node-shim/migrate.mjs && node server.mjs`

## 部署（GitHub Actions）


流水線（`.github/workflows/ci.yml`）：

1. `quality`：i18n:check → lint → type-check → 全部測試（閘門）
2. `deploy-preview`：PR 自動部署到 `pr-<編號>` branch，別名網址回填 PR comment
3. `deploy-production`：push `main` 觸發，經 **production environment 審批**後：build → D1 migrations（remote）→ Pages 部署 → 煙霧測試（robots/rss/blog 200）

**一次性設定（GitHub 網頁）**：

1. Settings → Secrets and variables → Actions → Repository secrets：`CLOUDFLARE_API_TOKEN`（Pages Edit + D1 Read/Write scope）、`CLOUDFLARE_ACCOUNT_ID`
2. Environments → New：`production`（Environment secrets 放上述兩項；**Required reviewers** 加你自己＝上線審批閘；可加 env 變數 `I18N_LOCALES`）與 `preview`（同樣放 secrets；`I18N_LOCALES` 留空＝用 repo 設定）
3. 之後改語系＝Settings → Environments → production → Variables → 編輯 `I18N_LOCALES` → Actions 頁 Run workflow（或推任何 commit）

手動部署仍是 fallback：`pnpm build && pnpm exec wrangler pages deploy .svelte/cloudflare --project-name kikigaki`。

全新 fork 一條龍（建資源＋遷移＋secrets＋示範文＋部署）：`npx wrangler login && pnpm cf:setup --name your-blog`。

示範內容另有三條指令（全為虛構資料、冪等，`--remote` 打遠端）：`pnpm seed:demo` 種精選假文章組（welcome、元件示範、六篇系列「田間筆記」作目錄演示、填充文讓 `/blog` 分頁可见）；`pnpm seed:wipe` 清掉測試殘留；`pnpm seed:theme corporate|news|magazine` 寫入對應主題的 `theme_content` 預設值並啟用該主題。

## 文件

主要文件見 [README.md](./README.md)（English）。
