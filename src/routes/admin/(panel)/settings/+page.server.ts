import { fail } from '@sveltejs/kit';
import { getSettings, updateSettings, SLOGAN_LOCALES, type WorkEntry } from '$lib/server/settings';
import { BASE_LOCALE, getPublishedPostSummaries } from '$lib/server/content';
import { isValidThemeId, type ActiveThemeId } from '$lib/themes';
import {
	listProviders,
	listModels,
	upsertProvider,
	deleteProvider,
	upsertModel,
	deleteModel,
	refreshModels,
	setTaskModel,
	chat,
	isProviderType,
	isAiTask,
	type AiTask
} from '$lib/server/ai';
import {
	listMcpServers,
	upsertMcpServer,
	deleteMcpServer,
	refreshServerTools
} from '$lib/agent/mcp/registry';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, settings: null, ai: null };

	const [settings, providers, models, mcpServers, posts] = await Promise.all([
		getSettings(db),
		listProviders(db),
		listModels(db),
		listMcpServers(db),
		getPublishedPostSummaries(db, BASE_LOCALE, { limit: 50 })
	]);

	return {
		dbReady: true as const,
		settings,
		posts,
		ai: {
			secretSet: Boolean(platform?.env.AI_SECRET),
			providers,
			models
		},
		mcp: { secretSet: Boolean(platform?.env.AI_SECRET), servers: mcpServers }
	};
};

function aiGuard(platform?: App.Platform) {
	const db = platform?.env.DB;
	if (!db) return null;
	return { db, secret: platform?.env.AI_SECRET };
}

