/**
 * Content Component manifests — pure data layer (imports no .svelte; safe for SSR/parser references).
 * Since Phase 15 this maps to the Registry (versions/schema/permissions); Phase 14 registered first-party statically.
 */

export interface ComponentManifest {
	/**
	 * How ::: block bodies are handled:
	 * - props: key=value lines / JSON, merged into props
	 * - children: rendered to HTML and passed to the component (Callout)
	 * - text: the whole body as a single positional arg (YouTube URL); JSON / key=value lines also supported
	 * - json: the entire JSON body goes into data (CodeDemo's file map)
	 */
	body: 'props' | 'children' | 'text' | 'json';
	/* * single-value parameter name (used by text mode or spaceless info strings) */
	positional?: string;
	/* * layout width: flow = follow the body column width; full = visual elements breaking out of the column */
	width: 'flow' | 'full';
	/* * syntax hints (for editor snippets / docs) */
	usage: string;
}

export const manifests: Record<string, ComponentManifest> = {
	callout: {
		body: 'children',
		width: 'flow',
		usage: ':::callout type=info title="標題" 內文 Markdown :::'
	},
	youtube: {
		body: 'text',
		positional: 'src',
		width: 'full',
		usage: ':::youtube <網址或 ID> 或 id=xxx title="標題" :::'
	},
	post: {
		body: 'props',
		positional: 'slug',
		width: 'flow',
		usage: ':::post slug=文章slug :::'
	},
	chart: {
		body: 'props',
		width: 'flow',
		usage: ':::chart { "type": "bar", "data": { ... } } :::'
	},
	timeline: {
		body: 'props',
		width: 'flow',
		usage: ':::timeline title="標題" [{"date":"2026-01","title":"...","body":"..."}] :::'
	},
	gallery: {
		body: 'props',
		width: 'full',
		usage: ':::gallery cols=3 ["url1","url2"] 或 [{"src":"url","alt":"描述"}] :::'
	},
	card: {
		body: 'props',
		width: 'flow',
		usage: ':::card title="標題" desc="說明" image="url" url="https://..." :::'
	},
	code: {
		body: 'json',
		width: 'flow',
		usage: ':::code lang=ts title="範例" { "file.ts": "原始碼" } :::'
	}
};

export function knownComponentNames(): string[] {
	return Object.keys(manifests);
}
