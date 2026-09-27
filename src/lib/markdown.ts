import MarkdownIt from 'markdown-it';
import GithubSlugger from 'github-slugger';
import type { ContentNode, ContentTree } from './content/tree';
import { coalesce } from './content/tree';
import { parseParams, parseBody } from './content/props';
import { manifests } from './content-components/manifests';

export interface TocItem {
	id: string;
	text: string;
	depth: number;
}

/** Render context: TOC collection only (scanner shares one toc array + slugger across text blocks) */
interface MdEnv {
	[key: string]: unknown;
	toc?: TocItem[];
}

const slugger = new GithubSlugger();

/**
 * Runtime Markdown → Component Tree / HTML rendering (replaced mdsvex build-time compile after v1.5 CMS).
 * - `html: false`: raw HTML never output (admin content is author-only, but still guarded)
 * - heading ids use github-slugger (consistent with front-end TOC / anchor jumps)
 * - `:::name ...` (custom line scanner, supports nesting + DB custom names) → Content Component placeholder nodes,
 *   mounted to real Svelte components client-side via use:hydrateComponents
 */
const md = new MarkdownIt({
	html: false,
	linkify: true,
	typographer: true,
	breaks: true
});

/** Heading rule: generate slug id and collect TOC */
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
	const depth = Number(tokens[idx].tag.slice(1));
	const inline = tokens[idx + 1];
	const raw = inline?.children
		? inline.children
				.filter((t: { type: string }) => t.type === 'text' || t.type === 'code_inline')
				.map((t: { content: string }) => t.content)
				.join('')
		: (inline?.content ?? '');
	const text = raw.replace(/[*_`~]/g, '').trim();

	if (depth >= 2 && depth <= 3) {
		const id = slugger.slug(text);
		(env as MdEnv).toc?.push({ id, text, depth });
		tokens[idx].attrSet('id', id);
	}

	return self.renderToken(tokens, idx, options);
};

/* ------------------------------------------------------------------ */
/* container props 輔助（掃描器見下方 buildContainerNode）              */
/* ------------------------------------------------------------------ */

/**
 * text 模式：info 與內文皆可承載值——
 * 含 `=` 的片段走 key=value；JSON 走 parseBody；其餘整段視為 positional（網址常用）。
 */
function textProps(
	manifest: (typeof manifests)[string],
	rest: string,
	inner: string
): Record<string, unknown> {
	const pos = manifest.positional ?? 'src';
	const props: Record<string, unknown> = {};
	const body = inner.trim().replace(/\s*\n\s*/g, ' ');
	if (rest) {
		if (rest.includes('=')) Object.assign(props, parseParams(rest));
		else props[pos] = rest;
	}
	if (body) {
		if (body.startsWith('{') || body.startsWith('[')) Object.assign(props, parseBody(body));
		else if (/^[\w-]+=/.test(body)) Object.assign(props, parseParams(body));
		else if (!(pos in props)) props[pos] = body;
	}
	return props;
}

function componentOpenHtml(
	name: string,
	props: Record<string, unknown>,
	childrenHtml?: string
): string {
	const parts = [
		// not-prose：讓 @tailwindcss/typography 的 .prose 後代規則（img 外距、連結底線等）
		// 整棵子樹跳過 — component 自管樣式，不被文章排版滲透
		`<div class="cc not-prose" data-cc="${name}" data-cc-mode="mount"`,
		`data-cc-props="${escapeAttr(JSON.stringify(props))}"`
	];
	if (childrenHtml !== undefined) {
		parts.push(`data-cc-children="${escapeAttr(childrenHtml)}"`);
	}
	return `${parts.join(' ')}>`;
}

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ */
/* Markdown → Component Tree（自研行掃描器：markdown-it-container 無法  */
/* 正確嵌套同長度 :::——其閉合掃描會把內層 ::: 誤判為外層閉合）           */
/* ------------------------------------------------------------------ */

const OPEN_RE = /^ {0,3}(:{3,})[ \t]*([A-Za-z][\w-]*)?[ \t]*(.*)$/;
const CODE_RE = /^ {0,3}(```|~~~)/;

interface FenceInfo {
	markers: number;
	name?: string;
	rest: string;
}

function parseFence(line: string): FenceInfo | null {
	const m = OPEN_RE.exec(line);
	if (!m) return null;
	return { markers: m[1].length, name: m[2] || undefined, rest: (m[3] ?? '').trim() };
}

/** Find this level's container closing line (bare ::: with sufficient length); nested named blocks skipped whole; code fences not recognized inside */
function findContainerClose(
	lines: string[],
	from: number,
	markerLen: number,
	customNames?: Set<string>
): number {
	let i = from;
	while (i < lines.length) {
		const line = lines[i];
		if (CODE_RE.test(line)) {
			i = findCodeFenceEnd(lines, i + 1, line.trim().slice(0, 3)) + 1;
			continue;
		}
		const f = parseFence(line);
		if (f && f.markers >= markerLen) {
			if (f.name) {
				// named blocks (known or not) can't close this level; known blocks are skipped whole
				if (knownComponent(f.name, customNames))
					i = findContainerClose(lines, i + 1, f.markers, customNames) + 1;
				else i++;
				continue;
			}
			return i;
		}
		i++;
	}
	return lines.length; // unclosed → auto-close at document end
}

function findCodeFenceEnd(lines: string[], from: number, marker: string): number {
	for (let i = from; i < lines.length; i++) {
		const t = lines[i].trim();
		if (t.startsWith(marker) && t.replace(new RegExp(`\\${marker[0]}`, 'g'), '').trim() === '') {
			return i;
		}
	}
	return lines.length;
}

/** known components = official manifests or this round's custom names (customNames, from DB) */
function knownComponent(name: string | undefined, customNames?: Set<string>): boolean {
	if (!name) return false;
	return name in manifests || customNames?.has(name) === true;
}

/** strip common indent from children bodies (nested ::: is usually indented; normalize before recursion) */
function dedentLines(lines: string[]): string[] {
	const indents = lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length);
	if (indents.length === 0) return lines;
	const min = Math.min(...indents);
	if (min === 0) return lines;
	return lines.map((l) => (l.trim() ? l.slice(Math.min(min, /^ */.exec(l)![0].length)) : l));
}