export const actions: Actions = {
	save: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const slogans: Record<string, string> = {};
		for (const locale of SLOGAN_LOCALES) {
			slogans[locale] = String(form.get(`slogan_${locale}`) ?? '').trim();
		}

		// 79-i18n: per-locale site identity fields (empty = fall back to site level)
		const bag = (prefix: string): Record<string, string> => {
			const out: Record<string, string> = {};
			for (const locale of SLOGAN_LOCALES)
				out[locale] = String(form.get(`${prefix}_${locale}`) ?? '').trim();
			return out;
		};
		const descriptions = bag('desc');
		const footers = bag('foot');
		const copyrights = bag('copy');
		const aboutBodies: Record<string, string> = {};
		for (const locale of SLOGAN_LOCALES)
			aboutBodies[locale] = String(form.get(`about_${locale}`) ?? '');
		const worksByLocale: Record<string, WorkEntry[]> = {};
		for (const locale of SLOGAN_LOCALES) {
			const rawStr = String(form.get(`works_${locale}`) ?? '').trim();
			if (!rawStr) continue;
			try {
				const raw = JSON.parse(rawStr);
				if (!Array.isArray(raw)) continue;
				const list = raw
					.filter((w) => w && String(w?.title ?? '').trim() && String(w?.href ?? '').trim())
					.map((w) => ({
						title: String(w.title).trim(),
						href: String(w.href).trim(),
						description: String(w.description ?? '').trim() || undefined
					}));
				if (list.length > 0) worksByLocale[locale] = list.slice(0, 12);
			} catch {
				return fail(400, { message: `作品 JSON 格式錯誤（${locale}）` });
			}
		}

		let works: WorkEntry[] = [];
		try {
			const raw = JSON.parse(String(form.get('works') ?? '[]'));
			if (Array.isArray(raw)) {
				works = raw
					.filter((w) => w && String(w?.title ?? '').trim() && String(w?.href ?? '').trim())
					.map((w) => ({
						title: String(w.title).trim(),
						href: String(w.href).trim(),
						description: String(w.description ?? '').trim() || undefined,
						badge: String(w.badge ?? '').trim() || undefined,
						date: String(w.date ?? '').trim() || undefined,
						cover: String(w.cover ?? '').trim() || undefined
					}));
				// 42.4: keep only the first entry per href — prevents each-key collisions and duplicate cards
				const hrefSeen = new Set<string>();
				works = works.filter((w) => (hrefSeen.has(w.href) ? false : (hrefSeen.add(w.href), true)));
			}
		} catch {
			return fail(400, { message: '精選作品 JSON 格式錯誤' });
		}

		await updateSettings(db, {
			logo: String(form.get('logo') ?? '').trim(),
			heroBg: String(form.get('heroBg') ?? '').trim(),
			defaultOgImage: String(form.get('defaultOgImage') ?? '').trim(),
			twitterSite: String(form.get('twitterSite') ?? '').trim(),
			name: String(form.get('name') ?? ''),
			shortName: String(form.get('shortName') ?? ''),
			siteDescription: String(form.get('siteDescription') ?? ''),
			authorName: String(form.get('authorName') ?? ''),
			authorHandle: String(form.get('authorHandle') ?? ''),
			siteUrl: String(form.get('siteUrl') ?? ''),
			footerText: String(form.get('footerText') ?? ''),
			copyright: String(form.get('copyrightText') ?? ''),
			socialsConfig: JSON.stringify(
				Object.fromEntries(
					['github', 'youtube', 'facebook', 'x'].map((id) => [
						id,
						{
							url: String(form.get(`social_${id}_url`) ?? ''),
							display: String(form.get(`social_${id}_display`) ?? 'icon+label')
						}
					])
				)
			),
			timezone: String(form.get('timezone') ?? ''),
			aboutBody: String(form.get('about') ?? '').trim(),
			slogans,
			descriptions,
			footers,
			copyrights,
			aboutBodies,
			worksByLocale,
			works,
			worksBackfill: form.get('worksFill') === 'on'
		});

		return { ok: true, message: '已儲存（全站立即生效）' };
	},

	/* * MCP: create/update (Phase 30) */
	mcpSave: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await upsertMcpServer(ctx.db, ctx.secret, {
			id: String(form.get('id') ?? '') || undefined,
			name: String(form.get('name') ?? ''),
			label: String(form.get('label') ?? ''),
			url: String(form.get('url') ?? ''),
			risk: String(form.get('risk') ?? 'high'),
			timeoutMs: Number(form.get('timeoutMs') ?? '') || 30000,
			instructions: String(form.get('instructions') ?? ''),
			headers: String(form.get('headers') ?? ''),
			enabled: form.get('enabled') !== 'off'
		});
		if (!r.ok) return fail(400, { message: r.error });
		if (r.ok) await refreshServerTools(ctx.db, ctx.secret, r.id).catch(() => {});
		return { ok: true, message: 'MCP server 已儲存（並嘗試刷新目錄）' };
	},

	mcpTest: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await refreshServerTools(ctx.db, ctx.secret, String(form.get('id') ?? ''));
		return r.ok
			? { ok: true, message: `連線成功：${r.count} 個工具` }
			: fail(400, { message: `連線失敗：${r.error}` });
	},

	mcpDelete: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await deleteMcpServer(ctx.db, String(form.get('id') ?? ''));
		return { ok: true, message: '已移除' };
	},

	/* * SITE.md instruction layer (Phase 28) */
	siteMd: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await updateSettings(db, {
			agentInstructions: String(form.get('instructions') ?? '')
				.trim()
				.slice(0, 4000)
		});
		return { ok: true, message: '已儲存 — Agent 下一輪對話即生效' };
	},

	/* * 79e-3 support card surfaces (post/support/about checkbox combination) */
	/** 84 shop settings: currency + support custom copy */
	shop: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await updateSettings(db, {
			commerceCurrency: String(form.get('currency') ?? ''),
			supportIntro: String(form.get('supportIntro') ?? '')
		});
		return { ok: true, message: '商店設定已儲存' };
	},

	support: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const surfaces = ['post', 'support', 'about'].filter((k) => form.get(k) === 'on').join(',');
		await updateSettings(db, { supportSurfaces: surfaces });
		return { ok: true, message: surfaces ? `贊助卡已開啟：${surfaces}` : '贊助卡已關閉' };
	},

	/* * P83a slot assignments (slot → built-in components; JSON sanitized by parseSlotAssignments) */
	slots: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await updateSettings(db, {
			slotAssignments: String(form.get('assignments') ?? '{}').slice(0, 8192)
		});
		return { ok: true, message: '槽位指派已儲存' };
	},

	/* * design themes (Phase 20): click to apply (SSR reads D1; the client keeps its own mirror) */
	theme: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!isValidThemeId(id)) return fail(400, { message: 'unknown_theme' });
		await updateSettings(db, { uiTheme: id as ActiveThemeId });
		return { ok: true, message: `主題已切換：${id}` };
	},

	aiProvider: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await upsertProvider(ctx.db, ctx.secret, {
			id: String(form.get('id') ?? '') || undefined,
			name: String(form.get('name') ?? ''),
			type: (isProviderType(String(form.get('type')))
				? form.get('type')
				: 'openai-compatible') as never,
			baseUrl: String(form.get('baseUrl') ?? ''),
			family: String(form.get('family') ?? ''),
			apiKey: String(form.get('apiKey') ?? ''),
			enabled: form.get('enabled') !== 'off'
		});
		if (!r.ok) return fail(400, { message: r.error });
		return { ok: true, message: 'Provider 已儲存' };
	},

	aiProviderDelete: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await deleteProvider(ctx.db, String(form.get('id') ?? ''));
		return { ok: true, message: 'Provider 已刪除' };
	},

	aiRefresh: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await refreshModels(ctx.db, ctx.secret, String(form.get('id') ?? ''));
		if (!r.ok) return fail(400, { message: r.error });
		return { ok: true, message: `模型目錄已刷新：新增 ${r.added}／共 ${r.total} 個` };
	},

	aiModel: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const caps = form.getAll('caps').map(String) as never;
		const r = await upsertModel(ctx.db, {
			id: String(form.get('id') ?? '') || undefined,
			providerId: String(form.get('providerId') ?? ''),
			modelId: String(form.get('modelId') ?? ''),
			label: String(form.get('label') ?? ''),
			capabilities: caps,
			contextWindow:
				form.get('contextWindow') === null ? undefined : Number(form.get('contextWindow')) || null,
			maxOutputTokens:
				form.get('maxOutputTokens') === null
					? undefined
					: Number(form.get('maxOutputTokens')) || null,
			reasoningBudget:
				form.get('reasoningBudget') === null
					? undefined
					: Number(form.get('reasoningBudget')) || null,
			reasoningEffort:
				form.get('reasoningEffort') === null ? undefined : String(form.get('reasoningEffort')),
			isDefault: form.get('isDefault') === 'on'
		});
		if (!r.ok) return fail(400, { message: r.error });
		return { ok: true, message: '模型已儲存' };
	},

	aiModelDelete: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await deleteModel(ctx.db, String(form.get('id') ?? ''));
		return { ok: true, message: '模型已移除' };
	},

	aiTask: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const task = String(form.get('task') ?? '');
		if (!isAiTask(task)) return fail(400, { message: 'unknown_task' });
		const modelRowId = String(form.get('modelRowId') ?? '') || null;
		const r = await setTaskModel(ctx.db, task as AiTask, modelRowId);
		if (!r.ok) return fail(400, { message: r.error });
		return { ok: true, message: '任務路由已更新' };
	},

	/* * run one minimal chat with the given model (verifies key / routing / response parsing actually work) */
	aiChatTest: async ({ platform, request }) => {
		const ctx = aiGuard(platform);
		if (!ctx) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await chat(ctx.db, ctx.secret, {
			modelRowId: String(form.get('modelRowId') ?? ''),
			messages: [{ role: 'user', content: 'ping — reply with "pong" and nothing else.' }],
			maxTokens: 16
		});
		if (!r.ok) return fail(400, { message: r.error ?? 'chat_failed' });
		return { ok: true, message: `${r.provider} · ${r.model} → ${String(r.text).slice(0, 60)}` };
	}
};
