import { parseDocument } from 'yaml';

/** Parse YAML metadata without enabling executable engines or unlimited aliases. */
export function parseFrontmatter(source: string): {
	data: Record<string, unknown>;
	content: string;
} {
	const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const match = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(normalized);
	if (!match) return { data: {}, content: normalized };
	const document = parseDocument(match[1]);
	if (document.errors.length || document.warnings.length) {
		throw new Error('Invalid YAML frontmatter', {
			cause: document.errors[0] ?? document.warnings[0]
		});
	}
	const data: unknown = document.toJS({ maxAliasCount: 50 });
	if (data !== null && (typeof data !== 'object' || Array.isArray(data))) {
		throw new Error('Frontmatter must be a YAML mapping');
	}
	return {
		data: (data ?? {}) as Record<string, unknown>,
		content: normalized.slice(match[0].length)
	};
}
