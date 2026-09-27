/**
 * P83c — Extension manifest: the declarative contract between an extension
 * and core. One JSON document packages content types, components, slot
 * assignments and settings defaults; `installExtension` lands it on top of
 * the existing registries (nothing new is invented — types go to the 79b
 * content-type registry, components to the workshop/registry pipeline,
 * slots to P83a assignments, settings to the P83b plugin namespace).
 *
 * Validation is structural here; per-field content-type validation is
 * delegated to `upsertType` at install time (same errors the admin UI and
 * the create_content_type agent tool produce).
 */
import { SLOT_NAMES } from '$lib/slots/catalog';

export interface ExtensionContentType {
	key: string;
	label: string;
	titleField?: string;
	/** raw field manifest — same shape as the content-type registry */
	fields: unknown[];
}

export interface ExtensionComponent {
	name: string;
	description?: string;
	/** Svelte 5 source (workshop rules: no external imports) */
	code: string;
}

export interface ExtensionManifest {
	id: string;
	name: string;
	description?: string;
	version: string;
	/** informational core compatibility range (v1: recorded, not enforced) */
	core?: string;
	contentTypes?: ExtensionContentType[];
	components?: ExtensionComponent[];
	/** slot name → component ids to assign (merged, de-duplicated) */
	slots?: Record<string, string[]>;
	/** settings defaults (only written when the plugin has no settings row yet) */
	settings?: Record<string, unknown>;
	capabilities?: string[];
}

const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
const COMPONENT_NAME_RE = /^[a-z][a-z0-9-]{0,39}$/;
const VERSION_RE = /^\d+(\.\d+){0,2}$/;
const MAX_JSON_BYTES = 256 * 1024;
const MAX_CODE_BYTES = 100 * 1024;
const MAX_TYPES = 12;
const MAX_COMPONENTS = 12;

export function validateExtensionManifest(
	raw: unknown
): { ok: true; manifest: ExtensionManifest } | { ok: false; errors: string[] } {
	const errors: string[] = [];
	if (typeof raw === 'string') {
		if (raw.length > MAX_JSON_BYTES) return { ok: false, errors: ['manifest过大（>256KB）'] };
		try {
			raw = JSON.parse(raw);
		} catch {
			return { ok: false, errors: ['manifest 不是合法 JSON'] };
		}
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		return { ok: false, errors: ['manifest 必须是 JSON 物件'] };
	const m = raw as Record<string, unknown>;

	if (typeof m.id !== 'string' || !ID_RE.test(m.id)) errors.push('id：^[a-z][a-z0-9-]{0,39}$');
	if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80)
		errors.push('name：必填，≤80字');
	if (typeof m.version !== 'string' || !VERSION_RE.test(m.version))
		errors.push('version：如 1 / 1.0 / 1.0.0');
	if (
		m.description !== undefined &&
		(typeof m.description !== 'string' || m.description.length > 300)
	)
		errors.push('description：字串≤300');
	if (m.core !== undefined && typeof m.core !== 'string') errors.push('core：字串');
	if (m.capabilities !== undefined && !Array.isArray(m.capabilities))
		errors.push('capabilities：陣列');

	if (m.contentTypes !== undefined) {
		if (!Array.isArray(m.contentTypes) || m.contentTypes.length > MAX_TYPES)
			errors.push(`contentTypes：陣列≤${MAX_TYPES}`);
		else
			m.contentTypes.forEach((t, i) => {
				const ct = t as Record<string, unknown>;
				if (typeof ct?.key !== 'string' || !/^[a-z][a-z0-9-]{1,30}$/.test(ct.key))
					errors.push(`contentTypes[${i}].key 非法`);
				if (typeof ct?.label !== 'string' || !ct.label.trim())
					errors.push(`contentTypes[${i}].label 必填`);
				if (!Array.isArray(ct?.fields) || ct.fields.length === 0)
					errors.push(`contentTypes[${i}].fields：非空陣列`);
			});
	}

	if (m.components !== undefined) {
		if (!Array.isArray(m.components) || m.components.length > MAX_COMPONENTS)
			errors.push(`components：陣列≤${MAX_COMPONENTS}`);
		else
			m.components.forEach((c, i) => {
				const cc = c as Record<string, unknown>;
				if (typeof cc?.name !== 'string' || !COMPONENT_NAME_RE.test(cc.name))
					errors.push(`components[${i}].name：^[a-z][a-z0-9-]{0,39}$`);
				if (typeof cc?.code !== 'string' || !cc.code.trim())
					errors.push(`components[${i}].code 必填`);
				else if (cc.code.length > MAX_CODE_BYTES) errors.push(`components[${i}].code >100KB`);
			});
	}

	if (m.slots !== undefined) {
		if (!m.slots || typeof m.slots !== 'object' || Array.isArray(m.slots))
			errors.push('slots：物件');
		else
			for (const [slot, ids] of Object.entries(m.slots as Record<string, unknown>)) {
				if (!(SLOT_NAMES as readonly string[]).includes(slot)) {
					errors.push(`slots：未知槽位 ${slot}`);
					continue;
				}
				if (
					!Array.isArray(ids) ||
					ids.some((x) => typeof x !== 'string' || !COMPONENT_NAME_RE.test(x))
				)
					errors.push(`slots.${slot}：元件 id 陣列`);
			}
	}

	if (m.settings !== undefined) {
		if (!m.settings || typeof m.settings !== 'object' || Array.isArray(m.settings))
			errors.push('settings：JSON 物件');
		else if (JSON.stringify(m.settings).length > 8192) errors.push('settings：>8KB');
	}

	if (errors.length) return { ok: false, errors };
	return { ok: true, manifest: m as unknown as ExtensionManifest };
}
