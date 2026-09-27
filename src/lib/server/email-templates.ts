/**
 * Phase 67b — email template CRUD + versions + send integration
 * Built-in templates seeded idempotently by ensureDefaultTemplates (triggered on first list read).
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { emailTemplateVersions, emailTemplates } from '$lib/server/db/schema';
import type { D1Database } from '@cloudflare/workers-types';
import { compileEmail, type EmailVars } from '$lib/email/compile';
import { sendEmail } from '$lib/server/email';
import { getSettings } from '$lib/server/settings';
import { site } from '$lib/site';

export const TEMPLATE_TYPES = [
	'welcome',
	'verify_email',
	'password_reset',
	'comment_reply',
	'new_comment',
	'newsletter',
	'purchase_thanks',
	'system',
	'custom'
] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export interface TemplateRow {
	id: string;
	slug: string;
	name: string;
	type: string;
	locale: string | null;
	currentVersion: number;
	enabled: boolean;
	isDefault: boolean;
	subject: string;
	source: string;
	updatedAt: number;
}

const DEFAULTS: {
	slug: string;
	name: string;
	type: TemplateType;
	subject: string;
	source: string;
}[] = [
	{
		slug: 'welcome',
		name: '歡迎信',
		type: 'welcome',
		subject: '歡迎來到 {{site.name}}',
		source: `<Email preheader="一封歡迎信">
	<Header />
	<Hero title="你好，{{user.name}}" subtitle="{{site.slogan}}" />
	<Text>感謝你來到 {{site.name}}。這裡記錄技術、生活與動畫——希望有你喜歡的東西。</Text>
	<Button href="{{site.url}}">開始閱讀</Button>
	<Footer unsubscribe="{{user.unsubscribeUrl}}" />
</Email>`
	},
	{
		slug: 'verify-email',
		name: '信箱驗證',
		type: 'verify_email',
		subject: '請驗證你的 Email（{{site.name}}）',
		source: `<Email preheader="驗證連結 24 小時內有效">
	<Header />
	<Text>Hi {{user.name}}，點下面的按鈕完成信箱驗證。</Text>
	<Button href="{{user.verifyUrl}}">驗證信箱</Button>
	<Text color="#8a857e">非本人操作請忽略這封信。</Text>
	<Footer />
</Email>`
	},
	{
		slug: 'password-reset',
		name: '密碼重設',
		type: 'password_reset',
		subject: '你的重設驗證碼：{{code}}',
		source: `<Email preheader="驗證碼 {{expiry}} 分鐘後失效">
	<Header />
	<Text>重設密碼的驗證碼：</Text>
	<Text color="#1c1a17">{{code}}</Text>
	<Text>有效 {{expiry}} 分鐘。不是你本人-requested 請立即改密。</Text>
	<Button href="{{user.resetUrl}}">前往重設</Button>
	<Footer />
</Email>`
	},
	{
		slug: 'comment-reply',
		name: '評論回覆通知',
		type: 'comment_reply',
		subject: '{{comment.author}} 回覆了你',
		source: `<Email preheader="有人回你的話了">
	<Header />
	<Hero title="Hi {{user.name}}" subtitle="你的評論有新回覆" />
	<Text>你在《{{post.title}}》的評論收到了回覆：</Text>
	<CommentCard author="{{comment.author}}" content="{{comment.content}}" url="{{comment.url}}" />
	<Button href="{{post.url}}">查看討論</Button>
	<Footer unsubscribe="{{user.unsubscribeUrl}}" />
</Email>`
	},
	{
		slug: 'new-comment',
		name: '文章新評論通知（作者）',
		type: 'new_comment',
		subject: '《{{post.title}}》有新評論',
		source: `<Email preheader="{{comment.author}} 留言了">
	<Header />
	<PostCard title="{{post.title}}" url="{{post.url}}" summary="{{post.summary}}" date="{{post.date}}" />
	<CommentCard author="{{comment.author}}" content="{{comment.content}}" url="{{comment.url}}" />
	<Button href="{{comment.url}}">去後台審核</Button>
	<Footer />
</Email>`
	},
	{
		slug: 'purchase-thanks',
		name: '購買／贊助感謝信',
		type: 'purchase_thanks',
		subject: '感謝你的支持！（{{order.total}}）',
		source: `<Email preheader="已收到 {{order.total}}">
	<Header />
	<Hero title="感謝支持" subtitle="{{site.slogan}}" />
	<Text>你的訂單已成立：{{order.total}}（共 {{order.itemCount}} 項）。數位商品的下載連結已簽發，随时可取。</Text>
	<Button href="{{order.url}}">查看收據與下載</Button>
	<Footer />
</Email>`
	},
	{
		slug: 'newsletter',
		name: '電子報（最新文章）',
		type: 'newsletter',
		subject: '{{site.name}} 最新文章：{{post.title}}',
		source: `<Email preheader="{{post.title}}">
	<Header />
	<Hero title="{{post.title}}" subtitle="{{site.slogan}}" />
	<PostCard title="{{post.title}}" url="{{post.url}}" summary="{{post.summary}}" date="{{post.date}}" />
	<Button href="{{post.url}}">全文閱讀</Button>
	<Footer unsubscribe="{{user.unsubscribeUrl}}" />
</Email>`
	}
];

/** idempotent seed: fill whichever built-ins are missing (user edits never overwritten) */
export async function ensureDefaultTemplates(db: D1Database): Promise<void> {
	const kit = getDb(db);
	for (const d of DEFAULTS) {
		const [exists] = await kit
			.select({ id: emailTemplates.id })
			.from(emailTemplates)
			.where(eq(emailTemplates.slug, d.slug));
		if (exists) continue;
		const now = Date.now();
		await kit.insert(emailTemplates).values({
			id: `tpl_${d.slug}`,
			slug: d.slug,
			name: d.name,
			type: d.type,
			currentVersion: 1,
			isDefault: true,
			createdAt: new Date(now),
			updatedAt: new Date(now)
		});
		await kit.insert(emailTemplateVersions).values({
			templateId: `tpl_${d.slug}`,
			version: 1,
			subject: d.subject,
			source: d.source,
			createdBy: 'seed',
			changeNote: '內建範本',
			createdAt: new Date(now)
		});
	}
}

