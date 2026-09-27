import { describe, expect, it } from 'vitest';
import { compileEmail, usedVars, EMAIL_VAR_WHITELIST } from './compile';
import { parseDsl } from './dsl';

const VARS = {
	'site.name': '測試站',
	'site.url': 'https://example.com',
	'site.slogan': '筆記與隨想',
	'user.name': 'Alice',
	'user.verifyUrl': 'https://example.com/verify?t=abc',
	'post.title': '文章標題',
	'post.url': 'https://example.com/p/1',
	'post.summary': '摘要文字',
	comment: undefined as never
};

describe('email dsl parser', () => {
	it('解析嵌套與自閉標籤', () => {
		const { root, errors } = parseDsl('<Email>\n<Header />\n<Text>hi</Text>\n</Email>');
		expect(errors).toEqual([]);
		expect(root?.name).toBe('Email');
		expect(root?.children.map((c) => (c.kind === 'element' ? c.name : 'text'))).toEqual([
			'Header',
			'Text'
		]);
	});
	it('屬性字面值直通（不翻 entity）', () => {
		const { root } = parseDsl('<Email><Button href="a?x=1&amp;y=2" /></Email>');
		const btn = root?.children[0];
		expect(btn?.kind === 'element' && btn.props.href).toBe('a?x=1&amp;y=2');
	});
	it('未閉合報錯', () => {
		const { errors } = parseDsl('<Email><Text>abc');
		expect(errors.length).toBeGreaterThan(0);
	});
	it('順序錯亂不崩潰', () => {
		const { errors } = parseDsl('<Email></Text></Email>');
		expect(errors.some((e) => e.includes('順序錯誤'))).toBe(true);
	});
});

describe('email compiler', () => {
	it('完整文件：root Email＋table-based', () => {
		const r = compileEmail(
			'<Email preheader="小字 {{site.name}}"><Header /><Text>你好 {{user.name}}</Text><Footer /></Email>',
			VARS,
			'歡迎'
		);
		expect(r.ok, r.errors.join(';')).toBe(true);
		expect(r.html).toContain('<!DOCTYPE html>');
		expect(r.html).toContain('table role="presentation"');
		expect(r.html).toContain('你好 &#25104;&#20132;'.length ? 'Alice' : '');
		expect(r.html).toContain('測試站');
		expect(r.html).not.toContain('display:flex');
		expect(r.text).toContain('你好 Alice');
	});
	it('非法變數拒絕', () => {
		const r = compileEmail('<Email><Text>{{user.password}}</Text></Email>', VARS);
		expect(r.ok).toBe(false);
		expect(r.errors.some((e) => e.includes('user.password'))).toBe(true);
	});
	it('未知元件拒絕', () => {
		const r = compileEmail('<Email><Marquee />x</Email>', VARS);
		expect(r.ok).toBe(false);
		expect(r.errors.some((e) => e.includes('Marquee'))).toBe(true);
	});
	it('根必須是 Email', () => {
		const r = compileEmail('<Text>lonely</Text>', VARS);
		expect(r.ok).toBe(false);
		expect(r.errors.some((e) => e.includes('Email'))).toBe(true);
	});
	it('插值 escape：注入失敗', () => {
		const r = compileEmail('<Email><Text>{{post.title}}</Text></Email>', {
			...VARS,
			'post.title': '<script>alert(1)</script>'
		});
		expect(r.html).not.toContain('<script>alert');
		expect(r.html).toContain('&lt;script&gt;');
	});
	it('Button bulletproof（table＋inline）', () => {
		const r = compileEmail('<Email><Button href="{{user.verifyUrl}}">驗證</Button></Email>', VARS);
		expect(r.ok, r.errors.join(';')).toBe(true);
		expect(r.html).toContain('href="https://example.com/verify?t=abc"');
		expect(r.html).toContain('<table role="presentation"');
	});
	it('PostCard/CommentCard 渲染', () => {
		const r = compileEmail(
			'<Email><PostCard title="{{post.title}}" url="{{post.url}}" summary="{{post.summary}}" /><CommentCard author="Bob" content="嗨" url="{{post.url}}" /></Email>',
			VARS
		);
		expect(r.ok, r.errors.join(';')).toBe(true);
		expect(r.html).toContain('文章標題');
		expect(r.html).toContain('Bob');
	});
	it('subject 插值進 title', () => {
		const r = compileEmail('<Email><Text>x</Text></Email>', VARS, '你好 {{user.name}}');
		expect(r.html).toContain('<title>你好 Alice</title>');
	});
	it('usedVars 抽取', () => {
		expect(usedVars('{{site.name}} 與 {{ user.email }} 與 {{site.name}}')).toEqual([
			'site.name',
			'user.email'
		]);
	});
	it('白名單完整（site 4／user 5／post 4／comment 3＋3／order 3＝22）', () => {
		expect(EMAIL_VAR_WHITELIST).toContain('user.unsubscribeUrl');
		expect(EMAIL_VAR_WHITELIST).toContain('comment.content');
		expect(EMAIL_VAR_WHITELIST.length).toBe(22);
	});
});
