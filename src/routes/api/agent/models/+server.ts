import { error, json } from '@sveltejs/kit';
import { listModels } from '$lib/server/ai';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const models = await listModels(db);
	return json({
		models: models.map((m) => ({
			id: m.id,
			name: `${m.providerName} · ${m.modelId}`,
			isDefault: m.isDefault,
			contextWindow: m.contextWindow,
			maxOutputTokens: m.maxOutputTokens,
			reasoningBudget: m.reasoningBudget,
			apiContextWindow: m.apiContextWindow ?? null
		}))
	});
};