export async function listTemplates(db: D1Database): Promise<TemplateRow[]> {
	const kit = getDb(db);
	// single JOIN fetches current versions (kills N+1; (templateId, version) unique guarantees 1:1)
	const rows = await kit
		.select({
			id: emailTemplates.id,
			slug: emailTemplates.slug,
			name: emailTemplates.name,
			type: emailTemplates.type,
			locale: emailTemplates.locale,
			currentVersion: emailTemplates.currentVersion,
			enabled: emailTemplates.enabled,
			isDefault: emailTemplates.isDefault,
			updatedAt: emailTemplates.updatedAt,
			subject: emailTemplateVersions.subject,
			source: emailTemplateVersions.source
		})
		.from(emailTemplates)
		.leftJoin(
			emailTemplateVersions,
			and(
				eq(emailTemplateVersions.templateId, emailTemplates.id),
				eq(emailTemplateVersions.version, emailTemplates.currentVersion)
			)
		)
		.orderBy(desc(emailTemplates.updatedAt));
	return rows.map((r) => ({
		id: r.id,
		slug: r.slug,
		name: r.name,
		type: r.type,
		locale: r.locale,
		currentVersion: r.currentVersion,
		enabled: r.enabled,
		isDefault: r.isDefault,
		subject: r.subject ?? '',
		source: r.source ?? '',
		updatedAt: r.updatedAt?.getTime?.() ?? 0
	}));
}

export interface TemplateDetail extends TemplateRow {
	versions: {
		version: number;
		subject: string;
		source: string;
		createdBy: string;
		changeNote: string | null;
		createdAt: number;
	}[];
}

