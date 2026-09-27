#!/usr/bin/env node
/**
 * Demo content seeder (68R3 → seed-system upgrade).
 *
 *   node scripts/seed-demo.mjs [--local|--remote] [--posts] [--wipe] [--theme <corporate|news|magazine>]
 *
 *   --posts   curated fictional demo set: welcome post, component showcase,
 *             a 6-part series (series/TOC demo) and filler articles so that
 *             /blog pagination (>12 posts) is visible. Idempotent per slug.
 *   --wipe    remove leftover e2e/test fixtures (slugs e2e*, seed-p55-*, seed-blog-*).
 *   --theme T write scripts/seed-data/theme-content.T.json into site_settings
 *             (theme_content) and activate it (ui_theme = T).
 *   --support   79e-3: enable the support (buy-me-a-coffee) card on all
 *             three surfaces (post footer, /support page, about footer).
 *   --commerce 79e demo: products type (registry) + 3 sample items + one
 *             placeholder R2 file per item (goods/ prefix) + ui_theme=shop.
 *
 * Default action when no mode flag is given: --posts.
 * All content is fictional and contains zero personal data (public-ready).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const remote = process.argv.includes('--remote');
const project = 'kikigaki';
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const argVal = (name) => {
	const i = argv.indexOf(name);
	return i >= 0 ? (argv[i + 1] ?? '') : '';
};
const doPosts = flag('--posts') || (!flag('--wipe') && !flag('--theme'));
const doWipe = flag('--wipe');
const themeName = flag('--theme') ? argVal('--theme') : '';
const doCommerce = flag('--commerce');
const doSupport = flag('--support');

/** SQLite string literal escaping (JSON payloads are already double-quoted). */
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

function sql(stmt) {
	const args = ['d1', 'execute', project, '--command', stmt, '--yes'];
	args.push(remote ? '--remote' : '--local');
	execFileSync('npx', ['wrangler', ...args], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'pipe']
	});
}
function query(stmt) {
	const raw = execFileSync(
		'npx',
		[
			'wrangler',
			'd1',
			'execute',
			project,
			'--command',
			stmt,
			'--json',
			remote ? '--remote' : '--local',
			'--yes'
		],
		{
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024
		}
	);
	return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).results;
}

const uuid = () => crypto.randomUUID();
const DAY = 86_400_000;
const t0 = Date.now();

/* ------------------------------------------------------------------ wipe */

if (doWipe) {
	const rows = query(
		`SELECT id, slug FROM posts WHERE slug LIKE 'e2e%' OR slug LIKE 'seed-p55-%' OR slug LIKE 'seed-blog-%'`
	);
	if (rows.length === 0) {
		console.log('✓ wipe：沒有 e2e 殘留可清');
	} else {
		const ids = rows.map((r) => `'${r.id}'`).join(',');
		// FTS lives on post_translations triggers; children first, then posts.
		sql(`DELETE FROM post_translations WHERE post_id IN (${ids})`);
		sql(`DELETE FROM post_tags WHERE post_id IN (${ids})`);
		sql(`DELETE FROM post_seo WHERE post_id IN (${ids})`);
		sql(`DELETE FROM series_posts WHERE post_id IN (${ids})`);
		sql(`DELETE FROM post_versions WHERE post_id IN (${ids})`);
		sql(`DELETE FROM posts WHERE id IN (${ids})`);
		// The old demo series is junk once its posts are gone.
		sql(
			`DELETE FROM series_posts WHERE series_id IN (SELECT id FROM series WHERE slug='p55-demo')`
		);
		sql(
			`DELETE FROM series_translations WHERE series_id IN (SELECT id FROM series WHERE slug='p55-demo')`
		);
		sql(`DELETE FROM series WHERE slug='p55-demo'`);
		console.log(`✓ wipe：移除 ${rows.length} 篇測試殘留`);
	}
}

/* ----------------------------------------------------------------- posts */

const CATEGORIES = [
	{ slug: 'engineering', name: 'Engineering', zh: '工程' },
	{ slug: 'product', name: 'Product', zh: '產品' },
	{ slug: 'field-notes', name: 'Field Notes', zh: '田間筆記' }
];
const TAGS = [
	{ slug: 'sveltekit', name: 'SvelteKit', zh: 'SvelteKit' },
	{ slug: 'cloudflare', name: 'Cloudflare', zh: 'Cloudflare' },
	{ slug: 'writing', name: 'Writing', zh: '寫作' },
	{ slug: 'ai', name: 'AI', zh: 'AI' }
];

