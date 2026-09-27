import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable(
	'posts',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		slug: text('slug').notNull().unique(),
		/** per-locale title/summary/body live in post_translations (single source of data) */
		cover: text('cover'),
		/** content type (Phase 52a): article/devlog/experiment/project; enum guarded by the app layer */
		type: text('type').notNull().default('article'),
		/** home-page pinned (admin toggle) */
		pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
		/** series-only display (Phase 58.6): hidden in list contexts; direct links and in-book views unaffected */
		seriesOnly: integer('series_only', { mode: 'boolean' }).notNull().default(false),
		published: integer('published', { mode: 'boolean' }).notNull().default(false),
		publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
		views: integer('views').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('posts_published_at_idx').on(table.published, table.publishedAt)]
);

/** post translations (one row per post × locale); base locale zh-tw is structurally symmetric with the rest */
export const postTranslations = sqliteTable(
	'post_translations',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		title: text('title').notNull(),
		summary: text('summary').notNull().default(''),
		/** full markdown */
		body: text('body').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('post_translations_post_locale_idx').on(table.postId, table.locale),
		index('post_translations_locale_idx').on(table.locale)
	]
);

/** site-wide settings (logo / slogan / hero background etc., key-value) */
export const siteSettings = sqliteTable('site_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/**
 * Custom pages (Phase 20.6) — markdown pages independent of posts:
 * no TOC / no tags / whole-page render, bare path /{slug}, optionally added to navigation.
 */
export const pages = sqliteTable(
	'pages',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		slug: text('slug').notNull().unique(),
		published: integer('published', { mode: 'boolean' }).notNull().default(false),
		/** shown in header navigation */
		showInNav: integer('show_in_nav', { mode: 'boolean' }).notNull().default(false),
		/** nav order (smaller first; 0 = unordered, falls back to creation order) */
		navOrder: integer('nav_order').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('pages_nav_idx').on(table.published, table.showInNav, table.navOrder)]
);

/** custom page translations (one row per page × locale); structure mirrors post_translations */
export const pageTranslations = sqliteTable(
	'page_translations',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		pageId: text('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		title: text('title').notNull(),
		summary: text('summary').notNull().default(''),
		body: text('body').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('page_translations_page_locale_idx').on(table.pageId, table.locale),
		index('page_translations_locale_idx').on(table.locale)
	]
);

/** post version history (auto snapshot every save, git-style restore; split by locale) */
export const postVersions = sqliteTable(
	'post_versions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		/** locale the snapshot belongs to (migration 0005 backfilled zh-tw for existing versions)*/
		locale: text('locale').notNull().default('zh-tw'),
		title: text('title').notNull(),
		summary: text('summary').notNull().default(''),
		body: text('body').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('post_versions_post_idx').on(table.postId, table.createdAt)]
);

/**
 * Post-level SEO overrides (Phase 61) — per (post_id, locale).
 * Every override column is nullable = the sane default (NULL → fallback title/excerpt/auto canonical/default robots).
 */
export const postSeo = sqliteTable(
	'post_seo',
	{
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		seoTitle: text('seo_title'),
		seoDescription: text('seo_description'),
		/** JSON-LD author override (NULL = site owner; Phase 63) */
		seoAuthor: text('seo_author'),
		canonicalUrl: text('canonical_url'),
		robotsIndex: integer('robots_index', { mode: 'boolean' }).notNull().default(true),
		robotsFollow: integer('robots_follow', { mode: 'boolean' }).notNull().default(true),
		/** NULL=auto; -1=nosnippet; n>0=max-snippet:n */
		maxSnippet: integer('max_snippet'),
		/** 'large'|'standard'|'none', NULL=large (Google default) */
		maxImagePreview: text('max_image_preview'),
		ogTitle: text('og_title'),
		ogDescription: text('og_description'),
		ogImage: text('og_image'),
		ogImageAlt: text('og_image_alt'),
		twitterCard: text('twitter_card'),
		/** Article|BlogPosting|NewsArticle (consumed by Phase 63 JSON-LD) */
		schemaType: text('schema_type').notNull().default('Article'),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [primaryKey({ columns: [table.postId, table.locale] })]
);

export const tags = sqliteTable('tags', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull().unique(),
	slug: text('slug').notNull().unique()
});

