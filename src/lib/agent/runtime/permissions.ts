/**
 * Permission rule engine (Phase 33; isomorphic to OpenCode permission/evaluate).
 * Rule = (scope, pattern-glob, action); evaluation is "rule chain head→tail, last match wins",
 * chain order: defaults(risk tiers) → global → agent → session.
 * No match → null (fall back to the risk-tier policy).
 */
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '$lib/server/db';
import { permissionRules } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export type RuleAction = 'allow' | 'ask' | 'deny';
const RISKS = ['read', 'low', 'medium', 'high', 'critical'] as const;
export interface PermRule {
	scope: 'global' | 'agent' | 'session';
	scopeName: string | null;
	pattern: string;
	action: RuleAction;
}

/** OpenCode Wildcard.match: * → .*, ? → ., fully anchored, case-insensitive */
export function wildcardMatch(input: string, pattern: string): boolean {
	const esc = (p: string): string =>
		p
			.replace(/[.+^${}()|[\]\\]/g, '\\$&')
			.replace(/\*/g, '.*')
			.replace(/\?/g, '.');
	const test = (p: string): boolean => new RegExp('^' + esc(p) + '$', 'i').test(input);
	if (test(pattern)) return true;
	// "xxx *" also matches bare xxx (command-prefix semantics)
	if (/ \*$/.test(pattern)) return test(pattern.slice(0, -2));
	return false;
}

/** find the last match in the rule chain (findLast; null = no match) */
export function matchRule(rules: PermRule[], toolName: string): PermRule | null {
	for (let i = rules.length - 1; i >= 0; i--) {
		const r = rules[i];
		if (wildcardMatch(toolName, r.pattern)) return r;
	}
	return null;
}

const ACTIONS: RuleAction[] = ['allow', 'ask', 'deny'];

export interface RuleRow extends PermRule {
	id: string;
	createdAt: number;
}

export async function loadRuleSets(
	db: D1Database,
	ctx: { agentName?: string | null; sessionId?: string | null }
): Promise<PermRule[][]> {
	const kit = getDb(db);
	const rows = await kit.select().from(permissionRules);
	const pick = (scope: string, name: string | null | undefined): PermRule[] =>
		rows
			.filter((r) => r.scope === scope && (scope === 'global' || r.scopeName === (name ?? '')))
			.map((r) => ({
				scope: r.scope as PermRule['scope'],
				scopeName: r.scopeName,
				pattern: r.pattern,
				action: r.action as RuleAction
			}));
	return [pick('global', null), pick('agent', ctx.agentName), pick('session', ctx.sessionId)];
}

/**
 * 35A: the single tool-access adjudicator (assembly and dispatch layers share one function = single decision axis).
 * Order: rule deny → agent risk cap → rule allow/ask → default (defer to risk tiers).
 */
export interface AccessVerdict {
	action: 'allow' | 'ask' | 'deny' | 'default';
	reason?: string;
}
export function decideToolAccess(
	sets: PermRule[][],
	ceiling: string,
	toolName: string,
	risk: string
): AccessVerdict {
	const rule = evaluatePermission(sets, toolName);
	if (rule === 'deny')
		return { action: 'deny', reason: `permission_denied_by_rule（站長規則禁止 ${toolName}）` };
	if (
		!RISKS.includes(ceiling as never) ||
		!RISKS.includes(risk as never) ||
		RISKS.indexOf(risk as never) > RISKS.indexOf(ceiling as never)
	) {
		return {
			action: 'deny',
			reason: `risk_ceiling_exceeded（此 agent 上限 ${ceiling}；${toolName} 為 ${risk}）`
		};
	}
	if (rule === 'allow') return { action: 'allow' };
	if (rule === 'ask') return { action: 'ask' };
	return { action: 'default' };
}

/** evaluate across rule chains (later wins; all-miss returns null → risk-tier default) */
export function evaluatePermission(sets: PermRule[][], toolName: string): RuleAction | null {
	const flat = sets.flat();
	const hit = matchRule(flat, toolName);
	return hit?.action ?? null;
}

/* ---- CRUD (admin UI + "approve & remember") ---- */

export async function listRules(db: D1Database): Promise<RuleRow[]> {
	const kit = getDb(db);
	const rows = await kit.select().from(permissionRules);
	return rows
		.map((r) => ({
			id: r.id,
			scope: r.scope as RuleRow['scope'],
			scopeName: r.scopeName,
			pattern: r.pattern,
			action: r.action as RuleAction,
			createdAt:
				typeof r.createdAt === 'object' && r.createdAt instanceof Date
					? r.createdAt.getTime()
					: Number(r.createdAt ?? 0)
		}))
		.sort((a, b) => a.scope.localeCompare(b.scope) || a.createdAt - b.createdAt);
}

export async function addRule(
	db: D1Database,
	input: { scope: string; scopeName?: string; pattern: string; action: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!['global', 'agent', 'session'].includes(input.scope))
		return { ok: false, error: 'scope_invalid' };
	if (!ACTIONS.includes(input.action as RuleAction)) return { ok: false, error: 'action_invalid' };
	const pattern = input.pattern.trim().slice(0, 64);
	if (!pattern || !/^[a-zA-Z0-9_*?.-]+$/.test(pattern))
		return { ok: false, error: 'pattern_invalid（僅 a-z0-9_-.*? 與 *）' };
	if (input.scope !== 'global' && !input.scopeName?.trim())
		return { ok: false, error: 'scope_name_required' };
	const kit = getDb(db);
	const now = new Date();
	await kit
		.insert(permissionRules)
		.values({
			id: crypto.randomUUID(),
			scope: input.scope,
			scopeName: input.scope === 'global' ? null : input.scopeName!.trim().slice(0, 80),
			pattern,
			action: input.action,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing();
	return { ok: true };
}

export async function deleteRule(db: D1Database, id: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(permissionRules).where(eq(permissionRules.id, id));
}

/** "approve & remember": session-scope allow (skipped when the pattern already exists) */
export async function rememberSessionAllow(
	db: D1Database,
	sessionId: string,
	toolName: string
): Promise<void> {
	const kit = getDb(db);
	const existing = await kit
		.select()
		.from(permissionRules)
		.where(
			and(
				eq(permissionRules.scope, 'session'),
				eq(permissionRules.scopeName, sessionId),
				eq(permissionRules.pattern, toolName)
			)
		)
		.limit(1);
	if (existing.length) return;
	const now = new Date();
	await kit.insert(permissionRules).values({
		id: crypto.randomUUID(),
		scope: 'session',
		scopeName: sessionId,
		pattern: toolName,
		action: 'allow',
		createdAt: now,
		updatedAt: now
	});
}

/** clear all remembered rules of a session (AgentPanel "clear memory") */
export async function clearSessionRules(db: D1Database, sessionId: string): Promise<number> {
	const kit = getDb(db);
	const rows = await kit
		.delete(permissionRules)
		.where(and(eq(permissionRules.scope, 'session'), eq(permissionRules.scopeName, sessionId)))
		.returning({ id: permissionRules.id });
	return rows.length;
}