const SERIES = {
	slug: 'kikigaki-field-notes',
	title: 'Kikigaki Field Notes',
	zhTitle: 'Kikigaki 田間筆記',
	summary: 'A build log of this blog engine: decisions, dead ends and small wins.',
	zhSummary: '這個部落格引擎的建造日誌：取捨、死路與小勝利。'
};

/** type = category slug; daysAgo feeds published_at so archive/pagination look real. */
const POSTS = [
	{
		slug: 'component-showcase',
		type: 'engineering',
		daysAgo: 12,
		title: 'A Component Showcase',
		zhTitle: '元件示範：Markdown 能渲染什麼',
		summary:
			'Every block the renderer supports, in one page: code, tables, quotes, images, task lists.',
		zhSummary: '渲染器支援的全部區塊，濃縮成一頁：程式碼、表格、引用、圖片、待辦清單。',
		tags: ['sveltekit', 'writing'],
		body: `This page exists so you can see what the Markdown pipeline renders — and then delete it.\n\n## Code\n\n\`\`\`ts\nexport const greet = (name: string): string => \`Hello, \${name}!\`;\n\`\`\`\n\n## Table\n\n| Block | Supported | Notes |\n| --- | --- | --- |\n| Headings | yes | h1–h6 with anchor links |\n| Code fences | yes | syntax highlighted |\n| Tables | yes | aligned with pipe tables |\n| Task lists | yes | \`- [x]\` renders checkboxes |\n\n## Quote\n\n> A blog is a interface between a person and their future self.\n\n## Task list\n\n- [x] seed the demo set\n- [ ] delete it once real posts arrive\n`
	},
	{
		slug: 'deploying-on-the-edge',
		type: 'engineering',
		daysAgo: 21,
		title: 'Deploying on the Edge Without a Pipeline',
		zhTitle: '沒有 CI 管線的邊緣部署',
		summary: 'Pages deploys a Worker in seconds. Do you still need a build server? Usually not.',
		zhSummary: 'Pages 幾秒就能部署一支 Worker。你还需要构建服务器吗？通常不需要。',
		tags: ['cloudflare', 'sveltekit'],
		body: `The whole "CI/CD muscle memory" chapter is shorter on Workers: \`wrangler pages deploy\` is the pipeline.\n\nWhat a hosted pipeline still buys you: **gates** (tests, preview deploys, approvals). Speed it does not.\n\nA boring deploy is a feature. Keep the build local, keep the deploy one command, keep the rollback one click.\n\n> Deploy frequency is a habit, not a tool. The cheaper each deploy feels, the smaller your diffs get, the less each one can break.`
	},
	{
		slug: 'd1-and-the-cost-of-counting',
		type: 'engineering',
		daysAgo: 17,
		title: 'D1 and the Cost of Counting',
		zhTitle: 'D1 與計數的代價',
		summary:
			'COUNT(*) on a small database is a shrug. On a big one, it is a budget line. Measure the gap.',
		zhSummary: '小資料庫上的 COUNT(*) 是聳肩，大的是一行預算。把差距量出來。',
		tags: ['cloudflare'],
		body: `Every list page wants a total: "26 posts". On D1 that count is a real read of index pages — usually fine, occasionally the thing that wakes you up.\n\nThree cheap fixes, in order of boringness:\n\n1. cache the total for 60 seconds (most readers never notice);\n2. approximate it (SQLite knows the row count of a full-table scan);\n3. stop showing it on every page.\n\nThe right answer is almost always "cache it", and the honest answer is "your dataset is 0.02% of the scale where this matters".\n\n> Optimize for the 2 a.m. page you will not open.`
	},
	{
		slug: 'writing-with-agents',
		type: 'product',
		daysAgo: 14,
		title: 'Writing With Agents, Not For Them',
		zhTitle: '與代理共寫，而非為代理而寫',
		summary:
			'A CMS that lets an agent reskin it should still make every write ask for a human. Ours does.',
		zhSummary: '一個允許代理換膚的 CMS，仍該讓每次寫入經過人類批准。我們的站就是如此。',
		tags: ['ai', 'writing'],
		body: `The tempting failure mode of an agent-built CMS: "let the model do it all!" No. The model drafts; the human approves.\n\nThree rules this site follows:\n\n- **reads are free, writes are gated** — anything that mutates the site appears as an approval card first;\n- **the diff is the review** — proposals show exact before/after, not vibes;\n- **no silent deletes** — the destructive verbs need a second yes.\n\nAgents make the boring parts of site maintenance (renames, sweeps, re-theming) cheap. The editorial judgement stays yours.`
	},
	{
		slug: 'theme-tokens-that-scale',
		type: 'engineering',
		daysAgo: 10,
		title: 'Theme Tokens That Scale (Down to One File)',
		zhTitle: '能擴展的主題令牌（也能縮成一個檔）',
		summary:
			'A token block is a contract. Every theme speaks it, so a theme can be a list of strings.',
		zhSummary: '令牌區塊是一份契約。每套主題都說這種語言，所以主題可以只是一串字串。',
		tags: ['sveltekit'],
		body: `Reskinning fails when "theme" means "rewrite the components". It works when a theme is data: colors, radii, fonts, and a slot map.\n\nThe token block is the contract:\n\n\`\`\`css\n:root { --color-ink: #111; --color-accent: #e0471b; }\n\`\`\`\n\nA DB theme is then just that block plus per-slot component overrides. The fallback chain (override → pack → abstract) means you can ship a theme as **eleven strings** or zero.`
	},
	{
		slug: 'newsletters-without-vendor-lock',
		type: 'product',
		daysAgo: 7,
		title: 'Newsletters Without Vendor Lock',
		zhTitle: '不被廠商綁架的電子報',
		summary:
			'Double opt-in, one provider call, templates in the database. Swapping providers should be an afternoon.',
		zhSummary: '雙重註冊、一次供應商呼叫、模板存資料庫。換廠商應該只花一個下午。',
		tags: ['writing'],
		body: `A newsletter is three tables and an HTTP call. The lock-in people sell you is the workflow you can replicate in a weekend: subscribe tokens, confirm links, unsubscribe headers, a template you edit, not a console you learn.\n\nThe provider is a transport. Keep the list, the templates and the sends inside your own database and the worst day of a migration becomes "point the env var somewhere else".`
	},
	{
		slug: 'search-that-fits-in-sqlite',
		type: 'engineering',
		daysAgo: 4,
		title: 'Search That Fits Inside SQLite',
		zhTitle: '裝得進 SQLite 的搜尋',
		summary:
			'FTS5 gives a personal blog more relevance than most vector demos. No embeddings required.',
		zhSummary: 'FTS5 給個人部落格相關性比多數向量展示更好。不需要嵌入。',
		tags: ['cloudflare'],
		body: `Every personal-site search eventually asks: do you need a vector database for words that are literally in the documents?\n\nFTS5 answers the boring way and wins: tokenization, BM25 ranking, prefix queries, triggers that keep the index honest on write. It ships inside the same D1 file that stores the posts.\n\nEmbeddings are for "find things like this". Search is "find this". For 99% of blogs, the second sentence is the whole job.`
	},
	{
		slug: 'on-deleting-features',
		type: 'product',
		daysAgo: 2,
		title: 'On Deleting Features',
		zhTitle: '論刪除功能',
		summary:
			'The maintenance bill for a feature is forever. The applause for deleting it lasts a week.',
		zhSummary: '一項功能的維護帳單是永遠，刪除它掌聲只有一週。',
		tags: ['writing'],
		body: `Features are not free at launch; they are most expensive the year after. Every checkbox in the roadmap is a recurring payment: tests, docs, edge cases, "how do I use this" emails.\n\nA small rule that keeps a side project small: every month, pick the least-touched feature and give it one week to earn a better reason to exist than "it already exists".\n\nThe blog ships with a delete-this-post demo for a reason.`
	},
	...[1, 2, 3, 4, 5, 6].map((n) => ({
		slug: `field-notes-0${n}`,
		type: 'field-notes',
		daysAgo: 26 - n * 3,
		series: SERIES.slug,
		position: n,
		title: `Field Notes #${n}: ${
			[
				'The First Commit Was a Router',
				'Deleting the Admin I Loved',
				'Comments, Then Consequence',
				'Two Databases, One Truth',
				'The Slowest Feature: Waiting',
				'Ship the Doorframe First'
			][n - 1]
		}`,
		zhTitle: `田間筆記 #${n}：${
			[
				'第一個 commit 是個路由',
				'刪掉我愛的後台',
				'評論功能，然後是後果',
				'兩個資料庫，一個真相',
				'最慢的功能：等待',
				'先把門框裝好'
			][n - 1]
		}`,
		summary: [
			'Starting a blog engine with one route and zero opinions about the framework.',
			'The best code removed was the admin dashboard I had spent weeks polishing.',
			'Comment moderation is a time machine: it makes you answer later-you.',
			'Migrations for local dev and remote D1 drifted — so we stopped trusting diff tools.',
			'Some features are queues, queues are promises, promises are slow on purpose.',
			'A feature flag is a doorframe: decide the wall later, but measure the doorway now.'
		][n - 1],
		zhSummary: [
			'從一個路由出發，對框架零立場。',
			'最好的一段代碼，是我花幾週打磨又親手刪掉的後台儀表板。',
			'評論審核是個時間機器：它讓你回答未來的自己。',
			'本地與遠端 D1 的遷移漂移了——於是我們不再信任 diff 工具。',
			'有些功能是佇列，佇列是承諾，承諾故意要慢。',
			'功能旗標是個門框：牆之後再決定，門洞現在就要量準。'
		][n - 1],
		tags: ['writing'],
		body: `Part ${n} of a short build-log series about making this site.\n\n${
			[
				'The repository began as a router and a grudge against headless CMS dashboards. Everything since is an argument about that first commit.',
				'The dashboard had sparklines, drag-and-drop, a command palette. Then nobody (nobody) used it except me, to check that it still worked. Deleting it felt like arson and therapy at once.',
				'Launch comments and you inherit a mailbox at 2 a.m. The fix was boring: hold new comments, batch-review weekly, let the author see the queue.',
				'Drizzle generated SQL for both databases — and quietly different SQL. The journal file is the contract now; the generated files are receipts.',
				'A deploy that waits for approval is slower than a deploy that runs. That is the point. Slowness is a product surface too.',
				'Ship the boundary of a feature before the feature. The doorframe tells you where the wall will go — and doors change; frames rarely do.'
			][n - 1]
		}\n\n*(Placeholder prose — replace with your own field notes, or delete the series.)*`
	}))
];