export async function getTemplate(db: D1Database, slug: string): Promise<TemplateDetail | null> {
	await ensureDefaultTemplates(db);
	const kit = getDb(db);
	const [t] = await kit.select().from(emailTemplates).where(eq(emailTemplates.slug, slug));
	if (!t) return null;
	const versions = await kit
		.select()
		.from(emailTemplateVersions)
		.where(eq(emailTemplateVersions.templateId, t.id))
		.orderBy(desc(emailTemplateVersions.version));
	const cur = versions.find((v) => v.version === t.currentVersion) ?? versions[0];
	return {
		id: t.id,
		slug: t.slug,
		name: t.name,
		type: t.type,
		locale: t.locale,
		currentVersion: t.currentVersion,
		enabled: t.enabled,
		isDefault: t.isDefault,
		subject: cur?.subject ?? '',
		source: cur?.source ?? '',
		updatedAt: t.updatedAt?.getTime?.() ?? 0,
		versions: versions.map((v) => ({
			version: v.version,
			subject: v.subject,
			source: v.source,
			createdBy: v.createdBy,
			changeNote: v.changeNote,
			createdAt: v.createdAt?.getTime?.() ?? 0
		}))
	};
}

export interface SaveTemplateInput {
	slug?: string; // only for new templates
	name?: string;
	type?: string;
	locale?: string | null;
	subject: string;
	source: string;
	changeNote?: string;
	createdBy?: string;
	enabled?: boolean;
}

/** save = validate-compile then create & activate a new version; invalid DSL rejected outright */
export async function saveTemplate(
	db: D1Database,
	input: SaveTemplateInput
): Promise<{ ok: true; version: number; errors?: undefined } | { ok: false; errors: string[] }> {
	const compiled = compileEmail(input.source, sampleVars(), input.subject);
	if (!compiled.ok) return { ok: false, errors: compiled.errors };
	const kit = getDb(db);
	const now = new Date();
	let tplId: string;
	let nextVersion = 1;
	const slug = (input.slug ?? '').trim();
	const [existing] = slug
		? await kit.select().from(emailTemplates).where(eq(emailTemplates.slug, slug))
		: [];
	if (existing) {
		tplId = existing.id;
		const vs = await kit
			.select({ v: emailTemplateVersions.version })
			.from(emailTemplateVersions)
			.where(eq(emailTemplateVersions.templateId, existing.id));
		nextVersion = Math.max(0, ...vs.map((x) => x.v)) + 1;
		await kit
			.update(emailTemplates)
			.set({
				name: input.name?.trim() || existing.name,
				type:
					input.type && (TEMPLATE_TYPES as readonly string[]).includes(input.type)
						? input.type
						: existing.type,
				locale: input.locale === undefined ? existing.locale : input.locale || null,
				currentVersion: nextVersion,
				enabled: input.enabled ?? existing.enabled,
				updatedAt: now
			})
			.where(eq(emailTemplates.id, existing.id));
	} else {
		if (!slug) return { ok: false, errors: ['新範本需要 slug'] };
		tplId = `tpl_${slug}`;
		await kit.insert(emailTemplates).values({
			id: tplId,
			slug,
			name: input.name?.trim() || slug,
			type: (input.type && (TEMPLATE_TYPES as readonly string[]).includes(input.type)
				? input.type
				: 'custom') as TemplateType,
			locale: input.locale || null,
			currentVersion: 1,
			isDefault: false,
			createdAt: now,
			updatedAt: now
		});
	}
	await kit.insert(emailTemplateVersions).values({
		templateId: tplId,
		version: nextVersion,
		subject: input.subject,
		source: input.source,
		createdBy: input.createdBy ?? 'user',
		changeNote: input.changeNote ?? null,
		createdAt: now
	});
	return { ok: true, version: nextVersion };
}

