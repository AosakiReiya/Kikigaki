/**
 * Agent Tools Registry (since Phase 23) — controlled tool layer + five-tier risk declarations.
 *
 *   risk: read | low | medium | high | critical
 *   approval policy decided by runtime/policy.ts from "mode × risk"; tools only declare risk.
 *   execution: 'server' (default, in-Worker via the service layer) | 'client' (browser-executed, Phase 25)
 *   special: side-effect-free meta tools (update_plan) — auto-run even in plan mode.
 *
 * All reads/writes go through the existing Drizzle service layer — the tool layer never writes raw SQL on high-risk paths.
 */
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { and, desc, eq, gte, inArray, like, ne, or, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import {
	categories,
	categoryTranslations,
	comments,
	series,
	seriesPosts,
	seriesTranslations,
	customComponents,
	pageViews,
	postTags,
	postTranslations,
	posts,
	postSeo,
	tagTranslations,
	tags
} from '$lib/server/db/schema';
import { locales, type Locale } from '$lib/paraglide/runtime';
import { SERIES_SLUG_RE, normalizePositions } from '$lib/series-order';
import { BASE_LOCALE } from '$lib/server/content';
import { listPagesAdmin, getPageAdmin, upsertPage, validatePageSlug } from '$lib/server/pages';
import { getSettings, updateSettings } from '$lib/server/settings';
import { isDbThemeId, THEME_IDS } from '$lib/themes';
import {
	deleteTheme,
	getTheme,
	listThemes,
	makeThemeId,
	saveTheme,
	validateSurfaces
} from '$lib/server/themes';
import { listRegistry, installArtifact, uninstall, getRegistryItem } from '$lib/server/registry';
import { installExtension, reapplyVersion } from '$lib/server/extensions/install';
import { invalidatePluginGate } from '$lib/plugins/server';
import { buildContentTree } from '$lib/markdown';
import { serveableSlugs } from '$lib/server/registry';
import { walkTree } from '$lib/content/tree';
import { emit } from '$lib/plugins';
import {
	ensureDefaultTemplates,
	listTemplates,
	getTemplate,
	saveTemplate,
	activateVersion,
	sendTemplatedEmail,
	type TemplateType
} from '$lib/server/email-templates';
import { EMAIL_VAR_WHITELIST, type EmailVars } from '$lib/email/compile';
import {
	countSubscribers,
	listSubscribers,
	sendNewsletter,
	type SubscriberStatus
} from '$lib/server/subscribers';
import { upsertPostSeo } from '$lib/server/seo';
import { deleteType, getType, listTypes, parseFields, upsertType } from '$lib/server/content-items';
import { toolAccess } from './runtime/policy';
import { upsertPlan } from './runtime/store';
import type { AgentMode, Risk } from './runtime/types';
import type { PlanStepStatus } from './runtime/types';

export type { Risk, AgentMode };

export type { AgentPermission } from './types';
import type { AgentPermission } from './types';

export interface ToolParamSpec {
	type: 'string' | 'integer' | 'boolean' | 'array';
	description: string;
	enum?: string[];
	optional?: boolean;
}

/** tool execution context (injected by the runtime for server execution; same-named client fields never trusted) */
export interface ToolCtx {
	db: D1Database;
	runId: string;
	sessionId: string;
	userId?: string;
	/** R2 media bucket (for media tools; same binding as the whole Worker, ambient-injected by the engine) */
	bucket?: R2Bucket;
	/** credential-encryption master key mirror (for email tools; ambient-injected by the engine) */
	masterKey?: string;
}

export interface ToolRunResult {
	ok: boolean;
	[key: string]: unknown;
}

export interface ToolDef {
	name: string;
	description: string;
	/** legacy three tiers (Phase 19 loop compat; derived from risk) */
	permission: AgentPermission;
	/** five risk tiers (the sole basis of runtime approval policy) */
	risk: Risk;
	params: Record<string, ToolParamSpec>;
	/** human-readable summary (shown on confirmation cards) */
	summary: (args: Record<string, unknown>) => string;
	/** server = executes in the Worker; client = browser-executed (results fed back via the resolve API) */
	execution?: 'server' | 'client';
	/** side-effect-free meta tool (runs directly even in plan mode) */
	special?: boolean;
	/** MCP dynamic tools: skip local validateArgs (schema self-certified by the server) */
	mcp?: boolean;
	/** native JSON Schema (MCP tools pass through; takes precedence over params conversion) */
	rawSchema?: Record<string, unknown>;
	run: (ctx: ToolCtx, args: Record<string, unknown>) => Promise<ToolRunResult>;
}

export const ALL_PERMISSIONS: AgentPermission[] = ['read', 'write', 'publish'];

/* helpers ------------------------------------------------------------- */

const isLocale = (v: unknown): v is Locale =>
	typeof v === 'string' && (locales as readonly string[]).includes(v);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** write-side normalization (Phase 44): bodies always stored with LF — keeps CRLF from poisoning ::: scanning */
const bodyText = (v: unknown): string => str(v).replace(/\r\n?/g, '\n');

/** arg validation: returns an array of error descriptions (empty = pass) */
export function validateArgs(def: ToolDef, args: Record<string, unknown>): string[] {
	const errors: string[] = [];
	for (const [key, spec] of Object.entries(def.params)) {
		const v = args[key];
		if (v === undefined || v === null || v === '') {
			if (!spec.optional) errors.push(`缺少參數 ${key}（${spec.description}）`);
			continue;
		}
		if (spec.type === 'string' && typeof v !== 'string') errors.push(`${key} 需為字串`);
		if (spec.type === 'integer' && typeof v !== 'number') errors.push(`${key} 需為整數`);
		if (spec.type === 'boolean' && typeof v !== 'boolean') errors.push(`${key} 需為布林`);
		if (spec.type === 'array' && !Array.isArray(v)) errors.push(`${key} 需為陣列`);
		if (spec.enum && typeof v === 'string' && !spec.enum.includes(v)) {
			errors.push(`${key} 需為其中之一：${spec.enum.join(' / ')}`);
		}
	}
	return errors;
}

/** tools definition for OpenAI function-calling */
function paramsSchema(d: ToolDef): Record<string, unknown> {
	if (d.rawSchema) {
		const r = { type: 'object', ...(d.rawSchema as Record<string, unknown>) } as Record<
			string,
			unknown
		>;
		if (!r.properties) r.properties = {};
		if (!r.required) r.required = [];
		return r;
	}
	return {
		type: 'object',
		properties: Object.fromEntries(
			Object.entries(d.params).map(([k, s]) => [
				k,
				s.type === 'array'
					? { type: 'array', items: { type: 'object' }, description: s.description }
					: { type: s.type, description: s.description }
			])
		),
		required: Object.entries(d.params)
			.filter(([, s]) => !s.optional)
			.map(([k]) => k)
	};
}

export function openAiToolSpecs(defs: ToolDef[]): Record<string, unknown>[] {
	return defs.map((d) => ({
		type: 'function',
		function: {
			name: d.name,
			description: d.description,
			parameters: paramsSchema(d)
		}
	}));
}

/** Anthropic tool definitions */
export function anthropicToolSpecs(defs: ToolDef[]): Record<string, unknown>[] {
	return defs.map((d) => ({
		name: d.name,
		description: d.description,
		input_schema: paramsSchema(d)
	}));
}

export function filterByPermissions(perms: AgentPermission[]): ToolDef[] {
	return TOOLS.filter((t) => perms.includes(t.permission));
}

export function toolByName(name: string): ToolDef | undefined {
	return TOOLS.find((t) => t.name === name);
}

/** mode × risk: the tool set listed to the model */
export function visibleTools(mode: AgentMode): ToolDef[] {
	return TOOLS.filter(
		(t) => !(t.special && mode === 'chat') && toolAccess(mode, t.risk, t.special === true).visible
	);
}

/* helpers for new tools ---------------------------------------------- */

const COMP_NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;

/** static component-source checks (compile-level validation is a client tool, Phase 25) */
export function componentStaticIssues(name: string, code: string): string[] {
	const issues: string[] = [];
	if (!COMP_NAME_RE.test(name)) issues.push('name 需符合 ^[a-z][a-z0-9-]{1,30}$');
	if (!code.trim()) issues.push('code 不可為空');
	if (code.length > 60_000) issues.push('code 超過 60KB 上限');
	const scriptOpen = (code.match(/<script/g) ?? []).length;
	const scriptClose = (code.match(/<\/script>/g) ?? []).length;
	// 78d relaxed: pure template components (0 pairs) are legal; only unpaired/bare trailing escapes are blocked
	if (scriptOpen !== scriptClose || scriptOpen > 1)
		issues.push('<script> 配對異常（0 或恰好 1 對；不可有裸的結尾標籤）');
	if (scriptOpen && !/<script(?![^>]*client)/.test(code)) {
		// allow <script> or <script module? no — Svelte5 runs script>
	}
	if (/window\.location\s*=|document\.write|eval\(|new Function\(/.test(code))
		issues.push('禁止 eval／new Function／document.write／跳轉注入');
	if (/<iframe[^>]*srcdoc/i.test(code)) issues.push('禁止 iframe srcdoc');
	return issues;
}

/* tools --------------------------------------------------------------- */

const listPosts: ToolDef = {
	name: 'list_posts',
	description: '列出所有文章（含草稿）：slug、標題、發布狀態、釘選、瀏覽數、已有翻譯語系。',
	permission: 'read',
	risk: 'read',
	params: {
		limit: { type: 'integer', description: '回傳筆數上限（預設 30）', optional: true }
	},
	summary: () => '列出文章',
	async run({ db }, args) {
		const kit = getDb(db);
		const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(100, args.limit)) : 30;
		const rows = await kit
			.select({
				slug: posts.slug,
				title: sql<string>`COALESCE(${postTranslations.title}, '')`,
				published: posts.published,
				pinned: posts.pinned,
				views: posts.views,
				date: posts.publishedAt
			})
			.from(posts)
			.leftJoin(
				postTranslations,
				and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, 'zh-tw'))
			)
			.orderBy(desc(posts.publishedAt))
			.limit(limit);
		const trans = await kit
			.select({ postId: postTranslations.postId, locale: postTranslations.locale })
			.from(postTranslations);
		const byPost = new Map<string, string[]>();
		for (const t of trans) byPost.set(t.postId, [...(byPost.get(t.postId) ?? []), t.locale]);
		return {
			ok: true,
			posts: rows.map((r) => ({
				slug: r.slug,
				title: r.title,
				published: r.published,
				pinned: r.pinned,
				views: r.views,
				locales: byPost.get(`post:${r.slug}`) ?? []
			}))
		};
	}
};