if (doPosts) {
	let inserted = 0;
	let skipped = 0;

	// welcome post keeps the original hand-written copy
	{
		const exists = query(`SELECT id FROM posts WHERE slug='welcome'`).length > 0;
		if (exists) skipped++;
		else {
			const pid = 'post:welcome';
			sql(
				`INSERT INTO posts (id,slug,type,published,published_at,views,created_at,updated_at) VALUES ('${pid}','welcome','field-notes',1,${t0 - 28 * DAY},0,${t0 - 28 * DAY},${t0 - 28 * DAY})`
			);
			sql(
				`INSERT INTO post_translations (id,post_id,locale,title,summary,body,created_at,updated_at) VALUES ('${uuid()}','${pid}','zh-tw','歡迎使用 Kikigaki','你的站已上線：寫作、AI 代理、換肤、電子報——這篇示範文可隨時刪除。',${q('# 歡迎使用 Kikigaki 👋\n\n這是一篇**示範文章**——你的站已經上線了。刪掉它，開始寫自己的內容吧。\n\n- **寫作**：後台 /admin → 文章。Markdown＋即時預覽。\n- **AI 代理**：右下角 ✦ 面板，寫入一律先經批准。\n- **換肤**：設定 → 設計主題；主題工作台 → DB 主題免 Git 換肤。')},${t0 - 28 * DAY},${t0 - 28 * DAY})`
			);
			sql(
				`INSERT INTO post_translations (id,post_id,locale,title,summary,body,created_at,updated_at) VALUES ('${uuid()}','${pid}','en','Welcome to Kikigaki','Your site is live: writing, AI agent, reskin, newsletter. Delete this demo post anytime.',${q('# Welcome to Kikigaki 👋\n\nThis is a **demo post** — your site is live. Delete it and start writing.\n\n- **Write**: /admin → Posts. Markdown with live preview.\n- **AI agent**: the ✦ panel. Every write action asks for approval first.\n- **Reskin**: Settings → Themes; Theme workbench → DB themes, no Git.')},${t0 - 28 * DAY},${t0 - 28 * DAY})`
			);
			inserted++;
		}
	}

	// categories
	for (const c of CATEGORIES) {
		const cid = uuid();
		sql(
			`INSERT OR IGNORE INTO categories (id,slug,name,sort,created_at,updated_at) VALUES ('${cid}',${q(c.slug)},${q(c.name)},${CATEGORIES.indexOf(c)},${t0},${t0})`
		);
		sql(
			`INSERT OR IGNORE INTO category_translations (id,category_id,locale,name,created_at,updated_at) SELECT '${uuid()}',id,'zh-tw',${q(c.zh)},${t0},${t0} FROM categories WHERE slug=${q(c.slug)}`
		);
	}
	// tags
	for (const tg of TAGS) {
		const tid = uuid();
		sql(`INSERT OR IGNORE INTO tags (id,slug,name) VALUES ('${tid}',${q(tg.slug)},${q(tg.name)})`);
		sql(
			`INSERT OR IGNORE INTO tag_translations (id,tag_id,locale,name) SELECT '${uuid()}',id,'zh-tw',${q(tg.zh)} FROM tags WHERE slug=${q(tg.slug)}`
		);
	}

	// series (the TOC/book demo)
	{
		const sid = uuid();
		sql(
			`INSERT OR IGNORE INTO series (id,slug,published,created_at,updated_at) VALUES ('${sid}',${q(SERIES.slug)},1,${t0 - 26 * DAY},${t0})`
		);
		const realSid = query(`SELECT id FROM series WHERE slug=${q(SERIES.slug)}`)[0]?.id;
		sql(
			`INSERT OR IGNORE INTO series_translations (id,series_id,locale,title,summary,created_at,updated_at) SELECT '${uuid()}',${q(realSid)},'zh-tw',${q(SERIES.zhTitle)},${q(SERIES.zhSummary)},${t0},${t0} WHERE NOT EXISTS (SELECT 1 FROM series_translations WHERE series_id=${q(realSid)} AND locale='zh-tw')`
		);
		sql(
			`INSERT OR IGNORE INTO series_translations (id,series_id,locale,title,summary,created_at,updated_at) SELECT '${uuid()}',${q(realSid)},'en',${q(SERIES.title)},${q(SERIES.summary)},${t0},${t0} WHERE NOT EXISTS (SELECT 1 FROM series_translations WHERE series_id=${q(realSid)} AND locale='en')`
		);
	}

	for (const p of POSTS) {
		if (query(`SELECT id FROM posts WHERE slug=${q(p.slug)}`).length > 0) {
			skipped++;
			continue;
		}
		const pid = `post:${p.slug}`; // Convention id='post:'+slug (search is keyed by slug; both must be derivable)
		const ts = t0 - p.daysAgo * DAY;
		sql(
			`INSERT INTO posts (id,slug,type,published,published_at,views,created_at,updated_at) VALUES ('${pid}',${q(p.slug)},${q(p.type)},1,${ts},${Math.floor(Math.random() * 400)},${ts},${ts})`
		);
		sql(
			`INSERT INTO post_translations (id,post_id,locale,title,summary,body,created_at,updated_at) VALUES ('${uuid()}','${pid}','zh-tw',${q(p.zhTitle)},${q(p.zhSummary)},${q(p.body)},${ts},${ts})`
		);
		sql(
			`INSERT INTO post_translations (id,post_id,locale,title,summary,body,created_at,updated_at) VALUES ('${uuid()}','${pid}','en',${q(p.title)},${q(p.summary)},${q(p.body)},${ts},${ts})`
		);
		for (const tag of p.tags ?? []) {
			sql(
				`INSERT OR IGNORE INTO post_tags (post_id,tag_id) SELECT '${pid}',id FROM tags WHERE slug=${q(tag)}`
			);
		}
		if (p.series) {
			sql(
				`INSERT OR IGNORE INTO series_posts (series_id,post_id,position,is_primary,created_at) SELECT id,'${pid}',${p.position},0,${ts} FROM series WHERE slug=${q(p.series)}`
			);
		}
		inserted++;
	}
	console.log(
		`✓ posts：新增 ${inserted} 篇、略過已存在 ${skipped} 篇（${remote ? 'remote' : 'local'}）`
	);
}

