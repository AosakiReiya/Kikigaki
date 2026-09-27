/**
 * Phase 67b — Email compiler: DSL → email-safe HTML + variable allowlist validation
 * Compile flow: allowlist check ({{a.b}}) → interpolation (HTML escape) → parse → component render → document assembly.
 */
import { site } from '$lib/site';
import { parseDsl, type DslAny, type DslNode } from './dsl';
import { componentByName, type EmailCtx } from './components';

/** Variable allowlist (grouped: renderers supply by type; unlisted vars fail compile outright) */
export const EMAIL_VAR_WHITELIST = [
	'site.name',
	'site.url',
	'site.slogan',
	'site.logo',
	'user.name',
	'user.email',
	'user.verifyUrl',
	'user.resetUrl',
	'user.unsubscribeUrl',
	'post.title',
	'post.url',
	'post.summary',
	'post.date',
	'comment.author',
	'comment.content',
	'comment.url',
	'order.total',
	'order.itemCount',
	'order.url',
	'code',
	'expiry',
	'date'
] as const;

export type EmailVars = Partial<Record<(typeof EMAIL_VAR_WHITELIST)[number], string>>;

const VAR_REF = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Extract all variable references from source (for the UI inspector) */
export function usedVars(source: string): string[] {
	const out = new Set<string>();
	let m: RegExpExecArray | null;
	VAR_REF.lastIndex = 0;
	while ((m = VAR_REF.exec(source)) !== null) out.add(m[1]);
	return [...out];
}

/** Interpolation: outside allowlist → error; inside → replace with escaped value */
function interpolate(source: string, vars: EmailVars, errors: string[]): string {
	return source.replace(VAR_REF, (_all, name: string) => {
		if (!(EMAIL_VAR_WHITELIST as readonly string[]).includes(name)) {
			errors.push(`非法變數 {{{{${name}}}}}（白名單外）`);
			return '';
		}
		const raw = (vars as Record<string, string | undefined>)[name] ?? '';
		return raw
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	});
}

export interface CompileResult {
	ok: boolean;
	html: string;
	text: string;
	/** 插值後的主題（供實際發送） */
	subject: string;
	errors: string[];
}

function renderNode(node: DslAny, ctx: EmailCtx, errors: string[]): string {
	if (node.kind === 'text') return node.value; // 來源已整體 escape 過（插值端），文字不再二次處理標籤
	const def = componentByName(node.name);
	if (!def) {
		errors.push(`未知元件 <${node.name}>`);
		return '';
	}
	const kids = node.children.map((c) => renderNode(c, ctx, errors)).join('');
	return def.render(node, ctx, kids);
}

/** DSL 純文字版（text/plain alternative）：抽 text 節點＋關鍵 props */
function plainOf(root: DslNode): string {
	const lines: string[] = [];
	const walk = (n: DslAny): void => {
		if (n.kind === 'text') {
			if (n.value.trim()) lines.push(n.value.trim());
			return;
		}
		if (n.name === 'Button' || n.name === 'PostCard' || n.name === 'CommentCard') {
			const kids = n.children
				.filter((c) => c.kind === 'text')
				.map((c) => (c as { value: string }).value.trim());
			const label = kids[0] || n.props.title || n.props.author || '';
			const url = n.props.href || n.props.url || '';
			if (label) lines.push(url ? `${label} ${url}` : String(label));
			if (n.props.summary) lines.push(String(n.props.summary));
			if (n.props.content) lines.push(String(n.props.content));
			return;
		}
		for (const c of n.children) walk(c);
	};
	for (const c of root.children) walk(c);
	return lines.join('\n\n');
}

/**
 * 編譯入口。subject 也會被插值（供 sendTemplatedEmail 複用同一 vars）。
 */
export function compileEmail(source: string, vars: EmailVars, subject = ''): CompileResult {
	const errors: string[] = [];
	const interpolated = interpolate(source, vars, errors);
	const subjectText = interpolate(subject, vars, errors);
	const { root, errors: parseErrors } = parseDsl(interpolated);
	errors.push(...parseErrors);
	if (!root)
		return {
			ok: errors.length === 0,
			html: '',
			text: '',
			subject: subjectText,
			errors: [...new Set(errors)]
		};
	if (root.name !== 'Email') {
		errors.push('根元件必須是 <Email>');
		return { ok: false, html: '', text: '', subject: subjectText, errors: [...new Set(errors)] };
	}
	const ctx: EmailCtx = {
		siteName: (vars['site.name'] ?? 'Kikigaki').replace(/&amp;/g, '&').replace(/</g, ''),
		siteUrl: vars['site.url'] ?? site.url, // 出廠中性兜底；送件路徑永遠注入實值
		slogan: (vars['site.slogan'] ?? '').replace(/&amp;/g, '&'),
		footerHtml: `© ${vars.date ?? new Date().getFullYear()} ${vars['site.name'] ?? ''}`.replace(
			/[<>&"]/g,
			''
		)
	};
	const body = renderNode(root, ctx, errors);
	const html = `<!DOCTYPE html>
<html lang="zh-Hant" xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" /><title>${escText(subjectText)}</title>
<style>@media (prefers-color-scheme: dark) { body, table[bgcolor], td { color: #e8e4de !important; } }</style>
</head>
<body style="margin:0;padding:0;background:#f4f2ef">${body}</body>
</html>`;
	return {
		ok: errors.length === 0,
		html,
		text: plainOf(root).replace(/\{\{[^}]*\}\}/g, ''),
		subject: subjectText,
		errors: [...new Set(errors)]
	};
}

const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