const getPost: ToolDef = {
	name: 'get_post',
	description:
		'讀取單篇文章：發布狀態、標籤、各語系翻譯清單，以及基準語系（zh-tw）的完整標題／摘要／正文（Markdown）。',
	permission: 'read',
	risk: 'read',
	params: {
		slug: { type: 'string', description: '文章 slug' }
	},
	summary: (a) => `讀取文章 ${str(a.slug)}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug);
		const [post] = await kit.select().from(posts).where(eq(posts.slug, slug)).limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const trs = await kit
			.select()
			.from(postTranslations)
			.where(eq(postTranslations.postId, post.id));
		const base = trs.find((t) => t.locale === 'zh-tw');
		const tagRows = await kit
			.select({ name: tags.name })
			.from(postTags)
			.innerJoin(tags, eq(postTags.tagId, tags.id))
			.where(eq(postTags.postId, post.id));
		return {
			ok: true,
			slug: post.slug,
			published: post.published,
			pinned: post.pinned,
			views: post.views,
			tags: tagRows.map((t) => t.name),
			translatedLocales: trs.map((t) => t.locale),
			title: base?.title ?? '',
			summary: base?.summary ?? '',
			body: base?.body ?? ''
		};
	}
};

const getPostSeo: ToolDef = {
	name: 'get_post_seo',
	description:
		'讀文章 SEO 覆寫（per-locale）：title/description/canonical/robots 旗標／摘要限制、schema 型別。無覆寫＝回空物件（前台走 fallback）。',
	permission: 'read',
	risk: 'read',
	params: {
		slug: { type: 'string', description: '文章 slug' },
		locale: { type: 'string', description: '語系（選填；不給＝回傳全部語系覆寫）' }
	},
	summary: (a) => `讀取 ${str(a.slug)} 的 SEO 設定`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug);
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const rows = await kit.select().from(postSeo).where(eq(postSeo.postId, post.id));
		const want = args.locale ? str(args.locale) : null;
		const hit = rows.filter((r) => !want || r.locale === want);
		return { ok: true, slug, seo: hit.map((r) => ({ ...r, updatedAt: undefined })) };
	}
};

const updatePostSeo: ToolDef = {
	name: 'update_post_seo',
	description:
		'更新文章 SEO 覆寫（只改傳入欄位；空字串/null＝清除覆寫回退預設）。maxSnippet：-1=不顯示摘要、n=最多 n 字、null=自動。robotsIndex=false 會發 noindex（前台立即生效）。',
	permission: 'write',
	risk: 'medium',
	params: {
		slug: { type: 'string', description: '文章 slug' },
		locale: { type: 'string', description: '語系（必填，覆寫按語系存放）' },
		seoTitle: { type: 'string', description: 'SEO title（建議 ≤60 字；留空回退文章標題）' },
		seoDescription: {
			type: 'string',
			description: 'meta description（建議 50–160 字；留空回退摘要）'
		},
		seoAuthor: { type: 'string', description: 'JSON-LD 作者覆寫（留空＝站主）', optional: true },
		canonicalUrl: {
			type: 'string',
			description: '自訂 canonical（絕對 URL 或 / 開頭路徑；留空自動）'
		},
		robotsIndex: { type: 'boolean', description: '允許收錄（false=noindex）' },
		robotsFollow: { type: 'boolean', description: '允許跟隨連結' },
		maxSnippet: { type: 'integer', description: '摘要字元上限（-1 不顯示；null 自動）' },
		maxImagePreview: { type: 'string', description: 'large|standard|none（留空=large 默認）' },
		schemaType: { type: 'string', description: 'Article|BlogPosting|NewsArticle' }
	},
	summary: (a) => `更新 ${str(a.slug)}（${str(a.locale)}）的 SEO 設定`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug);
		const locale = str(args.locale);
		if (!(locales as readonly string[]).includes(locale))
			return { ok: false, error: 'invalid_locale' };
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const row = await upsertPostSeo(db, post.id, locale as Locale, {
			seoTitle: args.seoTitle == null ? undefined : String(args.seoTitle),
			seoDescription: args.seoDescription == null ? undefined : String(args.seoDescription),
			canonicalUrl: args.canonicalUrl == null ? undefined : String(args.canonicalUrl),
			robotsIndex: args.robotsIndex == null ? undefined : Boolean(args.robotsIndex),
			robotsFollow: args.robotsFollow == null ? undefined : Boolean(args.robotsFollow),
			seoAuthor: args.seoAuthor == null ? undefined : String(args.seoAuthor),
			maxSnippet: args.maxSnippet == null ? null : Number(args.maxSnippet),
			maxImagePreview: args.maxImagePreview == null ? undefined : String(args.maxImagePreview),
			schemaType: args.schemaType == null ? undefined : String(args.schemaType)
		});
		return { ok: true, slug, locale, seo: { ...row, updatedAt: undefined } };
	}
};

const missingTranslations: ToolDef = {
	name: 'missing_translations',
	description: '找出尚未翻譯到指定語系的「已發布」文章 slug 清單。',
	permission: 'read',
	risk: 'read',
	params: {
		locale: { type: 'string', description: '目標語系', enum: [...locales] }
	},
	summary: (a) => `查詢缺少 ${str(a.locale)} 翻譯的文章`,
	async run({ db }, args) {
		if (!isLocale(args.locale)) return { ok: false, error: 'locale_invalid' };
		const kit = getDb(db);
		const published = await kit
			.select({ slug: posts.slug })
			.from(posts)
			.where(eq(posts.published, true));
		const have = await kit
			.select({ slug: posts.slug })
			.from(postTranslations)
			.innerJoin(posts, eq(postTranslations.postId, posts.id))
			.where(eq(postTranslations.locale, args.locale));
		const haveSet = new Set(have.map((h) => h.slug));
		return {
			ok: true,
			locale: args.locale,
			missing: published.filter((p) => !haveSet.has(p.slug)).map((p) => p.slug)
		};
	}
};

const listTags: ToolDef = {
	name: 'list_tags',
	description: '列出所有標籤與文章數，含各語系譯名（translations；缺譯的語系前台會回退基準名）。',
	permission: 'read',
	risk: 'read',
	params: {},
	summary: () => '列出標籤',
	async run({ db }) {
		const kit = getDb(db);
		const rows = await kit
			.select({ id: tags.id, name: tags.name, count: sql<number>`count(${postTags.postId})` })
			.from(tags)
			.leftJoin(postTags, eq(postTags.tagId, tags.id))
			.groupBy(tags.id)
			.orderBy(sql`count(${postTags.postId}) desc`);
		const trs = await kit
			.select({
				tagId: tagTranslations.tagId,
				locale: tagTranslations.locale,
				name: tagTranslations.name
			})
			.from(tagTranslations);
		const byTag = new Map<string, Record<string, string>>();
		for (const t of trs) {
			const rec = byTag.get(t.tagId) ?? {};
			rec[t.locale] = t.name;
			byTag.set(t.tagId, rec);
		}
		return {
			ok: true,
			tags: rows.map((r) => ({
				name: r.name,
				count: Number(r.count),
				translations: byTag.get(r.id) ?? {}
			}))
		};
	}
};

const createTag: ToolDef = {
	name: 'create_tag',
	description: '建立新標籤（名稱已存在則不動作）。',
	permission: 'write',
	risk: 'low',
	params: {
		name: { type: 'string', description: '標籤名稱（基準名，用於 URL）' }
	},
	summary: (a) => `建立標籤「${str(a.name)}」`,
	async run({ db }, args) {
		const kit = getDb(db);
		const name = str(args.name).trim();
		if (!name) return { ok: false, error: 'name_required' };
		await kit
			.insert(tags)
			.values({ id: `tag:${name}`, name, slug: name.toLowerCase() })
			.onConflictDoNothing();
		return { ok: true, name };
	}
};

const saveTranslation: ToolDef = {
	name: 'save_translation',
	description:
		'寫入／更新某篇文章在目標語系的翻譯（標題、摘要、正文 Markdown）。基準語系 zh-tw 不可用此工具覆寫。',
	permission: 'write',
	risk: 'medium',
	params: {
		slug: { type: 'string', description: '文章 slug' },
		locale: {
			type: 'string',
			description: '目標語系（非 zh-tw）',
			enum: locales.filter((l) => l !== 'zh-tw')
		},
		title: { type: 'string', description: '翻譯後標題' },
		summary: { type: 'string', description: '翻譯後摘要（≤160 字）', optional: true },
		body: {
			type: 'string',
			description: '翻譯後正文（保留 ::: 元件區塊、連結、圖片路徑與排版結構）'
		}
	},
	summary: (a) => `寫入 ${str(a.slug)} 的 ${str(a.locale)} 翻譯（標題「${str(a.title)}」）`,
	async run({ db }, args) {
		if (!isLocale(args.locale) || args.locale === 'zh-tw') {
			return { ok: false, error: 'locale_invalid（不可寫基準語系）' };
		}
		const kit = getDb(db);
		const slug = str(args.slug);
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const values = {
			title: str(args.title),
			summary: str(args.summary),
			body: bodyText(args.body)
		};
		if (!values.title || !values.body) return { ok: false, error: 'title_and_body_required' };
		const [existing] = await kit
			.select({ id: postTranslations.id })
			.from(postTranslations)
			.where(and(eq(postTranslations.postId, post.id), eq(postTranslations.locale, args.locale)))
			.limit(1);
		const now = new Date();
		if (existing) {
			await kit
				.update(postTranslations)
				.set({ ...values, updatedAt: now })
				.where(eq(postTranslations.id, existing.id));
		} else {
			await kit.insert(postTranslations).values({
				postId: post.id,
				locale: args.locale,
				...values,
				createdAt: now,
				updatedAt: now
			});
		}
		return { ok: true, slug, locale: args.locale, created: !existing };
	}
};

const saveTagTranslation: ToolDef = {
	name: 'save_tag_translation',
	description:
		'寫入／更新某個標籤在目標語系的譯名（例：「夢-信」→「Dreams-Letters」）。基準語系 zh-tw 名不可改（那會動 URL）。譯名之後，文章標籤列、標籤頁、導覽都會自動以該語系顯示。',
	permission: 'write',
	risk: 'medium',
	params: {
		tag: { type: 'string', description: '標籤基準名（zh-tw 原名，需已存在）' },
		locale: {
			type: 'string',
			description: '目標語系（非 zh-tw）',
			enum: locales.filter((l) => l !== 'zh-tw')
		},
		name: { type: 'string', description: '該語系的譯名' }
	},
	summary: (a) => `標籤「${str(a.tag)}」→ ${str(a.locale)}「${str(a.name)}」`,
	async run({ db }, args) {
		if (!isLocale(args.locale) || args.locale === 'zh-tw') {
			return { ok: false, error: 'locale_invalid（不可寫基準語系）' };
		}
		const kit = getDb(db);
		const base = str(args.tag).trim();
		const name = str(args.name).trim();
		if (!base || !name) return { ok: false, error: 'tag_and_name_required' };
		const [tag] = await kit.select({ id: tags.id }).from(tags).where(eq(tags.name, base)).limit(1);
		if (!tag) return { ok: false, error: 'tag_not_found（先確認 list_tags 的基準名）' };
		const [existing] = await kit
			.select({ id: tagTranslations.id })
			.from(tagTranslations)
			.where(and(eq(tagTranslations.tagId, tag.id), eq(tagTranslations.locale, args.locale)))
			.limit(1);
		if (existing) {
			await kit.update(tagTranslations).set({ name }).where(eq(tagTranslations.id, existing.id));
		} else {
			await kit.insert(tagTranslations).values({ tagId: tag.id, locale: args.locale, name });
		}
		return { ok: true, tag: base, locale: args.locale, name };
	}
};

const CATEGORY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const listCategories: ToolDef = {
	name: 'list_categories',
	description:
		'列出所有分類（文章頂層歸屬，一文章一分類；不同於多對多的標籤）與文章數，含各語系譯名（缺譯退回基準名）。',
	permission: 'read',
	risk: 'read',
	params: {},
	summary: () => '列出分類',
	async run({ db }) {
		const kit = getDb(db);
		const rows = await kit
			.select({
				slug: categories.slug,
				name: categories.name,
				sort: categories.sort,
				count: sql<number>`count(${posts.id})`
			})
			.from(categories)
			.leftJoin(posts, eq(posts.type, categories.slug))
			.groupBy(categories.id)
			.orderBy(categories.sort);
		const trs = await kit
			.select({
				categoryId: categoryTranslations.categoryId,
				locale: categoryTranslations.locale,
				name: categoryTranslations.name
			})
			.from(categoryTranslations);
		const ids = await kit.select({ id: categories.id, slug: categories.slug }).from(categories);
		const slugOf = new Map(ids.map((r) => [r.id, r.slug]));
		const byCat: Record<string, Record<string, string>> = {};
		for (const t of trs) {
			const slug = slugOf.get(t.categoryId);
			if (!slug) continue;
			(byCat[slug] ??= {})[t.locale] = t.name;
		}
		return {
			ok: true,
			categories: rows.map((r) => ({
				slug: r.slug,
				name: r.name,
				sort: r.sort,
				count: Number(r.count),
				translations: byCat[r.slug] ?? {}
			}))
		};
	}
};

const createCategory: ToolDef = {
	name: 'create_category',
	description: '建立新分類（slug 已存在則不動作）。slug 建立後不可改（是網址識別）。',
	permission: 'write',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '分類 slug（小寫英數連字號，如 tutorial）' },
		name: { type: 'string', description: '基準名（zh-tw 顯示名）' }
	},
	summary: (a) => `建立分類 ${str(a.slug)}「${str(a.name)}」`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		const name = str(args.name).trim();
		if (!CATEGORY_SLUG_RE.test(slug)) return { ok: false, error: 'slug_invalid（小寫英數連字號）' };
		if (!name || name.length > 40) return { ok: false, error: 'name_required（1–40 字）' };
		const [maxRow] = await kit
			.select({ m: sql<number>`COALESCE(MAX(${categories.sort}), 0)` })
			.from(categories);
		const now = new Date();
		await kit
			.insert(categories)
			.values({
				id: `category:${slug}`,
				slug,
				name,
				sort: Number(maxRow?.m ?? 0) + 1,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoNothing();
		return { ok: true, slug, name };
	}
};

const saveCategoryTranslation: ToolDef = {
	name: 'save_category_translation',
	description:
		'寫入／更新某個分類在目標語系的譯名（例：「開發紀錄」en → 「Devlog」）。之後側欄、徽章、篩選自動以該語系顯示。',
	permission: 'write',
	risk: 'medium',
	params: {
		slug: { type: 'string', description: '分類 slug（需已存在）' },
		locale: {
			type: 'string',
			description: '目標語系（非 zh-tw）',
			enum: locales.filter((l) => l !== 'zh-tw')
		},
		name: { type: 'string', description: '該語系的譯名' }
	},
	summary: (a) => `分類 ${str(a.slug)} → ${str(a.locale)}「${str(a.name)}」`,
	async run({ db }, args) {
		if (!isLocale(args.locale) || args.locale === 'zh-tw') {
			return { ok: false, error: 'locale_invalid（不可寫基準語系）' };
		}
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		const name = str(args.name).trim();
		if (!slug || !name) return { ok: false, error: 'slug_and_name_required' };
		const [cat] = await kit
			.select({ id: categories.id })
			.from(categories)
			.where(eq(categories.slug, slug))
			.limit(1);
		if (!cat) return { ok: false, error: 'category_not_found（先確認 list_categories）' };
		const [existing] = await kit
			.select({ id: categoryTranslations.id })
			.from(categoryTranslations)
			.where(
				and(
					eq(categoryTranslations.categoryId, cat.id),
					eq(categoryTranslations.locale, args.locale)
				)
			)
			.limit(1);
		const now = new Date();
		if (existing) {
			await kit
				.update(categoryTranslations)
				.set({ name, updatedAt: now })
				.where(eq(categoryTranslations.id, existing.id));
		} else {
			await kit.insert(categoryTranslations).values({
				categoryId: cat.id,
				locale: args.locale,
				name,
				createdAt: now,
				updatedAt: now
			});
		}
		return { ok: true, slug, locale: args.locale, name };
	}
};

const setPostCategory: ToolDef = {
	name: 'set_post_category',
	description:
		'把某篇文章歸入分類（一文章一分類，覆寫原分類；不存在的分類先跑 create_category）。article 為內建預設。',
	permission: 'write',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '文章 slug' },
		category: { type: 'string', description: '目標分類 slug' }
	},
	summary: (a) => `文章 ${str(a.slug)} → 分類 ${str(a.category)}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		const category = str(args.category).trim().toLowerCase();
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const [cat] = await kit
			.select({ slug: categories.slug })
			.from(categories)
			.where(eq(categories.slug, category))
			.limit(1);
		if (!cat) return { ok: false, error: 'category_not_found（可用 create_category 建立）' };
		await kit
			.update(posts)
			.set({ type: cat.slug, updatedAt: new Date() })
			.where(eq(posts.id, post.id));
		return { ok: true, slug, category: cat.slug };
	}
};

