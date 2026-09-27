import { fail } from '@sveltejs/kit';
import { listAgents, upsertAgent, deleteAgent } from '$lib/agent/runtime/agents';
import { listRules, addRule, deleteRule, clearSessionRules } from '$lib/agent/runtime/permissions';
import { listModels } from '$lib/server/ai';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { agents: [], models: [], rules: [] };
	const [agents, models, rules] = await Promise.all([
		listAgents(db),
		listModels(db),
		listRules(db)
	]);
	return {
		agents,
		rules,
		models: models.map((m) => ({ id: m.id, name: `${m.providerName} / ${m.modelId}` }))
	};
};

export const actions: Actions = {
	save: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const g = (k: string) => String(form.get(k) ?? '');
		const r = await upsertAgent(db, {
			id: g('id') || undefined,
			name: g('name').trim(),
			description: g('description'),
			kind: g('kind'),
			baseMode: g('baseMode'),
			persona: g('persona'),
			modelRowId: g('modelRowId'),
			effort: g('effort'),
			maxSteps: g('maxSteps'),
			riskCeiling: g('riskCeiling'),
			color: g('color'),
			enabled: form.get('enabled') !== 'off'
		});
		return r.ok ? { ok: true, message: 'Agent 已儲存' } : fail(400, { message: r.error });
	},
	/* * rules: create (global / agent scope) */
	ruleAdd: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const g = (k: string) => String(form.get(k) ?? '');
		const target = g('target');
		const r = await addRule(db, {
			scope: target === 'global' || target === '' ? 'global' : 'agent',
			scopeName: target === 'global' || target === '' ? undefined : target,
			pattern: g('pattern'),
			action: g('action')
		});
		return r.ok ? { ok: true, message: '規則已加入' } : fail(400, { message: r.error });
	},
	ruleRemove: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await deleteRule(db, String(form.get('id') ?? ''));
		return { ok: true, message: '規則已移除' };
	},
	ruleClearSession: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const n = await clearSessionRules(db, String(form.get('scopeName') ?? ''));
		return { ok: true, message: `已清除 ${n} 條 session 記憶` };
	},

	remove: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await deleteAgent(db, String(form.get('id') ?? ''));
		return r.ok ? { ok: true, message: '已刪除' } : fail(400, { message: r.error });
	}
};
