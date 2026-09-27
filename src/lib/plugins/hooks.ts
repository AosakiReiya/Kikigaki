/**
 * Hooks engine (Phase 21) — small, synchronous semantics, error isolation.
 *
 * Design (aligned with WP hooks but tightened for Workers):
 * - the registry = module-level read-only structure (built once at boot; request time only reads) → no cross-request state leaks
 * - emit: handlers run in registration order, each in its own try/catch (a broken plugin never hurts Core)
 * - applyFilter: waterfall (previous output = next input), same error isolation
 * - no async concurrency/cancellation/retries — side effects stay light; heavy work waits for Phase 22 (jobs/queue)
 */
import type { EventMap, FilterMap, Handler, HookContext, Plugin, FilterHandler } from './types';

type ActionReg = { plugin: string; fn: Handler<keyof EventMap> };
type FilterReg = { plugin: string; fn: FilterHandler<keyof FilterMap> };

const actions = new Map<string, ActionReg[]>();
const filters = new Map<string, FilterReg[]>();
const booted = new Set<string>();

/**
 * Enable gate (Phase 22 registry takeover): returning true = that plugin is disabled, skip dispatch.
 * Injected server-side (DB + TTL cache); uninjected = wide open (tests / build-time paths stay dependency-free).
 */
let gate: ((pluginId: string) => boolean | Promise<boolean>) | null = null;

export function setPluginGate(fn: typeof gate): void {
	gate = fn;
}

async function blocked(pluginId: string): Promise<boolean> {
	if (!gate) return false;
	try {
		return await gate(pluginId);
	} catch {
		return false; // a broken gate should rather pass through (availability first; a registry failure never paralyzes content)
	}
}

/* * register a plugin (idempotent by plugin id; duplicate registration ignored = guards against SSR module cache and dev HMR double-runs) */
export function registerPlugin(plugin: Plugin): void {
	if (booted.has(plugin.manifest.id)) return;
	booted.add(plugin.manifest.id);
	for (const [event, fn] of Object.entries(plugin.hooks.on ?? {})) {
		if (!fn) continue;
		const list = actions.get(event) ?? [];
		list.push({ plugin: plugin.manifest.id, fn: fn as ActionReg['fn'] });
		actions.set(event, list);
	}
	for (const [name, fn] of Object.entries(plugin.hooks.filter ?? {})) {
		if (!fn) continue;
		const list = filters.get(name) ?? [];
		list.push({ plugin: plugin.manifest.id, fn: fn as FilterReg['fn'] });
		filters.set(name, list);
	}
}

/* * trigger an action event; any handler throw is only logged, never propagated */
export async function emit<K extends keyof EventMap>(
	event: K,
	payload: EventMap[K],
	ctx: HookContext = {}
): Promise<void> {
	const list = actions.get(event as string);
	if (!list || list.length === 0) return;
	for (const reg of list) {
		if (await blocked(reg.plugin)) continue;
		try {
			await reg.fn(payload, ctx);
		} catch (err) {
			console.error(`[plugin:${reg.plugin}] handler for "${String(event)}" failed:`, err);
		}
	}
}

/* * run the filter chain (waterfall); broken plugins are skipped, the value never corrupted */
export async function applyFilter<K extends keyof FilterMap>(
	name: K,
	initial: FilterMap[K],
	ctx: HookContext = {}
): Promise<FilterMap[K]> {
	const list = filters.get(name as string);
	if (!list || list.length === 0) return initial;
	let acc = initial;
	for (const reg of list) {
		if (await blocked(reg.plugin)) continue;
		try {
			acc = await reg.fn(acc, ctx);
		} catch (err) {
			console.error(`[plugin:${reg.plugin}] filter for "${String(name)}" failed:`, err);
		}
	}
	return acc;
}

/* * debug/testing: current registration overview (read-only snapshot) */
export function hookRegistry(): {
	actions: Record<string, string[]>;
	filters: Record<string, string[]>;
} {
	return {
		actions: Object.fromEntries([...actions].map(([k, v]) => [k, v.map((r) => r.plugin)])),
		filters: Object.fromEntries([...filters].map(([k, v]) => [k, v.map((r) => r.plugin)]))
	};
}