/** activate an existing version (rollback = save the old one as a new version, then switch) */
export async function activateVersion(
	db: D1Database,
	slug: string,
	version: number,
	opts?: { forkAsNew?: boolean }
): Promise<{ ok: boolean; error?: string; version?: number }> {
	const kit = getDb(db);
	const [t] = await kit.select().from(emailTemplates).where(eq(emailTemplates.slug, slug));
	if (!t) return { ok: false, error: '找不到範本' };
	const [v] = await kit
		.select()
		.from(emailTemplateVersions)
		.where(
			and(eq(emailTemplateVersions.templateId, t.id), eq(emailTemplateVersions.version, version))
		);
	if (!v) return { ok: false, error: `找不到版本 ${version}` };
	const now = new Date();
	if (opts?.forkAsNew) {
		const vs = await kit
			.select({ v: emailTemplateVersions.version })
			.from(emailTemplateVersions)
			.where(eq(emailTemplateVersions.templateId, t.id));
		const next = Math.max(0, ...vs.map((x) => x.v)) + 1;
		await kit.insert(emailTemplateVersions).values({
			templateId: t.id,
			version: next,
			subject: v.subject,
			source: v.source,
			createdBy: 'user',
			changeNote: `回滾自 v${version}`,
			createdAt: now
		});
		await kit
			.update(emailTemplates)
			.set({ currentVersion: next, updatedAt: now })
			.where(eq(emailTemplates.id, t.id));
		return { ok: true, version: next };
	}
	await kit
		.update(emailTemplates)
		.set({ currentVersion: version, updatedAt: now })
		.where(eq(emailTemplates.id, t.id));
	return { ok: true, version };
}

export async function setTemplateFlags(
	db: D1Database,
	slug: string,
	flags: { enabled?: boolean; isDefault?: boolean }
): Promise<void> {
	const kit = getDb(db);
	const [t] = await kit
		.select({ id: emailTemplates.id })
		.from(emailTemplates)
		.where(eq(emailTemplates.slug, slug));
	if (!t) return;
	if (flags.isDefault) {
		// only one default per type
		const [cur] = await kit
			.select({ type: emailTemplates.type })
			.from(emailTemplates)
			.where(eq(emailTemplates.id, t.id));
		await kit
			.update(emailTemplates)
			.set({ isDefault: false })
			.where(eq(emailTemplates.type, cur?.type ?? ''));
	}
	await kit
		.update(emailTemplates)
		.set({
			...(flags.enabled !== undefined ? { enabled: flags.enabled } : {}),
			...(flags.isDefault !== undefined ? { isDefault: flags.isDefault } : {}),
			updatedAt: new Date()
		})
		.where(eq(emailTemplates.id, t.id));
}

/** pick a template by type (+ optional locale): exact locale → locale-less default → any of the type */
export async function pickTemplate(
	db: D1Database,
	type: TemplateType,
	locale?: string
): Promise<TemplateRow | null> {
	const all = await listTemplates(db);
	const pool = all.filter((t) => t.type === type && t.enabled);
	return (
		(locale ? pool.find((t) => t.locale === locale) : undefined) ??
		pool.find((t) => t.isDefault) ??
		pool.find((t) => !t.locale) ??
		pool[0] ??
		null
	);
}

/** template send: variables assembled by callers (allowlisted keys); locale picks the version */
export async function sendTemplatedEmail(
	db: D1Database,
	masterKey: string | undefined,
	opts: { to: string; type: TemplateType; vars: EmailVars; locale?: string; slug?: string }
): Promise<{ ok: boolean; error?: string; subject?: string }> {
	await ensureDefaultTemplates(db); // first use auto-seeds (system triggers like reply notifications don't depend on admin having opened the page)
	const tpl: TemplateRow | null = opts.slug
		? await getTemplate(db, opts.slug)
		: await pickTemplate(db, opts.type, opts.locale);
	if (!tpl) return { ok: false, error: `找不到可用範本（${opts.type}）` };
	const settings = await getSettings(db);
	const vars: EmailVars = {
		'site.name': settings.name || 'Kikigaki',
		'site.url': site.url,
		'site.slogan': settings.slogans?.[opts.locale ?? 'zh-tw'] ?? settings.slogans?.['zh-tw'] ?? '',
		date: new Date().toISOString().slice(0, 10),
		...opts.vars
	};
	const compiled = compileEmail(tpl.source, vars, tpl.subject);
	if (!compiled.ok) return { ok: false, error: `範本編譯失敗：${compiled.errors.join('；')}` };
	const r = await sendEmail(db, masterKey, {
		to: opts.to,
		subject: compiled.subject || tpl.subject,
		html: compiled.html,
		text: compiled.text,
		template: tpl.slug
	});
	if (!r.ok) return { ok: false, error: r.error };
	return { ok: true, subject: tpl.subject };
}

// sampleVars moved to $lib/email/samples (client-safe); re-export keeps existing imports working
import { sampleVars } from '$lib/email/samples';
export { sampleVars };
