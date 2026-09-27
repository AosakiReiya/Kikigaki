/**
 * P83a — Theme slot catalog (pure data; safe to import from server modules).
 * A slot is a named insertion point embedded once into theme packs / generic
 * surfaces / admin. Which components render in a slot is decided by the
 * `slot_assignments` site setting (JSON map, order = render order).
 */
export const SLOT_NAMES = [
	'home.hero',
	'post.before',
	'post.after',
	'about.after',
	'item.detail.before',
	'item.detail.after',
	'admin.dashboard'
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

export const SLOT_LABELS: Record<SlotName, string> = {
	'home.hero': '首頁 Hero',
	'post.before': '文章開頭',
	'post.after': '文章末',
	'about.after': '關於頁末',
	'item.detail.before': '條目詳情開頭',
	'item.detail.after': '條目詳情末',
	'admin.dashboard': '後台儀表板'
};

const COMPONENT_RE = /^[a-z][a-z0-9-]{0,39}$/;
export const MAX_PER_SLOT = 8;

/**
 * Parse + sanitize a raw `slot_assignments` JSON string.
 * Unknown slots / malformed component ids are dropped (fail-silent); the
 * result only ever contains catalog slots and safe identifiers.
 */
export function parseSlotAssignments(raw: string | undefined | null): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	if (!raw) return out;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return out;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return out;
	for (const slot of SLOT_NAMES) {
		const v = (parsed as Record<string, unknown>)[slot];
		if (!Array.isArray(v)) continue;
		const ids = v
			.filter((x): x is string => typeof x === 'string' && COMPONENT_RE.test(x))
			.slice(0, MAX_PER_SLOT);
		// de-duplicate while preserving order
		out[slot] = [...new Set(ids)];
	}
	return out;
}

/**
 * Merge the built-in `support-zone` defaults implied by `support_surfaces`
 * into an assignment map (other components untouched). Pure — used by
 * updateSettings and unit-tested directly.
 */
export function mergeSupportAssignments(
	current: Record<string, string[]>,
	surfaces: string
): Record<string, string[]> {
	const list = surfaces.split(',').map((x) => x.trim());
	const out: Record<string, string[]> = {};
	for (const slot of SLOT_NAMES) out[slot] = [...(current[slot] ?? [])];
	const sync = (slot: SlotName, on: boolean) => {
		const has = out[slot].includes('support-zone');
		if (on && !has) out[slot].push('support-zone');
		if (!on && has) out[slot] = out[slot].filter((x) => x !== 'support-zone');
	};
	sync('post.after', list.includes('post'));
	sync('about.after', list.includes('about'));
	// drop empty slots to keep the stored JSON tidy
	for (const slot of SLOT_NAMES) if (out[slot].length === 0) delete out[slot];
	return out;
}
