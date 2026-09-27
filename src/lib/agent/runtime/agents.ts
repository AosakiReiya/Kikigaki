/**
 * Agent definition resolution (Phase 32; isomorphic to OpenCode agent/).
 * session.agent set → use that definition; otherwise the built-in for session.mode.
 * Definitions provide: persona override, base mode (risk policy), model/effort/maxSteps overrides, risk cap.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '$lib/server/db';
import { agentDefinitions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { AgentMode, Risk } from './types';

export interface AgentDef {
	name: string;
	description: string;
	kind: 'primary' | 'subagent' | 'system';
	baseMode: AgentMode;
	persona: string;
	modelRowId: string | null;
	effort: string | null;
	maxSteps: number | null;
	riskCeiling: Risk;
	color: string | null;
}

const RISKS: Risk[] = ['read', 'low', 'medium', 'high', 'critical'];

/** built-in name↔mode (fallback when no definition row) */
const MODE_TO_BUILTIN: Record<AgentMode, string> = {
	chat: 'chat',
	plan: 'plan',
	agent: 'build'
};
const BUILTIN_MODE: Record<string, AgentMode> = {
	chat: 'chat',
	plan: 'plan',
	build: 'agent',
	explore: 'agent'
};

/** whether risk ≤ cap (cap ceilings; unknown risks always denied) */
export function ceilingAllows(ceiling: Risk, risk: Risk): boolean {
	const c = RISKS.indexOf(ceiling);
	const r = RISKS.indexOf(risk);
	if (c < 0 || r < 0) return false;
	return r <= c;
}

function builtIn(name: string, mode: AgentMode): AgentDef {
	return {
		name,
		description: '',
		kind: 'primary',
		baseMode: mode,
		persona: '',
		modelRowId: null,
		effort: null,
		maxSteps: null,
		riskCeiling: 'critical',
		color: null
	};
}

/** resolve the effective definition from a session (mode + optional agent name); falls back to built-in without a DB row.
 */
export async function resolveAgent(
	db: D1Database,
	session: { mode: AgentMode; agent?: string | null }
): Promise<AgentDef> {
	const name = session.agent?.trim();
	if (name) {
		const kit = getDb(db);
		const [row] = await kit
			.select()
			.from(agentDefinitions)
			.where(eq(agentDefinitions.name, name))
			.limit(1);
		if (row && row.enabled) {
			return {
				name: row.name,
				description: row.description,
				kind: row.kind as AgentDef['kind'],
				baseMode: (BUILTIN_MODE[row.baseMode] ?? row.baseMode) as AgentMode,
				persona: row.persona,
				modelRowId: row.modelRowId,
				effort: row.effort,
				maxSteps: row.maxSteps,
				riskCeiling: row.riskCeiling as Risk,
				color: row.color
			};
		}
		// requested but missing/disabled → fall back to built-in (infer mode from name, then session.mode)
		return builtIn(name, BUILTIN_MODE[name] ?? session.mode);
	}
	return builtIn(MODE_TO_BUILTIN[session.mode], session.mode);
}

/** selectable primary agents (UI dropdown; enabled and kind=primary) */
export async function listSelectableAgents(db: D1Database): Promise<
	{
		name: string;
		description: string;
		baseMode: AgentMode;
		riskCeiling: Risk;
		color: string | null;
	}[]
> {
	const kit = getDb(db);
	const rows = await kit.select().from(agentDefinitions);
	return rows
		.filter((r) => r.enabled && r.kind === 'primary')
		.map((r) => ({
			name: r.name,
			description: r.description,
			baseMode: (BUILTIN_MODE[r.baseMode] ?? r.baseMode) as AgentMode,
			riskCeiling: r.riskCeiling as Risk,
			color: r.color ?? null
		}))
		.sort((a, b) => RISKS.indexOf(a.riskCeiling) - RISKS.indexOf(b.riskCeiling));
}

