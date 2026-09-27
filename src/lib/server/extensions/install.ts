/**
 * P83c — Extension installer. `landManifest` applies side effects on top of
 * the existing registries; `installExtension` = land + registry plugin row
 * (row lands LAST so a partial failure never leaves an "active" plugin).
 * Rollback reuses the registry snapshot: `reapplyVersion` = rollbackTo +
 * re-land the old manifest without bumping versions again.
 *
 * Uninstall is data-preserving by design: slot assignments, plugin settings
 * and packaged components are removed, but content types (and their items)
 * are left alone — deleting a type cascades user data and stays an explicit
 * admin action in /admin/content.
 */
import { getDb } from '../db';
import { registryItems } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { installArtifact, listVersions, rollbackTo, uninstall } from '../registry';
import { getType, upsertType } from '../content-items';
import { getSettings, updateSettings } from '../settings';
import { MAX_PER_SLOT, parseSlotAssignments, SLOT_NAMES } from '$lib/slots/catalog';
import { validateExtensionManifest, type ExtensionManifest } from './manifest';
import type { D1Database } from '@cloudflare/workers-types';

export interface LandSummary {
	components: string[];
	typesCreated: string[];
	typesSkipped: string[];
	slotsMerged: string[];
	settingsSeeded: boolean;
	errors: string[];
}

/** Apply manifest side effects (no registry plugin row). */
export async function landManifest(
	db: D1Database,
	manifest: ExtensionManifest,
	source: 'private' | 'ai'
): Promise<LandSummary> {
	const sum: LandSummary = {
		components: [],
		typesCreated: [],
		typesSkipped: [],
		slotsMerged: [],
		settingsSeeded: false,
		errors: []
	};

	// 1) components → registry (+ custom_components sync inside installArtifact)
	for (const c of manifest.components ?? []) {
		const r = await installArtifact(db, {
			kind: 'component',
			slug: c.name,
			name: c.name,
			description: c.description ?? '',
			artifact: c.code,
			source,
			note: `extension:${manifest.id}@${manifest.version}`
		});
		if (r.ok) sum.components.push(c.name);
		else sum.errors.push(`component ${c.name}: ${r.error}`);
	}

	// 2) content types — create-only (never clobber a type the site customized)
	for (const t of manifest.contentTypes ?? []) {
		if (await getType(db, t.key)) {
			sum.typesSkipped.push(t.key);
			continue;
		}
		const r = await upsertType(db, {
			key: t.key,
			label: t.label,
			fieldsJson: JSON.stringify(t.fields),
			titleField: t.titleField
		});
		if (r.ok) sum.typesCreated.push(t.key);
		else sum.errors.push(`type ${t.key}: ${r.errors.join('; ')}`);
	}

	// 3) settings defaults — only when the plugin has no row yet
	const settings = await getSettings(db);
	if (manifest.settings && !settings.pluginSettings[manifest.id]) {
		await updateSettings(db, { pluginSettings: { [manifest.id]: manifest.settings } });
		sum.settingsSeeded = true;
	}

	// 4) slot assignments — merge (append, de-dup, cap per slot)
	if (manifest.slots && Object.keys(manifest.slots).length) {
		const current = parseSlotAssignments(JSON.stringify(settings.slotAssignments));
		let touched = false;
		for (const slot of SLOT_NAMES) {
			const add = manifest.slots[slot];
			if (!add?.length) continue;
			const list = current[slot] ?? [];
			for (const id of add) if (!list.includes(id)) list.push(id);
			current[slot] = list.slice(0, MAX_PER_SLOT);
			sum.slotsMerged.push(slot);
			touched = true;
		}
		if (touched) await updateSettings(db, { slotAssignments: JSON.stringify(current) });
	}

	return sum;
}

/** Validate + land + register (plugin row last). */
export async function installExtension(
	db: D1Database,
	raw: unknown,
	opts: { source?: 'private' | 'ai' } = {}
): Promise<{ ok: true; summary: LandSummary; version: number } | { ok: false; errors: string[] }> {
	const v = validateExtensionManifest(raw);
	if (!v.ok) return { ok: false, errors: v.errors };
	const source = opts.source ?? 'private';
	const summary = await landManifest(db, v.manifest, source);
	const r = await installArtifact(db, {
		kind: 'plugin',
		slug: v.manifest.id,
		name: v.manifest.name,
		description: v.manifest.description ?? '',
		artifact: JSON.stringify(v.manifest),
		capabilities: v.manifest.capabilities ?? [],
		source,
		note: `install ${v.manifest.version}`
	});
	if (!r.ok) return { ok: false, errors: [...summary.errors, `registry: ${r.error}`] };
	return { ok: true, summary, version: r.version };
}

/** Rollback = registry snapshot restore + re-land old manifest side effects. */
export async function reapplyVersion(
	db: D1Database,
	itemId: string,
	version: number
): Promise<{ ok: true; summary: LandSummary } | { ok: false; errors: string[] }> {
	const kit = getDb(db);
	const [item] = await kit
		.select()
		.from(registryItems)
		.where(eq(registryItems.id, itemId))
		.limit(1);
	if (!item || item.kind !== 'plugin') return { ok: false, errors: ['plugin_not_found'] };
	const versions = await listVersions(db, itemId);
	const snap = versions.find((x) => x.version === version);
	if (!snap) return { ok: false, errors: ['version_not_found'] };
	const v = validateExtensionManifest(snap.artifact);
	if (!v.ok) return { ok: false, errors: v.errors };
	const rb = await rollbackTo(db, itemId, version);
	if (!rb.ok) return { ok: false, errors: [rb.error] };
	const summary = await landManifest(
		db,
		v.manifest,
		(item.source as 'private' | 'ai') ?? 'private'
	);
	return { ok: true, summary };
}

/** Data-preserving uninstall (content types stay; see module doc). */
export async function uninstallExtension(
	db: D1Database,
	id: string
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
	const kit = getDb(db);
	const [item] = await kit
		.select()
		.from(registryItems)
		.where(and(eq(registryItems.kind, 'plugin'), eq(registryItems.slug, id)))
		.limit(1);
	if (!item) return { ok: false, errors: ['plugin_not_found'] };
	const v = validateExtensionManifest(
		(await listVersions(db, item.id)).find((x) => x.version === item.version)?.artifact ?? '{}'
	);
	const manifest = v.ok ? v.manifest : null;

	// remove the extension's component ids from every slot
	const settings = await getSettings(db);
	const cleaned = parseSlotAssignments(JSON.stringify(settings.slotAssignments));
	const owned = new Set((manifest?.components ?? []).map((c) => c.name));
	for (const slot of SLOT_NAMES) {
		if (!cleaned[slot]) continue;
		cleaned[slot] = cleaned[slot].filter((x) => !owned.has(x));
		if (!cleaned[slot].length) delete cleaned[slot];
	}
	await updateSettings(db, {
		slotAssignments: JSON.stringify(cleaned),
		pluginSettings: { [id]: {} }
	});

	// uninstall packaged components, then the plugin row
	for (const c of manifest?.components ?? []) {
		const [comp] = await kit
			.select()
			.from(registryItems)
			.where(and(eq(registryItems.kind, 'component'), eq(registryItems.slug, c.name)))
			.limit(1);
		if (comp) await uninstall(db, comp.id);
	}
	const r = await uninstall(db, item.id);
	return r.ok ? { ok: true } : { ok: false, errors: [r.error] };
}
