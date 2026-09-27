/**
 * Phase 67b — Email built-in component library
 * Every component outputs email-client-safe HTML: table layout, inline CSS, no flex/grid/position.
 * ctx provides site defaults (site/footer/vars already-interpolated strings).
 */
import type { DslNode } from './dsl';

export interface EmailCtx {
	siteName: string;
	siteUrl: string;
	slogan: string;
	footerHtml: string;
	/** Dark-mode helper class prefixes are always inline; the media query is injected once by compile */
}

export interface EmailComponentDef {
	name: string;
	props: Record<string, 'text' | 'url'>; // text = may contain interpolation; url = link
	description: string;
	render: (node: DslNode, ctx: EmailCtx, kids: string) => string;
}

const FONT =
	'font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;';
/* The interpolation layer already escapes all {{var}}; literals are the author's responsibility. Output passes through without a second escape. */
const esc = (v: string): string => v;

export const EMAIL_COMPONENTS: EmailComponentDef[] = [
	{
		name: 'Email',
		props: { preheader: 'text' },
		description: '郵件根容器（preheader＝收件匣預覽小字）',
		render: (node, ctx, kids) => {
			const pre = esc(node.props.preheader ?? '');
			return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px">${pre}&#8203;&nbsp;‌</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ef;width:100%;${FONT}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e2dc">
${kids}
</table>
<p style="margin:16px 0 0;font-size:12px;color:#8a857e;${FONT}">${ctx.footerHtml}</p>
</td></tr></table>`;
		}
	},
	{
		name: 'Header',
		props: {},
		description: '站名列（點擊回首頁）',
		render: (_node, ctx) => `<tr><td style="padding:20px 28px 8px">
<a href="${esc(ctx.siteUrl)}" style="font-weight:700;font-size:16px;color:#1c1a17;text-decoration:none;${FONT}">${esc(ctx.siteName)}</a>
</td></tr>`
	},
	{
		name: 'Hero',
		props: { title: 'text', subtitle: 'text' },
		description: '大標題＋副標區塊',
		render: (node, ctx) => `<tr><td style="padding:20px 28px">
<h1 style="margin:0 0 8px;font-size:24px;line-height:1.3;color:#1c1a17;${FONT}">${esc(node.props.title ?? ctx.siteName)}</h1>
${node.props.subtitle ? `<p style="margin:0;font-size:14px;color:#6b6660;${FONT}">${esc(node.props.subtitle)}</p>` : ''}
</td></tr>`
	},
	{
		name: 'Text',
		props: { color: 'text' },
		description: '段落文字（支援 children 插值；color 選填）',
		render: (node, _ctx, kids) => `<tr><td style="padding:12px 28px">
<p style="margin:0;font-size:14px;line-height:1.7;color:${node.props.color ? esc(node.props.color) : '#37332e'};${FONT}">${kids || esc(node.props.text ?? '')}</p>
</td></tr>`
	},
	{
		name: 'Button',
		props: { href: 'url', bg: 'text', color: 'text' },
		description: 'bulletproof 按鈕（table 式，Outlook 安全）',
		render: (node, _ctx, kids) => `<tr><td align="center" style="padding:20px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:${esc(node.props.bg ?? '#1c1a17')};border-radius:8px">
<a href="${esc(node.props.href ?? '#')}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:${esc(node.props.color ?? '#ffffff')};text-decoration:none;${FONT}">${kids || '→'}</a>
</td></tr></table>
</td></tr>`
	},
	{
		name: 'Image',
		props: { src: 'url', alt: 'text', width: 'text' },
		description: '圖片（全寬自適應）',
		render: (node) => `<tr><td style="padding:8px 28px">
<img src="${esc(node.props.src ?? '')}" alt="${esc(node.props.alt ?? '')}" width="504" style="width:100%;max-width:504px;height:auto;border-radius:8px;display:border-box" />
</td></tr>`
	},
	{
		name: 'Divider',
		props: {},
		description: '分隔線',
		render: () => `<tr><td style="padding:8px 28px">
<hr style="border:none;border-top:1px solid #e6e2dc;margin:0" />
</td></tr>`
	},
	{
		name: 'PostCard',
		props: { title: 'text', url: 'url', summary: 'text', date: 'text' },
		description: '文章卡片（標題連結＋摘要＋日期）',
		render: (node) => `<tr><td style="padding:12px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e2dc;border-radius:10px"><tr><td style="padding:14px 16px">
<p style="margin:0 0 6px;font-size:15px;font-weight:700;${FONT}"><a href="${esc(node.props.url ?? '#')}" style="color:#1c1a17;text-decoration:none">${esc(node.props.title ?? '')}</a></p>
${node.props.summary ? `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6b6660;${FONT}">${esc(node.props.summary)}</p>` : ''}
${node.props.date ? `<p style="margin:0;font-size:12px;color:#a09a92;${FONT}">${esc(node.props.date)}</p>` : ''}
</td></tr></table>
</td></tr>`
	},
	{
		name: 'CommentCard',
		props: { author: 'text', content: 'text', url: 'url' },
		description: '評論引用卡（回覆通知用）',
		render: (node) => `<tr><td style="padding:12px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #b58cff;background:#faf9f7;border-radius:0 10px 10px 0"><tr><td style="padding:12px 16px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#6b6660;${FONT}">${esc(node.props.author ?? '')}</p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#37332e;${FONT}">${esc(node.props.content ?? '')}</p>
<a href="${esc(node.props.url ?? '#')}" style="font-size:12px;color:#7a4fd0;text-decoration:none;${FONT}">查看與回覆 →</a>
</td></tr></table>
</td></tr>`
	},
	{
		name: 'Footer',
		props: { unsubscribe: 'url' },
		description: '頁尾（站名＋退訂連結選填）',
		render: (node, ctx) => `<tr><td style="padding:16px 28px 22px;border-top:1px solid #e6e2dc">
<p style="margin:0;font-size:12px;line-height:1.7;color:#8a857e;${FONT}">${esc(ctx.slogan)}<br />
<a href="${esc(ctx.siteUrl)}" style="color:#8a857e">${esc(ctx.siteName)}</a>${
			node.props.unsubscribe
				? ` &#183; <a href="${esc(node.props.unsubscribe)}" style="color:#8a857e">取消訂閱</a>`
				: ''
		}</p>
</td></tr>`
	}
];

export const componentByName = (n: string): EmailComponentDef | undefined =>
	EMAIL_COMPONENTS.find((c) => c.name === n);