function scanBlocks(
	lines: string[],
	toc: TocItem[] | undefined,
	customNames?: Set<string>
): ContentNode[] {
	const nodes: ContentNode[] = [];
	const text: string[] = [];

	const flush = () => {
		const seg = text.join('\n').trim();
		text.length = 0;
		if (!seg) return;
		nodes.push({
			type: 'text',
			html: md.render(seg, toc ? { toc } : {}),
			source: seg
		});
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		// code fence: whole block becomes text (internal ::: not recognized)
		if (CODE_RE.test(line)) {
			const end = findCodeFenceEnd(lines, i + 1, line.trim().slice(0, 3));
			for (let k = i; k <= end && k < lines.length; k++) text.push(lines[k]);
			i = end + 1;
			continue;
		}
		const f = parseFence(line);
		if (f?.name && knownComponent(f.name, customNames)) {
			const close = findContainerClose(lines, i + 1, f.markers, customNames);
			const node = buildContainerNode(
				`${f.name}${f.rest ? ` ${f.rest}` : ''}`,
				lines.slice(i + 1, close),
				toc,
				customNames
			);
			if (node) {
				flush();
				nodes.push(node);
			} else {
				for (let k = i; k < close && k < lines.length; k++) text.push(lines[k]);
			}
			i = close + 1;
			continue;
		}
		text.push(line);
		i++;
	}
	flush();
	return coalesce(nodes);
}

/** build a container node from info + body lines (children mode recurses scanBlocks → arbitrary nesting depth) */
function buildContainerNode(
	info: string,
	innerLines: string[],
	toc?: TocItem[],
	customNames?: Set<string>
): ContentNode | null {
	const trimmed = info.trim();
	const name = trimmed.split(/\s/)[0];
	// custom components are always children containers (body may nest further; props come from info-line key=value)
	const manifest =
		manifests[name] ??
		(customNames?.has(name) ? { body: 'children', width: 'flow', usage: '' } : undefined);
	if (!manifest) return null;
	const rest = trimmed.slice(name.length).trim();
	const inner = innerLines.join('\n');

	if (manifest.body === 'children') {
		return {
			type: 'component',
			name,
			props: parseParams(rest),
			children: scanBlocks(dedentLines(innerLines), toc, customNames)
		};
	}
	if (manifest.body === 'text') {
		return { type: 'component', name, props: textProps(manifest, rest, inner) };
	}
	if (manifest.body === 'json') {
		let data: unknown = {};
		try {
			data = JSON.parse(inner.trim() || '{}');
		} catch {
			/* invalid JSON: component side degrades to "missing data" */
		}
		return { type: 'component', name, props: { data, ...parseParams(rest) } };
	}
	if (manifest.positional && rest && !rest.includes(' ') && !rest.includes('=')) {
		return { type: 'component', name, props: { [manifest.positional]: rest } };
	}
	return { type: 'component', name, props: { ...parseParams(rest), ...parseBody(inner) } };
}

/**
 * Parse Markdown into a Component Tree (Phase 16: nested subtrees + serialization-ready).
 * Live parsing is uncached; list hot paths don't render bodies and never come through here.
 */
export function buildContentTree(
	body: string,
	customNames?: Set<string>
): ContentTree & { toc: TocItem[] } {
	slugger.reset();
	const toc: TocItem[] = [];
	// Phase 44: CRLF guard — JS regex `.` doesn't eat \r; trailing \r makes every ::: scan miss;
	// render entry normalizes to LF (covers dirty line endings from editor inserts/imports/LLM output)
	const lf = body.replace(/\r\n?/g, '\n');
	return { nodes: scanBlocks(lf.split('\n'), toc, customNames), toc };
}

/** node → placeholder HTML (nested children serialize into data-cc-children, mounted recursively by hydration) */
function renderNode(n: ContentNode): string {
	if (n.type === 'text') return n.html;
	const childrenHtml = n.children ? n.children.map(renderNode).join('\n') : undefined;
	return componentOpenHtml(n.name, n.props, childrenHtml) + '</div>';
}

/** Component Tree → HTML (text nodes pass through; component nodes become placeholder divs, nesting supported) */
export function renderTree(tree: ContentTree): string {
	return tree.nodes.map(renderNode).join('\n');
}

/** render Markdown → { html, toc } (cached by body content) */
const CACHE = new Map<string, { html: string; toc: TocItem[] }>();

export function renderMarkdown(
	body: string,
	customNames?: Set<string>
): { html: string; toc: TocItem[] } {
	const key = customNames?.size ? `${body}\u0000${[...customNames].sort().join(',')}` : body;
	const cached = CACHE.get(key);
	if (cached) return cached;
	const tree = buildContentTree(body, customNames);
	const result = { html: renderTree(tree), toc: tree.toc };
	CACHE.set(key, result);
	return result;
}

/** reading time (minutes) — same computation as v1: CJK per char, Latin per word */
export function computeReadingMinutes(body: string): number {
	const text = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
	const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
	const latin = text
		.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
		.split(/\s+/)
		.filter(Boolean).length;
	const minutes = cjk / 400 + latin / 200;
	return Math.max(1, Math.round(minutes));
}
