/**
 * Phase 71 — sample variables for previews (client-safe pure data).
 * Compile previews run in the browser and cannot import server modules, hence separate from email-templates.ts.
 */
import { EMAIL_VAR_WHITELIST, type EmailVars } from './compile';

export function sampleVars(): EmailVars {
	const v: EmailVars = {};
	for (const k of EMAIL_VAR_WHITELIST) {
		(v as Record<string, string>)[k] = k
			.replace('site.', '')
			.replace('user.', '')
			.replace('post.', '')
			.replace('comment.', '');
	}
	return {
		...v,
		'site.name': 'Kikigaki',
		'site.url': 'https://example.com',
		'site.slogan': '筆記、隨想與小實驗',
		'site.logo': '/media/logo.png',
		'user.name': 'Alice',
		'user.email': 'alice@example.com',
		'user.verifyUrl': 'https://example.com/verify?t=demo',
		'user.resetUrl': 'https://example.com/reset?t=demo',
		'user.unsubscribeUrl': 'https://example.com/unsubscribe?t=demo',
		'post.title': '一萬個為什麼：CSS 動畫篇',
		'post.url': 'https://example.com/blog/css-anim',
		'post.summary': '重新整理 keyframes 與 GPU 合成的那些事。',
		'post.date': '2026-09-06',
		'comment.author': 'Bob',
		'comment.content': '寫得太好了，期待下一篇！',
		'comment.url': 'https://example.com/blog/css-anim#c42',
		code: '846213',
		expiry: '10',
		date: '2026-09-06'
	};
}