/* ---- Series (Phase 58) ---- */

const listSeries: ToolDef = {
	name: 'list_series',
	description:
		'列出所有系列（有序文章群）：slug、標題、篇數、發布狀態，含各語系譯名（translations）。',
	permission: 'read',
	risk: 'read',
	params: {},
	summary: () => '列出系列',
	async run({ db }) {
		const kit = getDb(db);
		const rows = await kit
			.select({
				slug: series.slug,
				published: series.published,
				cover: series.cover,
				title:
					sql<string>`COALESCE(MAX(CASE WHEN ${seriesTranslations.locale} = 'zh-tw' THEN ${seriesTranslations.title} END), ${series.slug})`.as(
						'title'
					),
				count: sql<number>`count(distinct ${seriesPosts.postId})`
			})
			.from(series)
			.leftJoin(seriesTranslations, eq(seriesTranslations.seriesId, series.id))
			.leftJoin(seriesPosts, eq(seriesPosts.seriesId, series.id))
			.groupBy(series.id)
			.orderBy(sql`${series.createdAt} desc`);
		const trs = await kit
			.select({
				seriesId: seriesTranslations.seriesId,
				locale: seriesTranslations.locale,
				title: seriesTranslations.title
			})
			.from(seriesTranslations);
		const ids = await kit.select({ id: series.id, slug: series.slug }).from(series);
		const slugOf = new Map(ids.map((r) => [r.id, r.slug]));
		const bySeries: Record<string, Record<string, string>> = {};
		for (const t of trs) {
			const slug = slugOf.get(t.seriesId);
			if (!slug || t.locale === 'zh-tw') continue;
			(bySeries[slug] ??= {})[t.locale] = t.title;
		}
		return {
			ok: true,
			series: rows.map((r) => ({
				slug: r.slug,
				title: r.title,
				published: r.published,
				cover: r.cover ?? '',
				count: Number(r.count),
				translations: bySeries[r.slug] ?? {}
			}))
		};
	}
};

const createSeries: ToolDef = {
	name: 'create_series',
	description:
		'建立新系列（預設草稿；slug 是網址識別 /series/…，建立後不可改）。基準標題為 zh-tw。',
	permission: 'write',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '系列 slug（小寫英數連字號）' },
		title: { type: 'string', description: '系列標題（繁中基準）' },
		summary: { type: 'string', description: '系列簡介（選填）', optional: true },
		cover: {
			type: 'string',
			description: '封面 URL：/media/…（媒體庫）或 /covers/…（選填）',
			optional: true
		}
	},
	summary: (a) => `建立系列 ${str(a.slug)}「${str(a.title)}」`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		const title = str(args.title).trim();
		if (!SERIES_SLUG_RE.test(slug)) return { ok: false, error: 'slug_invalid（小寫英數連字號）' };
		if (!title || title.length > 80) return { ok: false, error: 'title_required（1–80 字）' };
		const [dup] = await kit
			.select({ id: series.id })
			.from(series)
			.where(eq(series.slug, slug))
			.limit(1);
		if (dup) return { ok: false, error: 'series_exists' };
		const now = new Date();
		const cover = str(args.cover ?? '')
			.trim()
			.slice(0, 300);
		await kit.insert(series).values({
			id: `series:${slug}`,
			slug,
			cover: cover || null,
			published: false,
			createdAt: now,
			updatedAt: now
		});
		await kit.insert(seriesTranslations).values({
			seriesId: `series:${slug}`,
			locale: 'zh-tw',
			title,
			summary: str(args.summary ?? '')
				.trim()
				.slice(0, 500),
			createdAt: now,
			updatedAt: now
		});
		return { ok: true, slug, title };
	}
};

const updateSeries: ToolDef = {
	name: 'update_series',
	description:
		'更新系列屬性：封面 cover（URL，傳空字串清除）、發布 published（true/false）、簡介 summary（zh-tw）。只改傳入的欄位。',
	permission: 'write',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '系列 slug' },
		cover: { type: 'string', description: '封面 URL（空字串＝清除；不傳＝不動）', optional: true },
		published: { type: 'boolean', description: '發布狀態（不傳＝不動）', optional: true },
		summary: { type: 'string', description: 'zh-tw 簡介（不傳＝不動）', optional: true }
	},
	summary: (a) => `更新系列 ${str(a.slug)}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		const [meta] = await kit.select().from(series).where(eq(series.slug, slug)).limit(1);
		if (!meta) return { ok: false, error: 'series_not_found' };
		const now = new Date();
		const patch: Record<string, unknown> = { updatedAt: now };
		if (args.cover !== undefined) patch.cover = str(args.cover).trim().slice(0, 300) || null;
		if (args.published !== undefined) patch.published = Boolean(args.published);
		await kit.update(series).set(patch).where(eq(series.id, meta.id));
		if (args.summary !== undefined) {
			await kit
				.update(seriesTranslations)
				.set({ summary: str(args.summary).trim().slice(0, 500), updatedAt: now })
				.where(
					and(eq(seriesTranslations.seriesId, meta.id), eq(seriesTranslations.locale, 'zh-tw'))
				);
		}
		return { ok: true, slug };
	}
};

const saveSeriesTranslation: ToolDef = {
	name: 'save_series_translation',
	description:
		'寫入／更新某個系列在目標語系的標題與簡介（之後系列頁、索引卡、導覽自動以該語系顯示）。',
	permission: 'write',
	risk: 'medium',
	params: {
		slug: { type: 'string', description: '系列 slug（需已存在）' },
		locale: {
			type: 'string',
			description: '目標語系（非 zh-tw）',
			enum: locales.filter((l) => l !== 'zh-tw')
		},
		title: { type: 'string', description: '該語系標題' },
		summary: { type: 'string', description: '該語系簡介（選填）', optional: true }
	},
	summary: (a) => `系列 ${str(a.slug)} → ${str(a.locale)}「${str(a.title)}」`,
	async run({ db }, args) {
		if (!isLocale(args.locale) || args.locale === 'zh-tw') {
			return { ok: false, error: 'locale_invalid（不可寫基準語系）' };
		}
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		const title = str(args.title).trim();
		if (!slug || !title) return { ok: false, error: 'slug_and_title_required' };
		const [cat] = await kit
			.select({ id: series.id })
			.from(series)
			.where(eq(series.slug, slug))
			.limit(1);
		if (!cat) return { ok: false, error: 'series_not_found（可用 create_series 建立）' };
		const now = new Date();
		await kit
			.insert(seriesTranslations)
			.values({
				seriesId: cat.id,
				locale: args.locale,
				title,
				summary: str(args.summary ?? '')
					.trim()
					.slice(0, 500),
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [seriesTranslations.seriesId, seriesTranslations.locale],
				set: {
					title,
					summary: str(args.summary ?? '')
						.trim()
						.slice(0, 500),
					updatedAt: now
				}
			});
		return { ok: true, slug, locale: args.locale, title };
	}
};

const addPostToSeries: ToolDef = {
	name: 'add_post_to_series',
	description:
		'把文章加入書（系列＝書：有專屬閱讀頁 /series/<slug>/<chapter>，章節導覽由書本身負責）。同一文章可屬多本書。',
	permission: 'write',
	risk: 'low',
	params: {
		series: { type: 'string', description: '系列 slug' },
		slug: { type: 'string', description: '文章 slug' },
		position: { type: 'integer', description: '系列內序（1 起；省略＝尾部）', optional: true }
	},
	summary: (a) => `把 ${str(a.slug)} 加入系列 ${str(a.series)}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const sslug = str(args.series).trim().toLowerCase();
		const slug = str(args.slug).trim().toLowerCase();
		const [sr] = await kit
			.select({ id: series.id })
			.from(series)
			.where(eq(series.slug, sslug))
			.limit(1);
		if (!sr) return { ok: false, error: 'series_not_found（可用 create_series 建立）' };
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const [exists] = await kit
			.select({ postId: seriesPosts.postId })
			.from(seriesPosts)
			.where(and(eq(seriesPosts.seriesId, sr.id), eq(seriesPosts.postId, post.id)))
			.limit(1);
		if (exists) return { ok: false, error: 'already_in_series' };
		const [maxRow] = await kit
			.select({ m: sql<number>`COALESCE(MAX(${seriesPosts.position}), 0)` })
			.from(seriesPosts)
			.where(eq(seriesPosts.seriesId, sr.id));
		const pos =
			typeof args.position === 'number' && args.position > 0
				? Math.floor(args.position)
				: Number(maxRow?.m ?? 0) + 1;
		await kit.insert(seriesPosts).values({ seriesId: sr.id, postId: post.id, position: pos });
		const rows = await kit
			.select({ postId: seriesPosts.postId, position: seriesPosts.position })
			.from(seriesPosts)
			.where(eq(seriesPosts.seriesId, sr.id));
		for (const r of normalizePositions(rows)) {
			await kit
				.update(seriesPosts)
				.set({ position: r.position })
				.where(and(eq(seriesPosts.seriesId, sr.id), eq(seriesPosts.postId, r.postId)));
		}
		return { ok: true, series: sslug, slug, position: pos };
	}
};

const removePostFromSeries: ToolDef = {
	name: 'remove_post_from_series',
	description: '把文章移出某系列（文章本身不受影響；其餘成員自動重排）。',
	permission: 'write',
	risk: 'low',
	params: {
		series: { type: 'string', description: '系列 slug' },
		slug: { type: 'string', description: '文章 slug' }
	},
	summary: (a) => `把 ${str(a.slug)} 移出系列 ${str(a.series)}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const sslug = str(args.series).trim().toLowerCase();
		const slug = str(args.slug).trim().toLowerCase();
		const [sr] = await kit
			.select({ id: series.id })
			.from(series)
			.where(eq(series.slug, sslug))
			.limit(1);
		if (!sr) return { ok: false, error: 'series_not_found' };
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		await kit
			.delete(seriesPosts)
			.where(and(eq(seriesPosts.seriesId, sr.id), eq(seriesPosts.postId, post.id)));
		return { ok: true, series: sslug, slug };
	}
};

const setPostSeriesOnly: ToolDef = {
	name: 'set_post_series_only',
	description:
		'設定文章「僅在系列中顯示」（true＝從 /blog、首頁、搜尋、標籤頁等列表退場，只在書／系列內呈現；直鏈仍可用）。',
	permission: 'write',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '文章 slug' },
		only: { type: 'boolean', description: 'true 僅系列可見／false 回到一般列表' }
	},
	summary: (a) => `${str(a.slug)} 僅系列顯示＝${a.only === true ? '是' : '否'}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		await kit
			.update(posts)
			.set({ seriesOnly: args.only === true, updatedAt: new Date() })
			.where(eq(posts.id, post.id));
		return { ok: true, slug, seriesOnly: args.only === true };
	}
};