/* ---------------------------------------------------------------- support */

if (doSupport) {
	sql(
		`INSERT OR REPLACE INTO site_settings (key,value,updated_at) VALUES ('support_surfaces','post,support,about',${t0})`
	);
	// P83a: SupportZone now renders via slot assignments; seed the defaults too.
	sql(
		`INSERT OR REPLACE INTO site_settings (key,value,updated_at) VALUES ('slot_assignments',${q(
			JSON.stringify({ 'post.after': ['support-zone'], 'about.after': ['support-zone'] })
		)},${t0})`
	);
	console.log(
		`\u2713 \u8d0a\u52a9\u5361\u5df2\u958b\uff1apost/support/about \u4e09\u9762\uff08${remote ? 'remote' : 'local'}\uff09`
	);
}

/* --------------------------------------------------------------- commerce */

if (doCommerce) {
	const FIELDS = JSON.stringify([
		{ key: 'title', kind: 'text', required: true, max: 80 },
		{ key: 'summary', kind: 'text', max: 300 },
		{ key: 'price', kind: 'text', required: true, max: 12 },
		{ key: 'body', kind: 'markdown' },
		{ key: 'cover', kind: 'media' },
		{ key: 'file', kind: 'media', required: true }
	]);
	sql(
		`INSERT OR IGNORE INTO content_types (key,label,fields,title_field,enabled,created_at,updated_at) VALUES ('products','\u7522\u54c1',${q(FIELDS)},'title',1,${t0},${t0})`
	);
	const products = [
		{
			slug: 'kikigaki-ebook',
			title: 'Kikigaki \u96fb\u5b50\u66f8\u6307\u5357',
			price: '12.00',
			summary:
				'\u5f9e\u96f6\u5230\u4e0a\u7dda\u7684\u5b8c\u6574\u7b46\u8a18\uff08\u793a\u7bc4\u6a94\uff09\u3002',
			body: '# \u96fb\u5b50\u66f8\n\n\u793a\u7bc4\u4ea4\u4ed8\u5167\u5bb9\u3002'
		},
		{
			slug: 'template-pack',
			title: 'Notion \u6a21\u7248\u5305',
			price: '9.00',
			summary:
				'\u5341\u500b\u53ef\u76f4\u63a5\u8907\u7528\u7684\u6a21\u7248\uff08\u793a\u7bc4\uff09\u3002',
			body: '# \u6a21\u7248\n\nDemo.'
		},
		{
			slug: 'wallpaper-set',
			title: '\u684c\u5e03\u7d44\u5408 Vol.1',
			price: '5.00',
			summary: '10 \u5f35 5K \u684c\u5e03\uff08\u793a\u7bc4\u70ba\u6587\u5b57\u6a94\uff09\u3002',
			body: '# \u684c\u5e03\n\nDemo.'
		}
	];
	const fs = await import('node:fs');
	for (const prd of products) {
		const fileKey = `goods/${prd.slug}.txt`;
		fs.writeFileSync('/tmp/kk-goods-sample.txt', `${prd.title}\n${prd.body}\n`);
		try {
			if (remote)
				execFileSync(
					'npx',
					[
						'wrangler',
						'r2',
						'object',
						'put',
						'blog-assets',
						fileKey,
						'--file',
						'/tmp/kk-goods-sample.txt',
						'--remote'
					],
					{ stdio: 'ignore' }
				);
		} catch {
			/* \u4ecb\u65bc\u6a94\u5931\u6557\u4e0d\u963b\u8cc7\u6599\u7a2e\u5165 */
		}
		sql(
			`INSERT OR IGNORE INTO content_items (id,type_key,slug,data,published,sort_order,created_at,updated_at) VALUES (${q('ci-' + prd.slug)},'products',${q(prd.slug)},${q(JSON.stringify({ title: prd.title, summary: prd.summary, price: prd.price, body: prd.body, file: fileKey }))},1,0,${t0},${t0})`
		);
	}
	sql(
		`INSERT OR REPLACE INTO site_settings (key,value,updated_at) VALUES ('ui_theme','shop',${t0})`
	);
	console.log(
		`\u2713 commerce \u6f14\u793a\u5c31\u7dd2\uff1a/products \uff0b ui_theme=shop\uff08${remote ? 'remote' : 'local'}\uff09`
	);
}

/* ----------------------------------------------------------------- theme */

if (flag('--theme')) {
	const here = dirname(fileURLToPath(import.meta.url));
	const file = join(here, 'seed-data', `theme-content.${themeName}.json`);
	let raw;
	try {
		raw = readFileSync(file, 'utf8');
	} catch {
		console.error(`✗ 找不到 preset：${file}\n  可用：corporate | news | magazine`);
		process.exit(1);
	}
	const parsed = JSON.parse(raw);
	if (JSON.stringify(parsed).length > 32 * 1024) {
		console.error('✗ preset 超過 32KB 寫入閘');
		process.exit(1);
	}
	sql(
		`INSERT OR REPLACE INTO site_settings (key,value,updated_at) VALUES ('theme_content',${q(JSON.stringify(parsed))},${Date.now()})`
	);
	sql(
		`INSERT OR REPLACE INTO site_settings (key,value,updated_at) VALUES ('ui_theme',${q(themeName)},${Date.now()})`
	);
	console.log(
		`✓ theme：ui_theme=${themeName} ＋ theme_content preset（${remote ? 'remote' : 'local'}）`
	);
}
