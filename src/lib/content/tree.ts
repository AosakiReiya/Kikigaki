/**
 * Component Tree — core data model (Everything is Component).
 *
 * Markdown and Components are nodes on the same tree:
 *   Page → Article → Markdown(Container) → [Text|Chart|YouTube|Container…]
 * Phase 16: recursive children (nesting) + JSON serialization (stable interface for AI/Visual Editor).
 * Deliberately NOT "one AST node per markdown token" — markdown-it is the authoritative renderer for
 * text leaves; dual render pipelines inevitably drift; leaf = block-level text (rendered HTML or raw
 * source), structure = container.
 */

/** Plain markdown block (paragraph/list/table/code fence etc.), rendered to HTML */
export interface TextNode {
	type: 'text';
	html: string;
	/** Raw markdown (serialized back for AI/Visual Editor editing; container-nested blocks are relatively indented) */
	source?: string;
}

/** Content Component node (:::container block; children support nesting, Phase 16) */
export interface ComponentNode {
	type: 'component';
	name: string;
	props: Record<string, unknown>;
	/** Child tree of children-mode components (Callout) — nested structure, not prerendered HTML */
	children?: ContentNode[];
}

export type ContentNode = TextNode | ComponentNode;

export interface ContentTree {
	nodes: ContentNode[];
}

/** Text node merging (adjacent text paragraphs combine, reducing placeholder div count) */
export function coalesce(nodes: ContentNode[]): ContentNode[] {
	const out: ContentNode[] = [];
	for (const n of nodes) {
		const last = out[out.length - 1];
		if (n.type === 'text' && last && last.type === 'text') {
			last.html += n.html;
		} else {
			out.push(n);
		}
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* Serialization (Component Tree ↔ JSON) — stable interface for AI/Visual Editor        */
/* ------------------------------------------------------------------ */

/** Serialized form (JSON-safe, no render info beyond HTML; html kept for instant render/diff) */
export interface SerializedTree {
	v: 1;
	nodes: SerializedNode[];
}
export type SerializedNode =
	| { type: 'text'; html: string; source?: string }
	| {
			type: 'component';
			name: string;
			props: Record<string, unknown>;
			children?: SerializedNode[];
	  };

const MAX_DEPTH = 20;

export function serializeTree(nodes: ContentNode[]): SerializedTree {
	return { v: 1, nodes: nodes.map((n) => serializeNode(n, 0)) };
}

function serializeNode(n: ContentNode, depth: number): SerializedNode {
	if (n.type === 'text') {
		const t: SerializedNode = { type: 'text', html: n.html };
		if (n.source !== undefined) (t as { source?: string }).source = n.source;
		return t;
	}
	const c: SerializedNode = { type: 'component', name: n.name, props: n.props };
	if (n.children) c.children = n.children.map((k) => serializeNode(k, depth + 1));
	return c;
}

/** Parse external JSON (incl. AI output); returns null on shape mismatch — callers pick the fallback */
export function deserializeTree(input: unknown): ContentNode[] | null {
	// accepts {v,nodes} or a bare node array
	const nodes = Array.isArray(input)
		? input
		: input && typeof input === 'object' && Array.isArray((input as SerializedTree).nodes)
			? (input as SerializedTree).nodes
			: null;
	if (!nodes) return null;
	const out: ContentNode[] = [];
	for (const raw of nodes) {
		const n = parseSerializedNode(raw, 0);
		if (!n) return null;
		out.push(n);
	}
	return out;
}

function parseSerializedNode(raw: unknown, depth: number): ContentNode | null {
	if (depth > MAX_DEPTH || !raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	if (o.type === 'text') {
		if (typeof o.html !== 'string') return null;
		return {
			type: 'text',
			html: o.html,
			...(typeof o.source === 'string' ? { source: o.source } : {})
		};
	}
	if (o.type === 'component') {
		if (typeof o.name !== 'string') return null;
		if (!o.props || typeof o.props !== 'object' || Array.isArray(o.props)) return null;
		let children: ContentNode[] | undefined;
		if (o.children !== undefined) {
			if (!Array.isArray(o.children)) return null;
			children = [];
			for (const k of o.children) {
				const c = parseSerializedNode(k, depth + 1);
				if (!c) return null;
				children.push(c);
			}
		}
		return { type: 'component', name: o.name, props: o.props as Record<string, unknown>, children };
	}
	return null;
}

/** Depth-first walk (for audits/permission checks/traversal) */
export function walkTree(nodes: ContentNode[], visit: (n: ContentNode) => void): void {
	for (const n of nodes) {
		visit(n);
		if (n.type === 'component' && n.children) walkTree(n.children, visit);
	}
}