const publishPost: ToolDef = {
	name: 'publish_post',
	description:
		'發布或下架一篇文章（發布會同時寫入發布時間戳記）。可帶 publishAt（ISO 時間，未來＝排程發文，到期自動發布）。',
	permission: 'publish',
	risk: 'high',
	params: {
		slug: { type: 'string', description: '文章 slug' },
		published: { type: 'boolean', description: 'true 發布、false 下架' },
		publishAt: {
			type: 'string',
			description: '選填 ISO 時間；未來時間＝排程（搭配 published:true 自動轉排程）',
			optional: true
		}
	},
	summary: (a) => `${a.published ? '發布' : '下架'}文章 ${str(a.slug)}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug);
		const [post] = await kit.select().from(posts).where(eq(posts.slug, slug)).limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const published = args.published === true;
		const wasPublished = post.published;
		// Phase 67 scheduled publishing: future publishAt → stays unpublished + records the schedule; publishDuePosts takes it live when due
		const at = args.publishAt ? new Date(String(args.publishAt)) : null;
		if (published && at && !Number.isNaN(at.getTime()) && at > new Date()) {
			await kit
				.update(posts)
				.set({ published: false, publishedAt: at, updatedAt: new Date() })
				.where(eq(posts.id, post.id));
			return { ok: true, slug, scheduled: true, publishAt: at.toISOString() };
		}
		await kit
			.update(posts)
			.set({
				published,
				publishedAt: published ? new Date() : post.publishedAt,
				updatedAt: new Date()
			})
			.where(eq(posts.id, post.id));
		if (published && !wasPublished) {
			await emit('post:published', { slug, locale: 'zh-tw', published: true }, { db });
		} else if (!published && wasPublished) {
			await emit('post:unpublished', { slug, locale: 'zh-tw', published: false }, { db });
		}
		return { ok: true, slug, published };
	}
};

const siteStats: ToolDef = {
	name: 'site_stats',
	description: '全站概況統計：文章數（發布／草稿）、標籤數、待審評論數。',
	permission: 'read',
	risk: 'read',
	params: {},
	summary: () => '讀取全站統計',
	async run({ db }) {
		const kit = getDb(db);
		const [[total], [pub], [tagC], [pending]] = await Promise.all([
			kit.select({ c: sql<number>`count(*)` }).from(posts),
			kit
				.select({ c: sql<number>`count(*)` })
				.from(posts)
				.where(eq(posts.published, true)),
			kit.select({ c: sql<number>`count(*)` }).from(tags),
			kit
				.select({ c: sql<number>`count(*)` })
				.from(comments)
				.where(eq(comments.status, 'pending'))
		]);
		return {
			ok: true,
			posts: Number(total?.c ?? 0),
			publishedPosts: Number(pub?.c ?? 0),
			tags: Number(tagC?.c ?? 0),
			pendingComments: Number(pending?.c ?? 0)
		};
	}
};

/* pages (Phase 20.6) -------------------------------------------------- */

const listPages: ToolDef = {
	name: 'list_pages',
	description: '列出所有自訂頁面（含草稿）：slug、基準標題、發布狀態、是否顯示於導航、排序。',
	permission: 'read',
	risk: 'read',
	params: {},
	summary: () => '列出頁面',
	async run({ db }) {
		const rows = await listPagesAdmin(db);
		return { ok: true, pages: rows };
	}
};

const createPage: ToolDef = {
	name: 'create_page',
	description:
		'建立自訂頁面（寫入基準語系 zh-tw；slug 須小寫英數連字號且非保留路徑）。預設為草稿、不進導航，發布與導航由人工在後台決定。',
	permission: 'write',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '頁面 slug（裸路徑 /{slug}）' },
		title: { type: 'string', description: '頁面標題' },
		summary: { type: 'string', description: '摘要（選填）', optional: true },
		body: { type: 'string', description: '正文 Markdown（可含 ::: 內容元件）' }
	},
	summary: (a) => `建立頁面 /${str(a.slug)}「${str(a.title)}」`,
	async run({ db }, args) {
		const slug = str(args.slug).trim().toLowerCase();
		const title = str(args.title).trim();
		const err = validatePageSlug(slug);
		if (err) return { ok: false, error: err };
		if (!title) return { ok: false, error: 'title_required' };
		if (!str(args.body).trim()) return { ok: false, error: 'body_required' };
		if (await getPageAdmin(db, slug)) return { ok: false, error: 'page_exists（改用 save_page）' };
		const r = await upsertPage(db, {
			slug,
			published: false,
			showInNav: false,
			navOrder: 0,
			translations: {
				'zh-tw': { title, summary: str(args.summary), body: bodyText(args.body) }
			}
		});
		return r.ok ? { ok: true, slug } : { ok: false, error: r.error };
	}
};

const savePage: ToolDef = {
	name: 'save_page',
	description:
		'更新既有頁面某語系（預設基準 zh-tw）的標題／摘要／正文；其餘欄位（發布、導航、排序）與其他語系維持原樣。',
	permission: 'write',
	risk: 'medium',
	params: {
		slug: { type: 'string', description: '頁面 slug' },
		title: { type: 'string', description: '新標題' },
		summary: { type: 'string', description: '新摘要', optional: true },
		body: { type: 'string', description: '新正文 Markdown' },
		locale: {
			type: 'string',
			description: '目標語系（預設 zh-tw）',
			enum: [...locales],
			optional: true
		}
	},
	summary: (a) => `更新頁面 /${str(a.slug)}（${str(a.locale) || 'zh-tw'}）`,
	async run({ db }, args) {
		const slug = str(args.slug);
		const locale = args.locale === undefined || args.locale === '' ? 'zh-tw' : str(args.locale);
		if (!isLocale(locale)) return { ok: false, error: 'locale_invalid' };
		const existing = await getPageAdmin(db, slug);
		if (!existing) return { ok: false, error: 'page_not_found' };
		const title = str(args.title).trim();
		if (!title) return { ok: false, error: 'title_required' };
		const base = existing.translations[locale] ?? { title, summary: '', body: '' };
		const r = await upsertPage(db, {
			slug,
			published: existing.page.published,
			showInNav: existing.page.showInNav,
			navOrder: existing.page.navOrder,
			translations: {
				...existing.translations,
				[locale]: {
					title,
					summary: args.summary !== undefined ? str(args.summary) : base.summary,
					body: args.body !== undefined ? bodyText(args.body) : base.body
				}
			}
		});
		return r.ok ? { ok: true, slug, locale } : { ok: false, error: r.error };
	}
};

/* ==== Phase 59 parity: comments / settings / analytics ================= */

const COMMENT_STATUSES = ['pending', 'approved', 'rejected', 'spam'] as const;

const listComments: ToolDef = {
	name: 'list_comments',
	description:
		'列評論（附各狀態計數）。預設待審；可按狀態或文章 slug 過濾。回傳含審核情報（riskScore/風險原因）。',
	permission: 'read',
	risk: 'read',
	params: {
		status: {
			type: 'string',
			description: '過濾狀態（預設 pending）',
			enum: [...COMMENT_STATUSES],
			optional: true
		},
		slug: { type: 'string', description: '只看某篇文章的評論（post slug，選填）', optional: true },
		limit: { type: 'integer', description: '回傳筆數（預設 20，上限 50）', optional: true }
	},
	summary: (a) => `列評論 ${str(a.status) || 'pending'}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const status = COMMENT_STATUSES.includes(args.status as never)
			? (args.status as (typeof COMMENT_STATUSES)[number])
			: 'pending';
		const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
		const where = args.slug
			? and(eq(comments.status, status), eq(comments.postId, `post:${str(args.slug)}`))
			: eq(comments.status, status);
		const [rows, countRows] = await Promise.all([
			kit.select().from(comments).where(where).orderBy(desc(comments.createdAt)).limit(limit),
			kit
				.select({ status: comments.status, count: sql<number>`count(*)` })
				.from(comments)
				.groupBy(comments.status)
		]);
		return {
			ok: true,
			counts: Object.fromEntries(countRows.map((r) => [r.status, Number(r.count)])),
			comments: rows.map((c) => ({
				id: c.id,
				slug: c.postId.replace(/^post:/, ''),
				name: c.name,
				content: c.content.slice(0, 240),
				status: c.status,
				riskScore: c.riskScore,
				createdAt:
					c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt ?? '')
			}))
		};
	}
};

const setCommentStatus: ToolDef = {
	name: 'set_comment_status',
	description: '變更評論審核狀態（批准／退回垃圾／拒絕／退回待審）。',
	permission: 'write',
	risk: 'low',
	params: {
		id: { type: 'string', description: '評論 id（list_comments 取得）' },
		status: { type: 'string', description: '目標狀態', enum: [...COMMENT_STATUSES] }
	},
	summary: (a) => `評論 ${str(a.id).slice(0, 8)}… → ${str(a.status)}`,
	async run({ db }, args) {
		if (!COMMENT_STATUSES.includes(args.status as never))
			return { ok: false, error: 'status_invalid' };
		const status = args.status as (typeof COMMENT_STATUSES)[number];
		const id = str(args.id);
		if (!id) return { ok: false, error: 'id_required' };
		const kit = getDb(db);
		const [hit] = await kit
			.select({ id: comments.id })
			.from(comments)
			.where(eq(comments.id, id))
			.limit(1);
		if (!hit) return { ok: false, error: 'comment_not_found' };
		await kit.update(comments).set({ status, moderatedAt: new Date() }).where(eq(comments.id, id));
		return { ok: true, id, status: args.status };
	}
};

const deleteComment: ToolDef = {
	name: 'delete_comment',
	description: '永久刪除某則評論（不可逆）。',
	permission: 'write',
	risk: 'high',
	params: { id: { type: 'string', description: '評論 id' } },
	summary: (a) => `刪除評論 ${str(a.id).slice(0, 8)}…`,
	async run({ db }, args) {
		const id = str(args.id);
		if (!id) return { ok: false, error: 'id_required' };
		const kit = getDb(db);
		const [hit] = await kit
			.select({ id: comments.id })
			.from(comments)
			.where(eq(comments.id, id))
			.limit(1);
		if (!hit) return { ok: false, error: 'comment_not_found' };
		await kit.delete(comments).where(eq(comments.id, id));
		return { ok: true, deleted: id };
	}
};

const getSiteSettings: ToolDef = {
	name: 'get_site_settings',
	description: '讀全站設定：logo、主視覺背景、各語系標語、關於頁正文、主題、Agent 指示、作品清單。',
	permission: 'read',
	risk: 'read',
	params: {},
	summary: () => '讀取全站設定',
	async run({ db }) {
		const s = await getSettings(db);
		return {
			ok: true,
			logo: s.logo,
			heroBg: s.heroBg,
			defaultOgImage: s.defaultOgImage,
			twitterSite: s.twitterSite,
			name: s.name,
			shortName: s.shortName,
			siteDescription: s.siteDescription,
			authorName: s.authorName,
			footerText: s.footerText,
			copyright: s.copyright,
			timezone: s.timezone,
			slogans: s.slogans,
			aboutBodyPreview: s.aboutBody.slice(0, 240),
			aboutBodyLength: s.aboutBody.length,
			uiTheme: s.uiTheme,
			agentInstructionsPreview: s.agentInstructions.slice(0, 240),
			works: s.works.slice(0, 20),
			worksBackfill: s.worksBackfill,
			customized: s.customized
		};
	}
};

const updateSiteSettings: ToolDef = {
	name: 'update_site_settings',
	description:
		'更新全站設定（只改傳入欄位）。works 為 JSON 字串陣列 [{title,href,description?,badge?,date?,cover?}]；slogan 需連同 sloganLocale 一起傳。',
	permission: 'write',
	risk: 'medium',
	params: {
		logo: { type: 'string', description: 'logo 路徑（如 /media/…；空字串清除）', optional: true },
		heroBg: { type: 'string', description: '主视觉背景图路径', optional: true },
		defaultOgImage: {
			type: 'string',
			description: '站級預設分享圖路徑（文章無封面時 OG 用；空字串清除）',
			optional: true
		},
		twitterSite: {
			type: 'string',
			description: 'X/Twitter 站帳號 @handle（空字串清除）',
			optional: true
		},
		name: { type: 'string', description: '站名（空字串＝回落部署預設）', optional: true },
		siteDescription: { type: 'string', description: '站描述', optional: true },
		authorName: { type: 'string', description: '作者名（JSON-LD／署名）', optional: true },
		footerText: { type: 'string', description: '頁尾文字', optional: true },
		copyright: { type: 'string', description: '版權行（空＝© 年份 站名）', optional: true },
		timezone: { type: 'string', description: 'IANA 時區（如 Asia/Taipei）', optional: true },
		aboutBody: { type: 'string', description: '關於頁 Markdown 正文', optional: true },
		works: { type: 'string', description: '作品清單 JSON 字串', optional: true },
		worksBackfill: { type: 'boolean', description: 'works 不足時以釘選＋近期補位', optional: true },
		slogan: { type: 'string', description: '標語（搭配 sloganLocale）', optional: true },
		sloganLocale: {
			type: 'string',
			description: '標語語系',
			enum: ['zh-tw', 'zh-cn', 'en', 'jp'],
			optional: true
		}
	},
	summary: (a) =>
		`更新全站設定（${
			Object.keys(a)
				.filter((k) => String(a[k]) !== '')
				.join('、') || '無欄位'
		}）`,
	async run({ db }, args) {
		const patch: Parameters<typeof updateSettings>[1] = {};
		if (args.logo !== undefined) patch.logo = str(args.logo).slice(0, 300);
		if (args.heroBg !== undefined) patch.heroBg = str(args.heroBg).slice(0, 300);
		if (args.defaultOgImage !== undefined)
			patch.defaultOgImage = str(args.defaultOgImage).slice(0, 300);
		if (args.twitterSite !== undefined) patch.twitterSite = str(args.twitterSite).slice(0, 40);
		if (args.aboutBody !== undefined) patch.aboutBody = str(args.aboutBody);
		if (args.worksBackfill !== undefined) patch.worksBackfill = Boolean(args.worksBackfill);
		if (args.works !== undefined) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(str(args.works));
			} catch {
				return { ok: false, error: 'works_invalid_json' };
			}
			if (!Array.isArray(parsed)) return { ok: false, error: 'works_not_array' };
			const cleaned = parsed
				.filter(
					(w): w is Record<string, unknown> =>
						!!w &&
						typeof (w as { title?: unknown }).title === 'string' &&
						typeof (w as { href?: unknown }).href === 'string'
				)
				.map((w) => ({
					title: String(w.title).slice(0, 120),
					href: String(w.href).slice(0, 300),
					...((w.description as string)
						? { description: String(w.description).slice(0, 300) }
						: {}),
					...((w.badge as string) ? { badge: String(w.badge).slice(0, 40) } : {}),
					...((w.date as string) ? { date: String(w.date).slice(0, 20) } : {}),
					...((w.cover as string) ? { cover: String(w.cover).slice(0, 300) } : {})
				}));
			patch.works = cleaned;
		}
		if (args.slogan !== undefined && args.sloganLocale !== undefined) {
			patch.slogans = { [str(args.sloganLocale)]: str(args.slogan).slice(0, 120) };
		}
		if (Object.keys(patch).length === 0) return { ok: false, error: 'no_fields' };
		await updateSettings(db, patch);
		return { ok: true, fields: Object.keys(patch) };
	}
};

const setUiTheme: ToolDef = {
	name: 'set_ui_theme',
	description:
		'切換全站主題為內建主題（abstract／minimal／terminal／magazine）。DB 主題請用 apply_db_theme。',
	permission: 'write',
	risk: 'low',
	params: { id: { type: 'string', description: '內建主題 id', enum: [...THEME_IDS] } },
	summary: (a) => `切換主題 → ${str(a.id)}`,
	async run({ db }, args) {
		const id = str(args.id);
		if (!(THEME_IDS as readonly string[]).includes(id))
			return { ok: false, error: 'theme_invalid' };
		await updateSettings(db, { uiTheme: id as (typeof THEME_IDS)[number] });
		return { ok: true, uiTheme: id };
	}
};

const applyDbTheme: ToolDef = {
	name: 'apply_db_theme',
	description:
		'採用既有 DB 主題為全站主題（高風險：DB 主題含可執行 surface 元件碼，SSR 回落其 base 版面）。id 須為已存在的 db- 前綴主題。',
	permission: 'write',
	risk: 'high',
	params: { id: { type: 'string', description: 'DB 主題 id（db-<slug>）' } },
	summary: (a) => `採用 DB 主題 → ${str(a.id)}`,
	async run({ db }, args) {
		const id = str(args.id);
		if (!isDbThemeId(id)) return { ok: false, error: 'need_db_prefixed_id' };
		if (!(await getTheme(db, id))) return { ok: false, error: 'theme_not_found' };
		await updateSettings(db, { uiTheme: id });
		return { ok: true, uiTheme: id };
	}
};