export const postTags = sqliteTable(
	'post_tags',
	{
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.postId, table.tagId] })]
);

/** tag multilingual display names (name stays the base = URL identity; falls back to base without a translation) */
export const tagTranslations = sqliteTable(
	'tag_translations',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		name: text('name').notNull()
	},
	(table) => [uniqueIndex('tag_translations_tag_locale_idx').on(table.tagId, table.locale)]
);

/** dynamic categories (Phase 55): posts.type stores this table's slug; base name = zh-tw display */
export const categories = sqliteTable('categories', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	sort: integer('sort').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** category multilingual display names (like tags: no translation falls back to base) */
export const categoryTranslations = sqliteTable(
	'category_translations',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		categoryId: text('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		name: text('name').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		uniqueIndex('category_translations_cat_locale_idx').on(table.categoryId, table.locale)
	]
);

/** ordered series (Phase 58): one post in many series; the primary series drives in-post prev/next navigation */
export const series = sqliteTable('series', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	slug: text('slug').notNull().unique(),
	cover: text('cover'),
	published: integer('published', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** series multilingual title/intro (aligned with tag/category translations; no translation falls back to the base zh-tw row) */
export const seriesTranslations = sqliteTable(
	'series_translations',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		seriesId: text('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		title: text('title').notNull(),
		summary: text('summary').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('series_translations_series_locale_idx').on(table.seriesId, table.locale)]
);

/** series × post link: position 1-based, reorderable; at most one is_primary per series (app layer guards) */
export const seriesPosts = sqliteTable(
	'series_posts',
	{
		seriesId: text('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		primaryKey({ columns: [table.seriesId, table.postId] }),
		index('series_posts_series_pos_idx').on(table.seriesId, table.position)
	]
);

export const comments = sqliteTable(
	'comments',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		email: text('email'),
		content: text('content').notNull(),
		ipHash: text('ip_hash'),
		userAgentHash: text('user_agent_hash'),
		status: text('status', { enum: ['pending', 'approved', 'rejected', 'spam'] })
			.notNull()
			.default('pending'),
		/** Phase 70: on-site replies — one-level threads, always pointing at the top-level comment */
		parentId: text('parent_id'),
		/** risk score (0~100+, produced by the rule engine) */
		riskScore: integer('risk_score').notNull().default(0),
		/** triggered reason signals (JSON string array, e.g. ["url_count","burst","spam_pattern"]) */
		riskReasons: text('risk_reasons'),
		/** AI moderation signal (JSON string; null in V1 before AI is wired) */
		moderationResult: text('moderation_result'),
		/** telemetry: content URL count */
		urlCount: integer('url_count').notNull().default(0),
		/** telemetry: content length */
		contentLength: integer('content_length').notNull().default(0),
		/** telemetry: Turnstile verification result (passed / failed / skipped) */
		turnstileResult: text('turnstile_result'),
		/** telemetry: 65k corpus hit count */
		patternHits: integer('pattern_hits').notNull().default(0),
		/** telemetry: sample of corpus hits (JSON string array, first 5, for debugging) */
		patternSamples: text('pattern_samples'),
		moderatedAt: integer('moderated_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		index('comments_post_status_idx').on(table.postId, table.status),
		index('comments_post_parent_idx').on(table.postId, table.parentId),
		index('comments_ip_created_idx').on(table.ipHash, table.createdAt)
	]
);

export const users = sqliteTable('users', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role').notNull().default('admin'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('sessions_user_idx').on(table.userId)]
);

export const pageViews = sqliteTable(
	'page_views',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		path: text('path').notNull(),
		country: text('country'),
		userAgent: text('user_agent'),
		// same path + same visitor (IP hash) + same day recorded once
		ipHash: text('ip_hash').notNull(),
		viewDate: text('view_date').notNull(),
		/** --- reading & traffic-source analytics (0007; old rows NULL = not collected) --- */
		/** viewer locale at pageview time */
		locale: text('locale'),
		/** sessionStorage random id (browser-session level, not fingerprinting) */
		sessionId: text('session_id'),
		/** source domain (domain only; full referer URLs never stored) */
		refDomain: text('ref_domain'),
		/** attribution channel: direct / search / social / referral / email / ads / campaign */
		channel: text('channel'),
		utmSource: text('utm_source'),
		utmMedium: text('utm_medium'),
		utmCampaign: text('utm_campaign'),
		utmContent: text('utm_content'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('page_views_dedup_idx').on(table.path, table.ipHash, table.viewDate),
		index('page_views_date_idx').on(table.viewDate)
	]
);

/** --- AI Layer (Phase 18): Provider / Model directory; keys sealed with AES-256-GCM --- */
export const aiProviders = sqliteTable(
	'ai_providers',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name').notNull().unique(),
		/** openai | anthropic | google | openai-compatible (custom base URL) */
		type: text('type').notNull(),
		/** API root URL (required for openai-compatible; built-in types may keep the default) */
		baseUrl: text('base_url').notNull().default(''),
		/** reasoning family (determines thinking/effort param format): deepseek | dashscope | null = generic */
		family: text('family'),
		/** encrypted API key (aes256gcm$iv$ct; master key from env AI_SECRET) */
		apiKeyEnc: text('api_key_enc').notNull().default(''),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('ai_providers_enabled_idx').on(table.enabled)]
);

export const aiModels = sqliteTable(
	'ai_models',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		providerId: text('provider_id')
			.notNull()
			.references(() => aiProviders.id, { onDelete: 'cascade' }),
		/** provider-side model id (e.g. gpt-5.6 / claude-sonnet-4-5) */
		modelId: text('model_id').notNull(),
		label: text('label').notNull().default(''),
		/** JSON array: text / vision / tools / structured / code */
		capabilities: text('capabilities').notNull().default('[]'),
		contextWindow: integer('context_window'),
		/** single-reply output cap (null = engine default 4096) */
		maxOutputTokens: integer('max_output_tokens'),
		/** thinking budget (null = send no thinking param; set → provider mapping) */
		reasoningBudget: integer('reasoning_budget'),
		/** thinking effort: null = provider default | off/low/medium/high/max */
		reasoningEffort: text('reasoning_effort'),
		/** context ceiling reported by the provider API (ceiling; not a user setting) */
		apiContextWindow: integer('api_context_window'),
		/** provider default model (at most one per provider) */
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		/** task routing (globally unique per task): translation / summarization / seo / component / agent */
		task: text('task'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('ai_models_provider_model_idx').on(table.providerId, table.modelId),
		index('ai_models_task_idx').on(table.task)
	]
);

/** --- Workshop custom components (Phase 17) --- */
export const customComponents = sqliteTable(
	'custom_components',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** :::name identifier (^[a-z][a-z0-9-]*$; official names reserved) */
		name: text('name').notNull().unique(),
		description: text('description').notNull().default(''),
		/** .svelte source (Svelte 5 runes; no external imports) */
		code: text('code').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		aiGenerated: integer('ai_generated', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('custom_components_enabled_idx').on(table.enabled)]
);

/* ==================================================================== */
/* Component/Plugin Registry (Phase 22) — unified install/version/review lifecycle   */
/* ==================================================================== */

/**
 * Registry: component (Workshop components; code bodies still live in custom_components,
 * this manages lifecycle + version snapshots) / plugin (extension directory + enable gate) / theme (directory).
 */
export const registryItems = sqliteTable(
	'registry_items',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		kind: text('kind').notNull(),
		/** global identity: component = :::name; plugin = manifest.id; theme = ThemeId */
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		/** official | community | github | private | ai */
		source: text('source').notNull().default('private'),
		/** currently effective version (from 1; +1 per install/update) */
		version: integer('version').notNull().default(1),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		/** approved = servable; pending = awaiting permission review (default for AI sources) */
		review: text('review').notNull().default('approved'),
		/** JSON array: declared permissions (e.g. read:content / write:settings) */
		capabilities: text('capabilities').notNull().default('[]'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('registry_kind_slug_idx').on(table.kind, table.slug),
		index('registry_enabled_idx').on(table.kind, table.enabled)
	]
);

/** version history: one artifact snapshot per version (component = code; plugin/theme = manifest JSON) */
export const registryVersions = sqliteTable(
	'registry_versions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		itemId: text('item_id')
			.notNull()
			.references(() => registryItems.id, { onDelete: 'cascade' }),
		version: integer('version').notNull(),
		artifact: text('artifact').notNull(),
		note: text('note').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('registry_versions_idx').on(table.itemId, table.version)]
);

/* ------------------------------------------------------------------ */
/* Agent Runtime (Phase 23) — event-sourced state machine: session/run/message/     */
/* event/plan/step/tool_call/approval — eight independent runtime entities.        */
/* ------------------------------------------------------------------ */

/** conversation workspace: holds mode, model and run history */
export const agentSessions = sqliteTable(
	'agent_sessions',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull().default(''),
		/** chat | plan | agent (affects runtime policy, not just a UI label) */
		mode: text('mode').notNull().default('chat'),
		/** points at ai_models.id; null = use the task:agent route */
		modelRowId: text('model_row_id'),
		/** project scope (Workshop = component:{name}; null = global admin) */
		project: text('project'),
		/** chosen agent (null = built-in chat/plan/build per mode) */
		agent: text('agent'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('agent_sessions_user_idx').on(table.userId, table.updatedAt)]
);

/** one autonomous execution (triggered by a user message; pausable/resumable/cancelable/replayable) */
export const agentRuns = sqliteTable(
	'agent_runs',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sessionId: text('session_id')
			.notNull()
			.references(() => agentSessions.id, { onDelete: 'cascade' }),
		/** queued|running|waiting_approval|waiting_client|completed|failed|cancelled */
		status: text('status').notNull().default('queued'),
		/** the user message that triggered this run (persisted before run creation; this column is redundant for restore convenience) */
		input: text('input').notNull().default(''),
		/** environment context snapshot (route/selected component/selection/locale) JSON */
		context: text('context').notNull().default('{}'),
		step: integer('step').notNull().default(0),
		stepsUsed: integer('steps_used').notNull().default(0),
		toolCallsUsed: integer('tool_calls_used').notNull().default(0),
		consecutiveFailures: integer('consecutive_failures').notNull().default(0),
		inputTokens: integer('input_tokens').notNull().default(0),
		outputTokens: integer('output_tokens').notNull().default(0),
		/** risk limits (snapshotted at creation; changing settings mid-flight doesn't affect a running run) */
		maxSteps: integer('max_steps').notNull().default(24),
		maxToolCalls: integer('max_tool_calls').notNull().default(60),
		maxTokenBudget: integer('max_token_budget').notNull().default(200000),
		wallMs: integer('wall_ms').notNull().default(0),
		cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
		error: text('error'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		finishedAt: integer('finished_at', { mode: 'timestamp_ms' })
	},
	(table) => [index('agent_runs_session_idx').on(table.sessionId, table.createdAt)]
);

/** messages (session-level = full cross-run conversation history; the run column aids replay filtering) */
export const agentMessages = sqliteTable(
	'agent_messages',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: text('session_id')
			.notNull()
			.references(() => agentSessions.id, { onDelete: 'cascade' }),
		runId: text('run_id'),
		role: text('role').notNull(),
		content: text('content').notNull(),
		/** assistant: chain-of-thought verbatim (DeepSeek/DashScope multi-round tools must replay it, else 400) */
		reasoning: text('reasoning'),
		/** assistant: [{id,name,args}] JSON */
		toolCalls: text('tool_calls').notNull().default('[]'),
		toolCallId: text('tool_call_id'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('agent_messages_session_idx').on(table.sessionId, table.id)]
);

/** event log (append-only; cursor = autoincrement id for SSE resume; token-level deltas never persisted) */
export const agentEvents = sqliteTable(
	'agent_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: text('session_id')
			.notNull()
			.references(() => agentSessions.id, { onDelete: 'cascade' }),
		runId: text('run_id'),
		type: text('type').notNull(),
		payload: text('payload').notNull().default('{}'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('agent_events_cursor_idx').on(table.sessionId, table.id)]
);

/** plan (runtime object, not markdown; one active plan per run, re-plannable) */
export const agentPlans = sqliteTable(
	'agent_plans',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		runId: text('run_id')
			.notNull()
			.references(() => agentRuns.id, { onDelete: 'cascade' }),
		sessionId: text('session_id').notNull(),
		title: text('title').notNull().default(''),
		/** active | done | superseded */
		status: text('status').notNull().default('active'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('agent_plans_run_idx').on(table.runId)]
);

export const agentPlanSteps = sqliteTable(
	'agent_plan_steps',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		planId: text('plan_id')
			.notNull()
			.references(() => agentPlans.id, { onDelete: 'cascade' }),
		ordinal: integer('ordinal').notNull(),
		label: text('label').notNull(),
		/** pending | active | done | failed | skipped */
		status: text('status').notNull().default('pending'),
		note: text('note').notNull().default(''),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('agent_plan_steps_idx').on(table.planId, table.ordinal)]
);

/** tool call (args re-parsed server-side; approvals bind to this id — clients can't tamper) */
export const agentToolCalls = sqliteTable(
	'agent_tool_calls',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		runId: text('run_id')
			.notNull()
			.references(() => agentRuns.id, { onDelete: 'cascade' }),
		step: integer('step').notNull(),
		/** provider-issued call id (tool-message backfill must match; distinct from this row's PK) */
		providerCallId: text('provider_call_id').notNull().default(''),
		name: text('name').notNull(),
		args: text('args').notNull().default('{}'),
		risk: text('risk').notNull().default('medium'),
		/** pending_approval|executed|failed|denied|superseded|client_pending|queued */
		status: text('status').notNull().default('pending_approval'),
		summary: text('summary').notNull().default(''),
		result: text('result'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' })
	},
	(table) => [index('agent_tool_calls_run_idx').on(table.runId, table.step)]
);

/** human approval (runtime state: run parks at waiting_approval until decided) */
export const agentApprovals = sqliteTable(
	'agent_approvals',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		runId: text('run_id')
			.notNull()
			.references(() => agentRuns.id, { onDelete: 'cascade' }),
		toolCallId: text('tool_call_id')
			.notNull()
			.references(() => agentToolCalls.id, { onDelete: 'cascade' }),
		/** pending | approved | denied */
		status: text('status').notNull().default('pending'),
		decidedBy: text('decided_by'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		decidedAt: integer('decided_at', { mode: 'timestamp_ms' })
	},
	(table) => [index('agent_approvals_run_idx').on(table.runId, table.status)]
);

/** login failure lock (Phase 28·W5) — shared across isolates; reset_at expiry evicts naturally */
export const gscCache = sqliteTable('gsc_cache', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const loginAttempts = sqliteTable('login_attempts', {
	ip: text('ip').primaryKey(),
	count: integer('count').notNull().default(0),
	resetAt: integer('reset_at', { mode: 'timestamp_ms' }).notNull()
});

// ---------- Phase 30: MCP remote servers (OpenCode mcp/ isomorph; Pages is remote-only) ----------

export const mcpServers = sqliteTable('mcp_servers', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	/** short alnum-underscore name (tool naming prefix) */
	name: text('name').notNull().unique(),
	label: text('label').notNull().default(''),
	url: text('url').notNull(),
	/** encrypted extra headers (JSON; same aes256gcm as AI keys) */
	headersEnc: text('headers_enc').notNull().default(''),
	enabled: integer('enabled', { mode: 'boolean' })
		.notNull()
		.$defaultFn(() => true),
	timeoutMs: integer('timeout_ms').notNull().default(30000),
	/** default tool risk (when no rule matches) */
	risk: text('risk').notNull().default('high'),
	instructions: text('instructions').notNull().default(''),
	/** last connection result (for UI display; not a live execution value) */
	status: text('status').notNull().default('unknown'),
	statusNote: text('status_note').notNull().default(''),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** tool directory cache (tools/list result; run starts without a live fetch) */
export const mcpTools = sqliteTable(
	'mcp_tools',
	{
		serverId: text('server_id')
			.notNull()
			.references(() => mcpServers.id, { onDelete: 'cascade' }),
		/** full tool name {server}_{tool} (sanitized) */
		name: text('name').notNull(),
		/** server's original tool name */
		rawName: text('raw_name').notNull(),
		description: text('description').notNull().default(''),
		schemaJson: text('schema_json').notNull().default('{}'),
		cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [primaryKey({ columns: [table.serverId, table.name] })]
);

// ---------- Phase 32: custom Agents (OpenCode agent/ isomorph, persisted to D1) ----------

export const agentDefinitions = sqliteTable('agent_definitions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	/** unique short name (chat/plan/build/explore/…) */
	name: text('name').notNull().unique(),
	description: text('description').notNull().default(''),
	/** primary = selectable main agent; subagent = for task delegation; system = hidden (title/summary etc.) */
	kind: text('kind').notNull().default('primary'),
	/** risk policy base: chat | plan | agent (OpenCode mode's permission equivalent) */
	baseMode: text('baseMode').notNull().default('agent'),
	/** persona section (empty string = fall back to built-in AGENT_PERSONAS[baseMode]) */
	persona: text('persona').notNull().default(''),
	/** model override (null = follow session/routing) */
	modelRowId: text('model_row_id'),
	/** thinking effort override (null = use the model's column) */
	effort: text('effort'),
	/** step budget override (null = DEFAULT_RUN_LIMITS) */
	maxSteps: integer('max_steps'),
	/** risk cap: read/low/medium/high/critical (above it, tools don't enter the set) */
	riskCeiling: text('risk_ceiling').notNull().default('critical'),
	color: text('color'),
	enabled: integer('enabled', { mode: 'boolean' })
		.notNull()
		.$defaultFn(() => true),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

// ---------- Phase 33: permission rules (OpenCode permission ruleset isomorph) ----------

export const permissionRules = sqliteTable(
	'permission_rules',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** global (owner-wide) | agent (by agent name) | session (written by "approve & remember") */
		scope: text('scope').notNull(),
		/** null for scope=global; agent name; session id */
		scopeName: text('scope_name'),
		/** tool name glob ('publish_post', 'mmcp_*', '*') */
		pattern: text('pattern').notNull(),
		action: text('action').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [index('permission_rules_scope_idx').on(table.scope, table.scopeName)]
);

/** Phase 67b: email templates + versions */
export const emailTemplates = sqliteTable(
	'email_templates',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		type: text('type').notNull(),
		locale: text('locale'),
		currentVersion: integer('current_version').notNull().default(1),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('email_templates_type_locale_idx').on(table.type, table.locale)]
);

export const emailTemplateVersions = sqliteTable(
	'email_template_versions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		templateId: text('template_id').notNull(),
		version: integer('version').notNull(),
		subject: text('subject').notNull(),
		source: text('source').notNull(),
		createdBy: text('created_by').notNull().default('user'),
		changeNote: text('change_note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [uniqueIndex('etv_tpl_version_idx').on(table.templateId, table.version)]
);

/** Phase 72: newsletter subscribers (double opt-in; token = confirmation + unsubscribe credential) */
export const subscribers = sqliteTable(
	'subscribers',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		email: text('email').notNull().unique(),
		name: text('name'),
		status: text('status', { enum: ['pending', 'active', 'unsubscribed'] })
			.notNull()
			.default('pending'),
		token: text('token').notNull().unique(),
		source: text('source').notNull().default('comment_form'),
		locale: text('locale'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
		unsubscribedAt: integer('unsubscribed_at', { mode: 'timestamp_ms' })
	},
	(table) => [index('subscribers_status_idx').on(table.status)]
);

/** Phase 78c: DB themes (id always db- prefixed; surfaces = JSON { surface: { code, css } } layered over the base pack) */
export const themes = sqliteTable(
	'themes',
	{
		id: text('id').primaryKey(),
		label: text('label').notNull(),
		description: text('description').notNull().default(''),
		tokensCss: text('tokens_css').notNull().default(''),
		surfaces: text('surfaces').notNull().default('{}'),
		/** JSON {transition?,preloader?,staggerScale?} — enums/numbers only, zero executable surface */
		behaviors: text('behaviors').notNull().default(''),
		base: text('base').notNull().default('abstract'),
		version: integer('version').notNull().default(1),
		enabled: integer('enabled').notNull().default(1),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [index('themes_enabled_idx').on(table.enabled)]
);

/** Phase 79b: dynamic content types (DB manifests, generic by birth; built-in posts/pages/series stay in code) */
export const contentTypes = sqliteTable('content_types', {
	key: text('key').primaryKey(),
	label: text('label').notNull(),
	/** JSON [{key,kind,required?,max?,options?,localized?}...] — drives the dynamic form + validation */
	fields: text('fields').notNull().default('[]'),
	/** which field renders list/detail titles (must exist in fields) */
	titleField: text('title_field').notNull().default('title'),
	enabled: integer('enabled').notNull().default(1),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/** Phase 79b: items of dynamic types (data JSON = base-language values; per-item i18n is backlog) */
export const contentItems = sqliteTable(
	'content_items',
	{
		id: text('id').primaryKey(),
		typeKey: text('type_key').notNull(),
		slug: text('slug').notNull(),
		data: text('data').notNull().default('{}'),
		published: integer('published').notNull().default(0),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		uniqueIndex('content_items_type_slug_idx').on(table.typeKey, table.slug),
		index('content_items_type_pub_idx').on(table.typeKey, table.published)
	]
);

/** Phase 79e: orders (digital goods; provider-neutral — stripe current, wechat/alipay seats reserved) */
export const orders = sqliteTable(
	'orders',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull().default(''),
		status: text('status').notNull().default('pending'), // pending|paid|refunded|failed
		provider: text('provider').notNull().default('stripe'),
		providerSession: text('provider_session'),
		providerRef: text('provider_ref'),
		clientIp: text('client_ip'),
		kind: text('kind').notNull().default('goods'),
		message: text('message'),
		currency: text('currency').notNull().default('usd'),
		totalCents: integer('total_cents').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		index('orders_status_idx').on(table.status),
		uniqueIndex('orders_provider_session_idx').on(table.providerSession)
	]
);

/** order line items (price/title/file key snapshotted at settlement — later type edits never affect historic orders) */
export const orderItems = sqliteTable(
	'order_items',
	{
		id: text('id').primaryKey(),
		orderId: text('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		typeKey: text('type_key').notNull(),
		slug: text('slug').notNull(),
		title: text('title').notNull().default(''),
		priceCents: integer('price_cents').notNull(),
		fileKey: text('file_key').notNull().default('')
	},
	(table) => [index('order_items_order_idx').on(table.orderId)]
);

/** delivery tokens: issued per item after webhook success; the only download entry (unguessable, expirable) */
export const deliveryTokens = sqliteTable(
	'delivery_tokens',
	{
		token: text('token').primaryKey(),
		orderItemId: text('order_item_id')
			.notNull()
			.references(() => orderItems.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		downloads: integer('downloads').notNull().default(0)
	},
	(table) => [uniqueIndex('delivery_tokens_item_idx').on(table.orderItemId)]
);