/** environment block (date/locale/route…; slimmed OpenCode SystemPrompt.environment) */
export function environmentBlock(context: Record<string, unknown>, localeLabel?: string): string {
	const lines: string[] = [];
	const now = new Date();
	lines.push(`日期：${now.toISOString().slice(0, 10)}（${now.toLocaleTimeString('zh-TW')}）`);
	if (localeLabel) lines.push(`介面語系：${localeLabel}`);
	if (typeof context.route === 'string') lines.push(`目前頁面 route：${context.route}`);
	if (typeof context.postSlug === 'string') lines.push(`正在檢視文章：${context.postSlug}`);
	if (typeof context.pageSlug === 'string')
		lines.push(`正在檢視頁面：/${String(context.pageSlug)}`);
	return lines.join('\n');
}

/* ---- admin CRUD (admin UI) ---- */

export interface AgentRow {
	id: string;
	name: string;
	description: string;
	kind: string;
	baseMode: string;
	persona: string;
	modelRowId: string | null;
	effort: string | null;
	maxSteps: number | null;
	riskCeiling: string;
	color: string | null;
	enabled: boolean;
}

const NAME_RE = /^[a-z][a-z0-9_-]{1,30}$/;

export async function listAgents(db: D1Database): Promise<AgentRow[]> {
	const kit = getDb(db);
	const rows = await kit.select().from(agentDefinitions);
	return rows
		.map((r) => ({
			id: r.id,
			name: r.name,
			description: r.description,
			kind: r.kind,
			baseMode: r.baseMode,
			persona: r.persona,
			modelRowId: r.modelRowId,
			effort: r.effort,
			maxSteps: r.maxSteps,
			riskCeiling: r.riskCeiling,
			color: r.color,
			enabled: r.enabled
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertAgent(
	db: D1Database,
	input: {
		id?: string;
		name: string;
		description?: string;
		kind?: string;
		baseMode?: string;
		persona?: string;
		modelRowId?: string;
		effort?: string;
		maxSteps?: string;
		riskCeiling?: string;
		color?: string;
		enabled?: boolean;
	}
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	if (!NAME_RE.test(input.name))
		return { ok: false, error: 'name_invalid（a-z 開頭，2-31 字元 [a-z0-9_-]）' };
	if (['chat', 'plan', 'build', 'explore'].includes(input.name) && !input.id)
		return { ok: false, error: 'name_reserved（內建保留名）' };
	const ceiling = RISKS.includes(input.riskCeiling as Risk)
		? (input.riskCeiling as Risk)
		: 'critical';
	const baseMode = ['chat', 'plan', 'agent'].includes(input.baseMode ?? '')
		? input.baseMode!
		: input.baseMode === 'build'
			? 'agent'
			: 'agent';
	const kit = getDb(db);
	const now = new Date();
	const maxSteps =
		input.maxSteps && Number(input.maxSteps) > 0 ? Math.min(Number(input.maxSteps), 100) : null;
	const vals = {
		name: input.name,
		description: (input.description ?? '').slice(0, 300),
		kind: ['primary', 'subagent', 'system'].includes(input.kind ?? '') ? input.kind! : 'primary',
		baseMode,
		persona: (input.persona ?? '').slice(0, 4000),
		modelRowId: input.modelRowId?.trim() || null,
		effort: input.effort?.trim() || null,
		maxSteps,
		riskCeiling: ceiling,
		color: input.color?.trim() || null,
		updatedAt: now
	};
	if (input.id) {
		await kit.update(agentDefinitions).set(vals).where(eq(agentDefinitions.id, input.id));
		return { ok: true, id: input.id };
	}
	const id = crypto.randomUUID();
	try {
		await kit
			.insert(agentDefinitions)
			.values({ ...vals, id, enabled: input.enabled ?? true, createdAt: now });
	} catch {
		return { ok: false, error: 'name_exists（名稱重複）' };
	}
	return { ok: true, id };
}

export async function deleteAgent(
	db: D1Database,
	id: string
): Promise<{ ok: boolean; error?: string }> {
	const kit = getDb(db);
	const [row] = await kit
		.select()
		.from(agentDefinitions)
		.where(eq(agentDefinitions.id, id))
		.limit(1);
	if (!row) return { ok: false, error: 'not_found' };
	if (['chat', 'plan', 'build', 'explore'].includes(row.name))
		return { ok: false, error: 'builtin_protected（內建 agent 不可刪，可停用）' };
	await kit.delete(agentDefinitions).where(eq(agentDefinitions.id, id));
	return { ok: true };
}