const setAgentInstructions: ToolDef = {
	name: 'set_agent_instructions',
	description: '覆寫 SITE.md（Agent 自身系統指示，≤4000 字）。高風險操作：影響之後所有對話行為。',
	permission: 'write',
	risk: 'high',
	params: { instructions: { type: 'string', description: 'SITE.md 全文（空字串＝回復預設）' } },
	summary: (a) => `覆寫 SITE.md（${str(a.instructions).length} 字）`,
	async run({ db }, args) {
		await updateSettings(db, { agentInstructions: str(args.instructions).slice(0, 4000) });
		return { ok: true, length: Math.min(4000, str(args.instructions).length) };
	}
};

const setPageNav: ToolDef = {
	name: 'set_page_nav',
	description: '調整自訂頁面的導航與發布：showInNav／navOrder／published 只改傳入欄位，譯文不動。',
	permission: 'write',
	risk: 'medium',
	params: {
		slug: { type: 'string', description: '頁面 slug' },
		published: { type: 'boolean', description: '發布狀態（選填）', optional: true },
		showInNav: { type: 'boolean', description: '顯示於導覽列（選填）', optional: true },
		navOrder: { type: 'integer', description: '導航排序（選填）', optional: true }
	},
	summary: (a) => `調整頁面 /${str(a.slug)} 導航／發布`,
	async run({ db }, args) {
		const slug = str(args.slug);
		const existing = await getPageAdmin(db, slug);
		if (!existing) return { ok: false, error: 'page_not_found' };
		if (args.published === undefined && args.showInNav === undefined && args.navOrder === undefined)
			return { ok: false, error: 'no_fields' };
		const r = await upsertPage(db, {
			slug,
			published: typeof args.published === 'boolean' ? args.published : existing.page.published,
			showInNav: typeof args.showInNav === 'boolean' ? args.showInNav : existing.page.showInNav,
			navOrder: typeof args.navOrder === 'number' ? args.navOrder : existing.page.navOrder,
			translations: existing.translations
		});
		return r.ok ? { ok: true, slug } : { ok: false, error: r.error };
	}
};

const ANALYTICS_RANGES = ['today', '7d', '30d', '90d', 'all'] as const;
const ANALYTICS_SECTIONS = [
	'totals',
	'daily',
	'top_posts',
	'locales',
	'channels',
	'referrers',
	'campaigns'
] as const;

