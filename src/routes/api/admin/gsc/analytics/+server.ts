import { error, json } from '@sveltejs/kit';
import { siteAnalytics } from '$lib/server/gsc';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days') ?? 28)));
	const r = await siteAnalytics(db, platform?.env.AI_SECRET, days);
	return json(r, { status: r.ok ? 200 : 502 });
};