const getAnalytics: ToolDef = {
	name: 'get_analytics',
	description:
		'讀站點流量（page_views 聚合）。section 選填＝只回該區塊（預設全部）；range 預設 30d。top 榜各回前 10。',
	permission: 'read',
	risk: 'read',
	params: {
		range: { type: 'string', description: '時間範圍', enum: [...ANALYTICS_RANGES], optional: true },
		section: {
			type: 'string',
			description: '單一區塊（省略＝摘要全給）',
			enum: [...ANALYTICS_SECTIONS],
			optional: true
		}
	},
	summary: (a) => `讀流量統計（${str(a.range) || '30d'}）`,
	async run({ db }, args) {
		const range = (
			ANALYTICS_RANGES.includes(args.range as never) ? args.range : '30d'
		) as (typeof ANALYTICS_RANGES)[number];
		const section = ANALYTICS_SECTIONS.includes(args.section as never)
			? (args.section as (typeof ANALYTICS_SECTIONS)[number])
			: '';
		const kit = getDb(db);
		const today = new Date().toISOString().slice(0, 10);
		const where =
			range === 'today'
				? eq(pageViews.viewDate, today)
				: range === 'all'
					? sql`1`
					: gte(
							pageViews.viewDate,
							new Date(Date.now() - (Number(range.slice(0, -1)) - 1) * 86_400_000)
								.toISOString()
								.slice(0, 10)
						);
		const want = (s: (typeof ANALYTICS_SECTIONS)[number]) => !section || section === s;
		const out: Record<string, unknown> = { range };

		if (want('totals')) {
			const [[t]] = await Promise.all([
				kit
					.select({
						pv: sql<number>`count(*)`,
						uv: sql<number>`count(distinct ${pageViews.ipHash})`,
						sessions: sql<number>`count(distinct ${pageViews.sessionId})`
					})
					.from(pageViews)
					.where(where)
			]);
			out.totals = {
				pv: Number(t?.pv ?? 0),
				uv: Number(t?.uv ?? 0),
				sessions: Number(t?.sessions ?? 0)
			};
		}
		if (want('daily')) {
			out.daily = (
				await kit
					.select({ date: pageViews.viewDate, pv: sql<number>`count(*)` })
					.from(pageViews)
					.where(where)
					.groupBy(pageViews.viewDate)
					.orderBy(pageViews.viewDate)
			).map((r) => ({ date: r.date, pv: Number(r.pv) }));
		}
		if (want('top_posts')) {
			const rows = await kit
				.select({
					path: pageViews.path,
					pv: sql<number>`count(*)`,
					uv: sql<number>`count(distinct ${pageViews.ipHash})`
				})
				.from(pageViews)
				.where(and(like(pageViews.path, '/blog/%'), where))
				.groupBy(pageViews.path)
				.orderBy(sql`count(*) desc`)
				.limit(10);
			// slug → base-language title (one batch; paths percent-decoded first)
			const slugs = rows.map((r) => decodeURIComponent(r.path.replace(/^\/blog\//, '')));
			const titleRows = slugs.length
				? await kit
						.select({ slug: posts.slug, title: postTranslations.title })
						.from(postTranslations)
						.innerJoin(posts, eq(postTranslations.postId, posts.id))
						.where(and(eq(postTranslations.locale, BASE_LOCALE), inArray(posts.slug, slugs)))
				: [];
			const titles = new Map(titleRows.map((t) => [t.slug, t.title]));
			out.topPosts = rows.map((r) => {
				const slug = decodeURIComponent(r.path.replace(/^\/blog\//, ''));
				return { slug, title: titles.get(slug) ?? '', pv: Number(r.pv), uv: Number(r.uv) };
			});
		}
		if (want('locales')) {
			out.byLocale = (
				await kit
					.select({ locale: pageViews.locale, pv: sql<number>`count(*)` })
					.from(pageViews)
					.where(where)
					.groupBy(pageViews.locale)
					.orderBy(sql`count(*) desc`)
			).map((r) => ({ locale: r.locale, pv: Number(r.pv) }));
		}
		if (want('channels')) {
			out.byChannel = (
				await kit
					.select({ channel: pageViews.channel, pv: sql<number>`count(*)` })
					.from(pageViews)
					.where(where)
					.groupBy(pageViews.channel)
					.orderBy(sql`count(*) desc`)
			).map((r) => ({ channel: r.channel, pv: Number(r.pv) }));
		}
		if (want('referrers')) {
			out.referrers = (
				await kit
					.select({ domain: pageViews.refDomain, pv: sql<number>`count(*)` })
					.from(pageViews)
					.where(and(where, ne(pageViews.refDomain, '')))
					.groupBy(pageViews.refDomain)
					.orderBy(sql`count(*) desc`)
					.limit(10)
			).map((r) => ({ domain: r.domain, pv: Number(r.pv) }));
		}
		if (want('campaigns')) {
			out.campaigns = (
				await kit
					.select({
						source: pageViews.utmSource,
						medium: pageViews.utmMedium,
						campaign: pageViews.utmCampaign,
						pv: sql<number>`count(*)`
					})
					.from(pageViews)
					.where(and(where, sql`${pageViews.utmCampaign} is not null`))
					.groupBy(pageViews.utmSource, pageViews.utmMedium, pageViews.utmCampaign)
					.orderBy(sql`count(*) desc`)
					.limit(10)
			).map((r) => ({
				source: String(r.source ?? ''),
				medium: String(r.medium ?? ''),
				campaign: String(r.campaign ?? ''),
				pv: Number(r.pv)
			}));
		}
		return { ok: true, ...out };
	}
};

/* ==== Phase 59 media (R2 via ToolCtx.bucket) ========================== */

const listMedia: ToolDef = {
	name: 'list_media',
	description:
		'列 R2 媒體庫：目錄（folders）與檔案（files：key/size/url）。可按 prefix（如 "covers/"）縮小範圍。',
	permission: 'read',
	risk: 'read',
	params: { prefix: { type: 'string', description: '目錄前綴（選填）', optional: true } },
	summary: (a) => `列媒體庫 ${str(a.prefix) || '(根)'}`,
	async run({ bucket }, args) {
		if (!bucket) return { ok: false, error: 'bucket_unavailable' };
		const prefix = str(args.prefix).replace(/[^a-zA-Z0-9/_\-.]/g, '');
		const listed = await bucket.list({ prefix, delimiter: '/' });
		return {
			ok: true,
			folders: listed.delimitedPrefixes ?? [],
			files: (listed.objects ?? []).slice(0, 100).map((o) => ({
				key: o.key,
				size: o.size,
				uploaded: o.uploaded.toISOString(),
				url: `/media/${o.key}`
			})),
			truncated: listed.truncated
		};
	}
};

const deleteMedia: ToolDef = {
	name: 'delete_media',
	description:
		'刪除媒體庫檔案（keys 為 JSON 字串陣列，如 ["covers/a.png"]）。不可逆；單次上限 50。',
	permission: 'write',
	risk: 'high',
	params: { keys: { type: 'string', description: '要刪除的 key 清單（JSON 字串陣列）' } },
	summary: (a) => {
		let n = 0;
		try {
			n = JSON.parse(str(a.keys)).length;
		} catch {
			/* keys not JSON: count stays 0 */
		}
		return `刪除媒體檔案 ×${n}`;
	},
	async run({ bucket }, args) {
		if (!bucket) return { ok: false, error: 'bucket_unavailable' };
		let keys: unknown;
		try {
			keys = JSON.parse(str(args.keys));
		} catch {
			return { ok: false, error: 'keys_invalid_json' };
		}
		if (!Array.isArray(keys) || keys.length === 0 || keys.length > 50)
			return { ok: false, error: 'keys_count_invalid（1–50）' };
		const clean = keys.map((k) => String(k).replace(/[^a-zA-Z0-9/_\-.]/g, '')).filter(Boolean);
		if (clean.length !== keys.length) return { ok: false, error: 'keys_sanitized_mismatch' };
		await bucket.delete(clean);
		return { ok: true, deleted: clean };
	}
};

/* ==== Phase 23 new tools ================================================ */

const searchPosts: ToolDef = {
	name: 'search_posts',
	description: '以關鍵字搜尋文章標題／正文（各語系），回傳 slug、命中語系與上下文摘錄。',
	permission: 'read',
	risk: 'read',
	params: {
		query: { type: 'string', description: '關鍵字' },
		limit: { type: 'integer', description: '上限（預設 10）', optional: true }
	},
	summary: (a) => `搜尋「${str(a.query)}」`,
	async run({ db }, args) {
		const kit = getDb(db);
		const q = str(args.query).trim();
		if (!q) return { ok: false, error: 'query_required' };
		const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(30, args.limit)) : 10;
		const pattern = `%${q}%`;
		const rows = await kit
			.select({
				slug: posts.slug,
				locale: postTranslations.locale,
				title: postTranslations.title,
				body: postTranslations.body,
				published: posts.published
			})
			.from(posts)
			.innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
			.where(or(like(postTranslations.title, pattern), like(postTranslations.body, pattern)))
			.limit(60);
		const seen = new Set<string>();
		const hits: unknown[] = [];
		for (const r of rows) {
			const key = `${r.slug}|${r.locale}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const idx = r.body.toLowerCase().indexOf(q.toLowerCase());
			const snippet =
				idx === -1 ? r.body.slice(0, 160) : r.body.slice(Math.max(0, idx - 60), idx + 100);
			hits.push({
				slug: r.slug,
				locale: r.locale,
				title: r.title,
				published: r.published,
				snippet
			});
			if (hits.length >= limit) break;
		}
		return { ok: true, query: q, hits };
	}
};

const createPost: ToolDef = {
	name: 'create_post',
	description:
		'建立新文章（基準語系 zh-tw，預設草稿不發布）。slug 需小寫英數連字號；正文可含 ::: 內容元件。',
	permission: 'write',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '文章 slug（/blog/{slug}）' },
		title: { type: 'string', description: '標題' },
		body: { type: 'string', description: '正文 Markdown' },
		summary: { type: 'string', description: '摘要（選填）', optional: true },
		tags: { type: 'string', description: '標籤，逗號分隔（選填）', optional: true },
		category: {
			type: 'string',
			description: '分類 slug（選填，預設 article；不存在會報錯）',
			optional: true
		}
	},
	summary: (a) => `建立草稿文章 ${str(a.slug)}「${str(a.title)}」`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug).trim().toLowerCase();
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: 'slug_invalid' };
		const title = str(args.title).trim();
		const body = bodyText(args.body);
		if (!title || !body.trim()) return { ok: false, error: 'title_and_body_required' };
		const clash = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, slug))
			.limit(1);
		if (clash.length) return { ok: false, error: 'post_exists（改用 update_markdown）' };
		const rawCat =
			str(args.category ?? '')
				.trim()
				.toLowerCase() || 'article';
		const [catRow] = await kit
			.select({ slug: categories.slug })
			.from(categories)
			.where(eq(categories.slug, rawCat))
			.limit(1);
		if (!catRow) return { ok: false, error: 'category_not_found（可用 create_category 建立）' };
		const now = new Date();
		const [post] = await kit
			.insert(posts)
			.values({
				id: `post:${slug}`,
				slug,
				type: catRow.slug,
				published: false,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: posts.id });
		await kit.insert(postTranslations).values({
			postId: post.id,
			locale: 'zh-tw',
			title,
			summary: str(args.summary),
			body,
			createdAt: now,
			updatedAt: now
		});
		for (const raw of str(args.tags).split(',')) {
			const name = raw.trim();
			if (!name) continue;
			await kit
				.insert(tags)
				.values({ id: `tag:${name}`, name, slug: name.toLowerCase() })
				.onConflictDoNothing();
			const [t] = await kit.select({ id: tags.id }).from(tags).where(eq(tags.name, name)).limit(1);
			if (t)
				await kit.insert(postTags).values({ postId: post.id, tagId: t.id }).onConflictDoNothing();
		}
		return { ok: true, slug };
	}
};

const deletePost: ToolDef = {
	name: 'delete_post',
	description: '永久刪除一篇文章（含翻譯、標籤關聯；不可復原）。',
	permission: 'write',
	risk: 'high',
	params: {
		slug: { type: 'string', description: '文章 slug' }
	},
	summary: (a) => `永久刪除文章 ${str(a.slug)}`,
	async run({ db }, args) {
		const kit = getDb(db);
		const slug = str(args.slug);
		const [post] = await kit.select().from(posts).where(eq(posts.slug, slug)).limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const wasPublished = post.published;
		await kit.delete(postTranslations).where(eq(postTranslations.postId, post.id));
		await kit.delete(postTags).where(eq(postTags.postId, post.id));
		await kit.delete(posts).where(eq(posts.id, post.id));
		if (wasPublished)
			await emit('post:unpublished', { slug, locale: 'zh-tw', published: false }, { db });
		return { ok: true, slug, deleted: true };
	}
};

const readPage: ToolDef = {
	name: 'read_page',
	description: '讀取自訂頁面：發布/導航狀態與各語系標題、摘要、正文。',
	permission: 'read',
	risk: 'read',
	params: {
		slug: { type: 'string', description: '頁面 slug' },
		locale: {
			type: 'string',
			description: '語系（預設 zh-tw）',
			enum: [...locales],
			optional: true
		}
	},
	summary: (a) => `讀取頁面 /${str(a.slug)}`,
	async run({ db }, args) {
		const slug = str(args.slug);
		const admin = await getPageAdmin(db, slug);
		if (!admin) return { ok: false, error: 'page_not_found' };
		const locale = args.locale ? str(args.locale) : 'zh-tw';
		const tr = admin.translations[locale] ?? admin.translations['zh-tw'];
		return {
			ok: true,
			slug,
			published: admin.page.published,
			showInNav: admin.page.showInNav,
			navOrder: admin.page.navOrder,
			locale: admin.translations[locale] ? locale : 'zh-tw',
			title: tr?.title ?? '',
			summary: tr?.summary ?? '',
			body: tr?.body ?? '',
			translatedLocales: Object.keys(admin.translations)
		};
	}
};

const readMarkdown: ToolDef = {
	name: 'read_markdown',
	description: '讀取文章或頁面的 Markdown 原文（含標題／摘要）。kind：post|page。',
	permission: 'read',
	risk: 'read',
	params: {
		kind: { type: 'string', description: '目標種類', enum: ['post', 'page'] },
		slug: { type: 'string', description: 'slug' },
		locale: {
			type: 'string',
			description: '語系（預設 zh-tw）',
			enum: [...locales],
			optional: true
		}
	},
	summary: (a) => `讀取 ${str(a.kind)} ${str(a.slug)} 正文`,
	async run({ db }, args) {
		const locale = args.locale ? str(args.locale) : 'zh-tw';
		if (!isLocale(locale)) return { ok: false, error: 'locale_invalid' };
		if (str(args.kind) === 'page') {
			const admin = await getPageAdmin(db, str(args.slug));
			if (!admin) return { ok: false, error: 'page_not_found' };
			const tr = admin.translations[locale] ?? admin.translations['zh-tw'];
			return {
				ok: true,
				kind: 'page',
				slug: admin.page.slug,
				title: tr?.title ?? '',
				body: tr?.body ?? ''
			};
		}
		const kit = getDb(db);
		const [row] = await kit
			.select({
				title: postTranslations.title,
				summary: postTranslations.summary,
				body: postTranslations.body
			})
			.from(posts)
			.innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
			.where(and(eq(posts.slug, str(args.slug)), eq(postTranslations.locale, locale)))
			.limit(1);
		if (!row) return { ok: false, error: 'post_translation_not_found' };
		return { ok: true, kind: 'post', slug: str(args.slug), locale, ...row };
	}
};

const updateMarkdown: ToolDef = {
	name: 'update_markdown',
	description:
		'更新文章或頁面某語系的正文（只動 body；標題/發布狀態/導航不受影響，那些請用各自工具）。',
	permission: 'write',
	risk: 'medium',
	params: {
		kind: { type: 'string', description: '目標種類', enum: ['post', 'page'] },
		slug: { type: 'string', description: 'slug' },
		body: { type: 'string', description: '新正文 Markdown' },
		locale: {
			type: 'string',
			description: '語系（預設 zh-tw）',
			enum: [...locales],
			optional: true
		}
	},
	summary: (a) => `更新 ${str(a.kind)} ${str(a.slug)} 正文（${str(a.locale) || 'zh-tw'}）`,
	async run({ db }, args) {
		const locale = args.locale ? str(args.locale) : 'zh-tw';
		if (!isLocale(locale)) return { ok: false, error: 'locale_invalid' };
		const body = bodyText(args.body);
		if (!body.trim()) return { ok: false, error: 'body_required' };
		const kit = getDb(db);
		if (str(args.kind) === 'page') {
			const existing = await getPageAdmin(db, str(args.slug));
			if (!existing) return { ok: false, error: 'page_not_found' };
			const r = await upsertPage(db, {
				slug: existing.page.slug,
				published: existing.page.published,
				showInNav: existing.page.showInNav,
				navOrder: existing.page.navOrder,
				translations: {
					...existing.translations,
					[locale]: {
						title:
							existing.translations[locale]?.title ?? existing.translations['zh-tw']?.title ?? '',
						summary: existing.translations[locale]?.summary ?? '',
						body
					}
				}
			});
			return r.ok
				? { ok: true, kind: 'page', slug: str(args.slug) }
				: { ok: false, error: r.error };
		}
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, str(args.slug)))
			.limit(1);
		if (!post) return { ok: false, error: 'post_not_found' };
		const [tr] = await kit
			.select({ id: postTranslations.id })
			.from(postTranslations)
			.where(and(eq(postTranslations.postId, post.id), eq(postTranslations.locale, locale)))
			.limit(1);
		if (tr) {
			await kit
				.update(postTranslations)
				.set({ body, updatedAt: new Date() })
				.where(eq(postTranslations.id, tr.id));
		} else {
			await kit.insert(postTranslations).values({
				postId: post.id,
				locale,
				title: str(args.slug),
				summary: '',
				body,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}
		return { ok: true, kind: 'post', slug: str(args.slug), locale };
	}
};

async function markdownIssues(db: D1Database, body: string): Promise<string[]> {
	const issues: string[] = [];
	const serveable = await serveableSlugs(db, 'component');
	const tree = buildContentTree(body, serveable);
	walkTree(tree.nodes, (n) => {
		if (n.type === 'component' && !serveable.has(n.name)) {
			issues.push(`未註冊／未批准／已停用元件：:::${n.name}`);
		}
	});
	return issues;
}

const validateMarkdown: ToolDef = {
	name: 'validate_markdown',
	description:
		'驗證 Markdown 正文（元件引用是否可服務、結構是否可解析）。可傳 body 或指向 kind+slug。',
	permission: 'read',
	risk: 'read',
	params: {
		body: { type: 'string', description: '待驗證正文（與 kind/slug 二擇一）', optional: true },
		kind: { type: 'string', description: 'post|page', enum: ['post', 'page'], optional: true },
		slug: { type: 'string', description: 'slug', optional: true }
	},
	summary: () => '驗證 Markdown',
	async run({ db }, args) {
		let body = str(args.body);
		if (!body && str(args.kind)) {
			const kit = getDb(db);
			if (str(args.kind) === 'page') {
				const admin = await getPageAdmin(db, str(args.slug));
				body = admin?.translations['zh-tw']?.body ?? '';
			} else {
				const [row] = await kit
					.select({ body: postTranslations.body })
					.from(posts)
					.innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
					.where(and(eq(posts.slug, str(args.slug)), eq(postTranslations.locale, 'zh-tw')))
					.limit(1);
				body = row?.body ?? '';
			}
		}
		if (!body.trim()) return { ok: false, error: 'body_or_target_required' };
		const issues = await markdownIssues(db, body);
		return { ok: true, valid: issues.length === 0, issues };
	}
};

const listComponentsTool: ToolDef = {
	name: 'list_components',
	description: '列出全部內容元件：官方＋自訂（registry 狀態：版本/啟用/審查/來源）。',
	permission: 'read',
	risk: 'read',
	params: {},
	summary: () => '列出元件',
	async run({ db }) {
		const items = await listRegistry(db, 'component');
		return {
			ok: true,
			components: items.map((i) => ({
				name: i.slug,
				description: i.description,
				source: i.source,
				version: i.version,
				enabled: i.enabled,
				review: i.review
			}))
		};
	}
};

const readComponent: ToolDef = {
	name: 'read_component',
	description: '讀取自訂元件的原始碼與 registry 中繼資料。',
	permission: 'read',
	risk: 'read',
	params: {
		name: { type: 'string', description: '元件名（:::name）' }
	},
	summary: (a) => `讀取元件 ${str(a.name)}`,
	async run({ db }, args) {
		const name = str(args.name);
		const item = await getRegistryItem(db, 'component', name);
		const kit = getDb(db);
		const [own] = await kit
			.select({ code: customComponents.code, enabled: customComponents.enabled })
			.from(customComponents)
			.where(eq(customComponents.name, name))
			.limit(1);
		if (!item && !own)
			return { ok: false, error: 'component_not_found（官方元件請直接於文章中引用 :::名称）' };
		return {
			ok: true,
			name,
			meta: item
				? { source: item.source, version: item.version, enabled: item.enabled, review: item.review }
				: null,
			code: own?.code
		};
	}
};

const validateComponentTool: ToolDef = {
	name: 'validate_component',
	description:
		'對元件原始碼做靜態安全檢查（名稱格式、標籤配對、危險 construct）。瀏覽器編譯驗證於 Workshop 進行。',
	permission: 'read',
	risk: 'read',
	params: {
		name: { type: 'string', description: '元件名' },
		code: { type: 'string', description: 'Svelte 原始碼' }
	},
	summary: (a) => `驗證元件 ${str(a.name)}`,
	async run(_ctx, args) {
		const issues = componentStaticIssues(str(args.name), str(args.code));
		return { ok: true, valid: issues.length === 0, issues };
	}
};

const createComponentTool: ToolDef = {
	name: 'create_component',
	description:
		'建立自訂內容元件（寫入 Registry；AI 產出一律標記 source=ai、review=pending，須人工批准後才會在站上掛載）。',
	permission: 'write',
	risk: 'medium',
	params: {
		name: { type: 'string', description: '元件名 ^[a-z][a-z0-9-]{1,30}$' },
		description: { type: 'string', description: '一句話說明' },
		code: { type: 'string', description: 'Svelte 5 原始碼（$props/$state；不超過 60KB）' }
	},
	summary: (a) => `建立元件 ${str(a.name)}（待審）`,
	async run({ db }, args) {
		const name = str(args.name).trim();
		const code = str(args.code);
		const issues = componentStaticIssues(name, code);
		if (issues.length) return { ok: false, error: issues.join('；') };
		const r = await installArtifact(db, {
			kind: 'component',
			slug: name,
			name,
			description: str(args.description),
			source: 'ai',
			artifact: code,
			capabilities: ['self-contained'],
			note: 'agent runtime 建立'
		});
		return r.ok
			? {
					ok: true,
					name,
					version: r.version,
					review: 'pending（須人工在 Registry 批准後才會被掛載）'
				}
			: { ok: false, error: r.error };
	}
};

const updateComponentTool: ToolDef = {
	name: 'update_component',
	description: '更新既有自訂元件原始碼（產生新版本，進入待審；官方元件不可改）。',
	permission: 'write',
	risk: 'medium',
	params: {
		name: { type: 'string', description: '元件名' },
		code: { type: 'string', description: '新 Svelte 原始碼' },
		description: { type: 'string', description: '新說明（選填，留空保留）', optional: true }
	},
	summary: (a) => `更新元件 ${str(a.name)}`,
	async run({ db }, args) {
		const name = str(args.name).trim();
		const code = str(args.code);
		const issues = componentStaticIssues(name, code);
		if (issues.length) return { ok: false, error: issues.join('；') };
		const item = await getRegistryItem(db, 'component', name);
		if (!item) return { ok: false, error: 'component_not_found（請改用 create_component）' };
		if (item.source === 'official') return { ok: false, error: '官方元件不可經 Agent 修改' };
		const r = await installArtifact(db, {
			kind: 'component',
			slug: name,
			name,
			description: str(args.description) || item.description,
			source: 'ai',
			artifact: code,
			capabilities: item.capabilities.length ? item.capabilities : ['self-contained'],
			review: 'pending',
			note: 'agent runtime 更新'
		});
		return r.ok
			? { ok: true, name, version: r.version, review: 'pending' }
			: { ok: false, error: r.error };
	}
};

const deleteComponentTool: ToolDef = {
	name: 'delete_component',
	description:
		'移除自訂元件（Registry 卸載＋版本歷史連帶清除；引用它的文章會退回占位）。官方元件不可刪。',
	permission: 'write',
	risk: 'high',
	params: {
		name: { type: 'string', description: '元件名' }
	},
	summary: (a) => `刪除元件 ${str(a.name)}`,
	async run({ db }, args) {
		const name = str(args.name);
		const item = await getRegistryItem(db, 'component', name);
		if (!item) return { ok: false, error: 'component_not_found' };
		const r = await uninstall(db, item.id);
		return r.ok ? { ok: true, name } : { ok: false, error: r.error };
	}
};

const inspectComponentTree: ToolDef = {
	name: 'inspect_component_tree',
	description:
		'解析文章/頁面正文的元件樹（名稱、props 鍵、嵌套結構、可服務性），掌握 ::: 元件使用分佈。',
	permission: 'read',
	risk: 'read',
	params: {
		kind: { type: 'string', description: 'post|page', enum: ['post', 'page'] },
		slug: { type: 'string', description: 'slug' },
		locale: {
			type: 'string',
			description: '語系（預設 zh-tw）',
			enum: [...locales],
			optional: true
		}
	},
	summary: (a) => `剖析 ${str(a.kind)} ${str(a.slug)} 元件樹`,
	async run({ db }, args) {
		const locale = args.locale ? str(args.locale) : 'zh-tw';
		let body: string;
		const kit = getDb(db);
		if (str(args.kind) === 'page') {
			const admin = await getPageAdmin(db, str(args.slug));
			body = admin?.translations[locale]?.body ?? '';
			if (!body) return { ok: false, error: 'page_or_locale_not_found' };
		} else {
			const [row] = await kit
				.select({ body: postTranslations.body })
				.from(posts)
				.innerJoin(postTranslations, eq(postTranslations.postId, posts.id))
				.where(and(eq(posts.slug, str(args.slug)), eq(postTranslations.locale, locale)))
				.limit(1);
			if (!row) return { ok: false, error: 'post_translation_not_found' };
			body = row.body;
		}
		const serveable = await serveableSlugs(db, 'component');
		const tree = buildContentTree(body, serveable);
		const counts: Record<string, number> = {};
		const shape = (n: (typeof tree.nodes)[number]): unknown => {
			if (n.type === 'text') return { type: 'text' };
			counts[n.name] = (counts[n.name] ?? 0) + 1;
			return {
				type: 'component',
				name: n.name,
				propKeys: Object.keys(n.props ?? {}),
				serveable: serveable.has(n.name),
				...(n.children ? { children: n.children.map(shape) } : {})
			};
		};
		const nodes = tree.nodes.map(shape).filter((r) => (r as { type: string }).type === 'component');
		return { ok: true, counts, tree: nodes };
	}
};

const listRegistryTool: ToolDef = {
	name: 'list_registry',
	description: '列出 Registry 目錄（元件/外掛/主題：版本、啟用、審查狀態、來源）。',
	permission: 'read',
	risk: 'read',
	params: {
		kind: {
			type: 'string',
			description: '過濾種類（選填）',
			enum: ['component', 'plugin', 'theme'],
			optional: true
		}
	},
	summary: () => '列出 Registry',
	async run({ db }, args) {
		const kind = str(args.kind) as 'component' | 'plugin' | 'theme' | '';
		const items = await listRegistry(db, kind || undefined);
		return {
			ok: true,
			items: items.map((i) => ({
				kind: i.kind,
				slug: i.slug,
				source: i.source,
				version: i.version,
				enabled: i.enabled,
				review: i.review
			}))
		};
	}
};

const updatePlan: ToolDef = {
	name: 'update_plan',
	description:
		'建立或更新執行計畫（runtime 物件，使用者可見）。steps 為全量清單：[{ordinal:number,label:string,status:pending|active|done|failed|skipped,note?:string}]。執行中即時更新步驟狀態；方向改變時提交新清單（re-plan）。多步任務開始前必須先立計畫。',
	permission: 'read',
	risk: 'read',
	special: true,
	params: {
		title: { type: 'string', description: '計畫標題（短句）', optional: true },
		steps: {
			type: 'array',
			description: '全量步驟清單：[{ordinal,label,status,note?}]'
		}
	},
	summary: (a) => {
		const steps = Array.isArray(a.steps) ? a.steps : [];
		return `更新計畫（${steps.length} 步）`;
	},
	async run(ctx, args) {
		if (!ctx.runId) return { ok: false, error: 'plan_requires_runtime' };
		const rawSteps = Array.isArray(args.steps) ? args.steps : [];
		const allowed: PlanStepStatus[] = ['pending', 'active', 'done', 'failed', 'skipped'];
		const steps: { ordinal: number; label: string; status: PlanStepStatus; note?: string }[] = [];
		const problems: string[] = [];
		rawSteps.forEach((x, i) => {
			const o = (x ?? {}) as Record<string, unknown>;
			const ordinal = typeof o.ordinal === 'number' ? o.ordinal : i + 1;
			const label = typeof o.label === 'string' ? o.label.trim() : '';
			const status = allowed.includes(o.status as PlanStepStatus)
				? (o.status as PlanStepStatus)
				: 'pending';
			if (!label) {
				problems.push(`步驟 ${i + 1} 缺 label`);
				return;
			}
			steps.push({ ordinal, label: label.slice(0, 200), status, note: str(o.note).slice(0, 300) });
		});
		if (problems.length) return { ok: false, error: problems.join('；') };
		if (steps.length > 24) return { ok: false, error: '計畫至多 24 步' };
		const r = await upsertPlan(ctx.db, {
			runId: ctx.runId,
			sessionId: ctx.sessionId,
			title: str(args.title).slice(0, 120),
			steps
		});
		return { ok: true, planId: r.planId, created: r.created, planEvents: r.events };
	}
};

const componentDev: ToolDef = {
	name: 'component_dev',
	description:
		'提交元件候選原始碼給使用者瀏覽器做真實 Svelte 編譯驗證（Code Agent 開發迴圈核心）。編譯通過會自動套用進 Workshop 編輯器與預覽；失敗回傳錯誤，請修正後重試（每輪至多重試兩次）。通過後停下等使用者回饋，不要擅自註冊。',
	permission: 'read',
	risk: 'low',
	execution: 'client',
	params: {
		name: { type: 'string', description: '元件名（^[a-z][a-z0-9-]{1,30}$）' },
		code: { type: 'string', description: '候選 Svelte 5 原始碼' },
		props: {
			type: 'string',
			description: '預覽 props（JSON 字串，選填）：一併推給 Workshop 預覽',
			optional: true
		}
	},
	summary: (a) => `瀏覽器編譯驗證 ${str(a.name)}`,
	async run(_ctx, args) {
		void args;
		return { ok: false, error: 'client_exec_only（此工具由使用者端執行）' };
	}
};

/** Phase 72 newsletter tool set */
const listSubscribersTool: ToolDef = {
	name: 'list_subscribers',
	description: '電子報訂閱者概況：各狀態數量＋最近名單（email/名稱/狀態/來源；不含 token）。',
	permission: 'read',
	risk: 'low',
	params: {
		status: {
			type: 'string',
			description: '選填過濾：pending/active/unsubscribed',
			optional: true
		},
		limit: { type: 'integer', description: '筆數上限（預設 50，最大 200）', optional: true }
	},
	summary: () => '查看電子報訂閱者',
	async run({ db }, args) {
		const status = args.status ? str(args.status) : undefined;
		const [counts, subs] = await Promise.all([
			countSubscribers(db),
			listSubscribers(db, {
				status: status as SubscriberStatus | undefined,
				limit: Math.min(200, Number(args.limit ?? 50))
			})
		]);
		return {
			ok: true,
			counts,
			subscribers: subs.map((x) => ({
				email: x.email,
				name: x.name,
				status: x.status,
				source: x.source,
				createdAt: new Date(x.createdAt).toISOString().slice(0, 10)
			}))
		};
	}
};

const sendNewsletterTool: ToolDef = {
	name: 'send_newsletter',
	description:
		'把一篇已發布文章用 newsletter 範本發給全部生效訂閱者（單次上限 200；每封自動帶退訂連結）。高風險：發信不可撤回，需站長核准。',
	permission: 'publish',
	risk: 'high',
	params: {
		postSlug: { type: 'string', description: '文章 slug' },
		limit: { type: 'integer', description: '選填：本次最多發幾封（預設 100）', optional: true }
	},
	summary: (a) => `發送電子報：${str(a.postSlug)}`,
	async run({ db, masterKey }, args) {
		const r = await sendNewsletter(db, masterKey, {
			postSlug: str(args.postSlug),
			limit: args.limit !== undefined ? Number(args.limit) : undefined
		});
		return r.sent === 0 && r.errors.length
			? { ok: false, error: r.errors.join('；') }
			: { ok: true, ...r };
	}
};

/** Phase 67b email-template tool set (Agent can read & edit — saves go through versions, activating is high & always reviewed) */
const listEmailTemplates: ToolDef = {
	name: 'list_email_templates',
	description: '列出所有郵件範本（slug／類型／目前版本／啟用與預設狀態）。',
	permission: 'read',
	risk: 'low',
	params: {},
	summary: () => '列出郵件範本',
	async run({ db }) {
		await ensureDefaultTemplates(db);
		const list = await listTemplates(db);
		return {
			ok: true,
			templates: list.map((t) => ({
				slug: t.slug,
				name: t.name,
				type: t.type,
				locale: t.locale,
				version: t.currentVersion,
				enabled: t.enabled,
				isDefault: t.isDefault
			}))
		};
	}
};

const getEmailTemplate: ToolDef = {
	name: 'get_email_template',
	description: '取得郵件範本詳情（subject＋DSL source＋版本清單）。可指定 version 看歷史。',
	permission: 'read',
	risk: 'low',
	params: {
		slug: { type: 'string', description: '範本 slug（如 welcome）' },
		version: { type: 'integer', description: '選填：看特定版本內容', optional: true }
	},
	summary: (a) => `讀取郵件範本 ${str(a.slug)}`,
	async run({ db }, args) {
		const d = await getTemplate(db, str(args.slug));
		if (!d) return { ok: false, error: 'template_not_found' };
		if (args.version !== undefined) {
			const v = d.versions.find((x) => x.version === Number(args.version));
			if (!v)
				return {
					ok: false,
					error: 'version_not_found',
					versions: d.versions.map((x) => x.version)
				};
			return {
				ok: true,
				template: { ...d, subject: v.subject, source: v.source, currentView: v.version }
			};
		}
		return { ok: true, template: d };
	}
};

const saveEmailTemplateVersion: ToolDef = {
	name: 'save_email_template_version',
	description:
		'為郵件範本儲存新版本並啟用（DSL source＋subject）。編譯驗證不過會被拒絕；變數限白名單（site.*／user.*／post.*／comment.*／code／expiry／date）。新範本傳 slug＋type。',
	permission: 'write',
	risk: 'high',
	params: {
		slug: { type: 'string', description: '範本 slug' },
		subject: { type: 'string', description: '主旨模板（可含變數）' },
		source: { type: 'string', description: 'DSL 源碼（<Email> 根）' },
		changeNote: { type: 'string', description: '版本說明', optional: true },
		name: { type: 'string', description: '新範本顯示名（僅新建）', optional: true },
		type: { type: 'string', description: '新範本類型（僅新建）', optional: true }
	},
	summary: (a) => `儲存郵件範本新版本 ${str(a.slug)}`,
	async run({ db }, args) {
		const r = await saveTemplate(db, {
			slug: str(args.slug),
			subject: str(args.subject),
			source: str(args.source),
			changeNote: args.changeNote ? str(args.changeNote) : undefined,
			name: args.name ? str(args.name) : undefined,
			type: args.type ? str(args.type) : undefined,
			createdBy: 'agent'
		});
		return r.ok ? { ok: true, version: r.version } : { ok: false, errors: r.errors };
	}
};

const activateEmailTemplateVersion: ToolDef = {
	name: 'activate_email_template_version',
	description: '切換郵件範本的啟用版本（rollback=true 時把舊版另存為新版本再啟用，保留軌跡）。',
	permission: 'write',
	risk: 'high',
	params: {
		slug: { type: 'string', description: '範本 slug' },
		version: { type: 'integer', description: '要啟用的版本號' },
		rollback: { type: 'boolean', description: 'true＝另存新版回滾（預設直接切換）', optional: true }
	},
	summary: (a) => `切換郵件範本版本 ${str(a.slug)} → v${String(a.version)}`,
	async run({ db }, args) {
		return activateVersion(db, str(args.slug), Number(args.version), {
			forkAsNew: args.rollback === true
		});
	}
};

const sendTestEmailTool: ToolDef = {
	name: 'send_test_email',
	description:
		'用範本實際發送一封測試信（type 或 slug 二擇一；vars 可覆寫白名單變數，未覆寫用示範值）。需要 Email provider 已設定。',
	permission: 'publish',
	risk: 'medium',
	params: {
		to: { type: 'string', description: '收件地址' },
		type: { type: 'string', description: '範本類型（welcome/verify_email/...）', optional: true },
		slug: { type: 'string', description: '或直接指定範本 slug', optional: true },
		vars: {
			type: 'string',
			description: '選填 JSON 覆寫變數，如 {"post.title":"..."}（僅白名單鍵生效）',
			optional: true
		}
	},
	summary: (a) => `發送測試信到 ${str(a.to)}`,
	async run({ db, masterKey }, args) {
		const to = str(args.to);
		const vars: EmailVars = {};
		let varsObj: Record<string, unknown> = {};
		if (typeof args.vars === 'string') {
			try {
				varsObj = JSON.parse(args.vars) as Record<string, unknown>;
			} catch {
				return { ok: false, error: 'vars 需為合法 JSON 物件' };
			}
		} else if (args.vars && typeof args.vars === 'object') {
			varsObj = args.vars as Record<string, unknown>;
		}
		{
			for (const [k, v] of Object.entries(varsObj)) {
				if ((EMAIL_VAR_WHITELIST as readonly string[]).includes(k) && typeof v === 'string')
					(vars as Record<string, string>)[k] = v;
			}
		}
		const type = args.type ? str(args.type) : undefined;
		if (!type && !args.slug) return { ok: false, error: '需要 type 或 slug' };
		return sendTemplatedEmail(db, masterKey, {
			to,
			type: (type ?? 'custom') as TemplateType,
			slug: args.slug ? str(args.slug) : undefined,
			vars
		});
	}
};

const listDbThemes: ToolDef = {
	name: 'list_db_themes',
	description: '列出所有 DB 主題（摘要：id/label/base/version/槽位數/使用中）。',
	permission: 'read',
	risk: 'low',
	params: {},
	summary: () => '列出 DB 主題',
	async run({ db }) {
		const settings = await getSettings(db);
		const ts = await listThemes(db);
		return {
			ok: true,
			themes: ts.map((t) => ({
				id: t.id,
				label: t.label,
				base: t.base,
				version: t.version,
				surfaces: Object.keys(t.surfaces).length,
				active: settings.uiTheme === t.id
			})),
			active: settings.uiTheme
		};
	}
};

const getDbTheme: ToolDef = {
	name: 'get_db_theme',
	description: '取得 DB 主題完整內容（tokens CSS＋各槽位 Svelte 原始碼），供迭代修改。',
	permission: 'read',
	risk: 'low',
	params: { id: { type: 'string', description: 'DB 主題 id（db-<slug>）' } },
	summary: (a) => `讀取 DB 主題 ${str(a.id)}`,
	async run({ db }, args) {
		const t = await getTheme(db, str(args.id));
		return t ? { ok: true, theme: t } : { ok: false, error: 'theme_not_found' };
	}
};

const saveDbTheme: ToolDef = {
	name: 'save_db_theme',
	description:
		'建立/更新 DB 主題（寫入即新版本；高風險審批）。surfaces＝JSON {槽位:{code,css}}，槽位限 Header/Footer/Home/Blog/Search/Post/Archive/Page/About/SeriesIndex/Series；code 留空＝移除該槽位（回落 base）。每槽過靜態安全檢（瀏覽器編譯於工作台/掛載端）。新建傳 slug（小寫 a-z0-9-）＋base；更新傳既有 id。',
	permission: 'write',
	risk: 'high',
	params: {
		slug: { type: 'string', description: '新主題 slug（僅新建）', optional: true },
		id: { type: 'string', description: '既有 db- 主題 id（更新時）', optional: true },
		label: { type: 'string', description: '顯示名' },
		description: { type: 'string', description: '一句話說明', optional: true },
		base: { type: 'string', description: '基底內建主題 id（預設 abstract）', optional: true },
		tokens: { type: 'string', description: '設計令牌 CSS（:root 層）', optional: true },
		surfaces: {
			type: 'string',
			description: '槽位 JSON：{"Home":{"code":"<h1>hi</h1>","css":"..."}}',
			optional: true
		}
	},
	summary: (a) => `儲存 DB 主題 ${str(a.id || a.slug)}`,
	async run({ db }, args) {
		const id = args.id ? str(args.id) : makeThemeId(str(args.slug ?? ''));
		if (!id || !isDbThemeId(id)) return { ok: false, error: '需要合法 id 或新建 slug' };
		let surfaces: Record<string, unknown> = {};
		if (args.surfaces !== undefined) {
			try {
				surfaces = JSON.parse(str(args.surfaces)) as Record<string, unknown>;
			} catch {
				return { ok: false, error: 'surfaces 需為合法 JSON 物件' };
			}
		} else {
			const cur = await getTheme(db, id);
			if (cur) surfaces = cur.surfaces; // surfaces omitted = keep current value
		}
		const issues: string[] = [];
		for (const [k, v] of Object.entries(surfaces)) {
			const code = (v as { code?: string })?.code;
			if (typeof code === 'string' && code.trim())
				issues.push(
					...componentStaticIssues(`dbtheme-${k.toLowerCase()}`, code).map((i) => `${k}: ${i}`)
				);
		}
		if (issues.length) return { ok: false, error: 'static_check_failed', issues };
		const existing = await getTheme(db, id);
		const r = await saveTheme(db, {
			id,
			label: str(args.label) || existing?.label || id,
			behaviors: args.behaviors !== undefined ? str(args.behaviors) : (existing?.behaviors ?? ''),
			description:
				args.description !== undefined ? str(args.description) : (existing?.description ?? ''),
			tokensCss: args.tokens !== undefined ? str(args.tokens) : (existing?.tokensCss ?? ''),
			surfaces,
			base: args.base !== undefined ? str(args.base) : (existing?.base ?? 'abstract')
		});
		if (!r.ok) return { ok: false, errors: r.errors };
		const sv = validateSurfaces(surfaces);
		return {
			ok: true,
			id: r.record.id,
			version: r.record.version,
			surfaces: Object.keys(sv.value ?? {}).length
		};
	}
};

const deleteDbTheme: ToolDef = {
	name: 'delete_db_theme',
	description: '刪除 DB 主題（高風險；使用中主題會被拒——先切換其他主題）。',
	permission: 'write',
	risk: 'high',
	params: { id: { type: 'string', description: 'DB 主題 id' } },
	summary: (a) => `刪除 DB 主題 ${str(a.id)}`,
	async run({ db }, args) {
		const id = str(args.id);
		if (!isDbThemeId(id)) return { ok: false, error: 'need_db_prefixed_id' };
		const settings = await getSettings(db);
		if (settings.uiTheme === id) return { ok: false, error: 'theme_in_use' };
		return (await deleteTheme(db, id)) ? { ok: true } : { ok: false, error: 'theme_not_found' };
	}
};

/* ---- Phase 79c: dynamic content-type tools (79b validator = contract; all writes high & reviewed) ---- */

const CT_KEY_RE = /^[a-z][a-z0-9-]{1,30}$/;

const listContentTypesTool: ToolDef = {
	name: 'list_content_types',
	description: '列出動態內容型別（key/label/欄位/是否啟用）。內建 posts/pages/series 不在此列。',
	permission: 'read',
	risk: 'low',
	params: {},
	summary: () => '列出內容型別',
	async run({ db }) {
		const ts = await listTypes(db);
		return {
			ok: true,
			types: ts.map((t) => ({
				key: t.key,
				label: t.label,
				titleField: t.titleField,
				enabled: t.enabled,
				fields: parseFields(t.fieldsRaw).fields.map(
					(f) => `${f.key}:${f.kind}${f.required ? '*' : ''}`
				)
			}))
		};
	}
};

const createContentTypeTool: ToolDef = {
	name: 'create_content_type',
	description:
		'建立動態內容型別（79b registry）。fields＝JSON 陣列 [{key,kind,required?,max?,options?}...]，kind∈text|markdown|media|repeater|boolean|date|select；至少一個欄位且通常含 title(text,required)。型別 key 會成公開路徑 /key/slug（79d），須避開路由與語系保留字。驗證失敗回錯誤清單——修正後重提，別硬試。條目由站主在 /admin/content 建立。',
	permission: 'write',
	risk: 'high',
	params: {
		key: { type: 'string', description: '型別 key（^[a-z][a-z0-9-]{1,30}$）' },
		label: { type: 'string', description: '顯示名（如「作品集」）' },
		fields: { type: 'string', description: '欄位 manifest JSON 陣列' },
		titleField: { type: 'string', description: '列表標題欄 key（預設 title）', optional: true }
	},
	summary: (a) => `建立內容型別 ${str(a.key)}`,
	async run({ db }, args) {
		const key = str(args.key);
		if (!CT_KEY_RE.test(key)) return { ok: false, error: 'key 不符 ^[a-z][a-z0-9-]{1,30}$' };
		if (await getType(db, key))
			return { ok: false, error: `已存在：${key}（更新請用 update_content_type）` };
		const res = await upsertType(db, {
			key,
			label: str(args.label),
			fieldsJson: str(args.fields),
			titleField: str(args.titleField) || undefined
		});
		return res.ok ? { ok: true, key } : { ok: false, errors: res.errors };
	}
};

const updateContentTypeTool: ToolDef = {
	name: 'update_content_type',
	description:
		'更新動態內容型別 manifest（fields 為整體替換——先 get 再改；label/titleField/enabled 可選調）。key 不存在＝報錯。',
	permission: 'write',
	risk: 'high',
	params: {
		key: { type: 'string', description: '既有型別 key' },
		label: { type: 'string', description: '新顯示名', optional: true },
		fields: { type: 'string', description: '新欄位 manifest JSON（整體替換）', optional: true },
		titleField: { type: 'string', description: '列表標題欄 key', optional: true },
		enabled: { type: 'string', description: '"true"/"false"', optional: true }
	},
	summary: (a) => `更新內容型別 ${str(a.key)}`,
	async run({ db }, args) {
		const key = str(args.key);
		const existing = await getType(db, key);
		if (!existing) return { ok: false, error: `型別不存在：${key}` };
		const res = await upsertType(db, {
			key,
			label: args.label !== undefined ? str(args.label) : existing.label,
			fieldsJson: args.fields !== undefined ? str(args.fields) : existing.fieldsRaw,
			titleField: str(args.titleField) || existing.titleField,
			enabled: args.enabled === undefined ? existing.enabled : str(args.enabled) === 'true'
		});
		return res.ok ? { ok: true, key } : { ok: false, errors: res.errors };
	}
};

const deleteContentTypeTool: ToolDef = {
	name: 'delete_content_type',
	description: '刪除動態內容型別（級聯其下所有條目，不可逆）。',
	permission: 'write',
	risk: 'high',
	params: { key: { type: 'string', description: '型別 key' } },
	summary: (a) => `刪除內容型別 ${str(a.key)}`,
	async run({ db }, args) {
		const key = str(args.key);
		if (!CT_KEY_RE.test(key)) return { ok: false, error: 'key 非法' };
		if (!(await getType(db, key))) return { ok: false, error: `型別不存在：${key}` };
		await deleteType(db, key);
		return { ok: true, deleted: key };
	}
};

const installExtensionTool: ToolDef = {
	name: 'install_extension',
	description:
		'安裝擴展包（P83c manifest）：一個 JSON 同時落地內容型別（create-only）、自訂元件、槽位指派、設定預設，並登記到 Registry（含版本快照，可回滾）。manifest 結構：{id,name,version,contentTypes?,components?,slots?,settings?,capabilities?}。驗證失敗回錯誤清單——修正後重提。',
	permission: 'write',
	risk: 'high',
	params: {
		manifest: { type: 'string', description: '擴展 manifest JSON 字串' }
	},
	summary: (a) => `安裝擴展 ${str(a.manifest).slice(0, 40)}…`,
	async run({ db }, args) {
		const r = await installExtension(db, str(args.manifest), { source: 'ai' });
		if (!r.ok) return { ok: false, errors: r.errors };
		return { ok: true, version: r.version, summary: r.summary };
	}
};

const rollbackExtensionTool: ToolDef = {
	name: 'rollback_extension',
	description:
		'把已安裝擴展回滾到指定版本：還原 Registry 快照並重新落地該版本的型別/元件/槽位/設定（內容型別 create-only 語意不變）。version 來自 list_registry 的版本歷史。',
	permission: 'write',
	risk: 'high',
	params: {
		id: { type: 'string', description: '擴展 id（registry slug）' },
		version: { type: 'string', description: '目標版本號（整數）' }
	},
	summary: (a) => `回滾擴展 ${str(a.id)} → v${str(a.version)}`,
	async run({ db }, args) {
		const id = str(args.id);
		const version = Number.parseInt(str(args.version), 10);
		if (!Number.isFinite(version)) return { ok: false, error: 'version 需為整數' };
		const item = (await listRegistry(db, 'plugin')).find((i) => i.slug === id);
		if (!item) return { ok: false, error: `擴展不存在：${id}` };
		const r = await reapplyVersion(db, item.id, version);
		if (!r.ok) return { ok: false, errors: r.errors };
		invalidatePluginGate();
		return { ok: true, summary: r.summary };
	}
};

export const TOOLS: ToolDef[] = [
	listDbThemes,
	getDbTheme,
	saveDbTheme,
	deleteDbTheme,
	applyDbTheme,
	listSubscribersTool,
	sendNewsletterTool,
	listEmailTemplates,
	getEmailTemplate,
	saveEmailTemplateVersion,
	activateEmailTemplateVersion,
	sendTestEmailTool,
	listPosts,
	getPost,
	missingTranslations,
	listTags,
	siteStats,
	listPages,
	createPage,
	savePage,
	createTag,
	saveTranslation,
	saveTagTranslation,
	listCategories,
	listSeries,
	createSeries,
	updateSeries,
	saveSeriesTranslation,
	addPostToSeries,
	removePostFromSeries,
	createCategory,
	saveCategoryTranslation,
	setPostCategory,
	setPostSeriesOnly,
	publishPost,
	searchPosts,
	createPost,
	deletePost,
	readPage,
	readMarkdown,
	updateMarkdown,
	validateMarkdown,
	listComponentsTool,
	readComponent,
	validateComponentTool,
	createComponentTool,
	updateComponentTool,
	deleteComponentTool,
	inspectComponentTree,
	listRegistryTool,
	componentDev,
	updatePlan,
	listComments,
	setCommentStatus,
	deleteComment,
	getSiteSettings,
	updateSiteSettings,
	getPostSeo,
	updatePostSeo,
	setUiTheme,
	setAgentInstructions,
	setPageNav,
	getAnalytics,
	listMedia,
	deleteMedia,
	listContentTypesTool,
	createContentTypeTool,
	installExtensionTool,
	rollbackExtensionTool,
	updateContentTypeTool,
	deleteContentTypeTool
];
