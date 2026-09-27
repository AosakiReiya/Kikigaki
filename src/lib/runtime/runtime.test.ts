import { describe, it, expect, vi, afterEach } from 'vitest';
import { CC_PROTOCOL, parseInbound, parseOutbound, isJsonSafe } from './contract';
import { resolveCapability, type CapabilityContext } from './capabilities';

const CH = 'c-test';

const frame = (over: Record<string, unknown>) => ({
	v: CC_PROTOCOL,
	ch: CH,
	seq: 1,
	type: 'ready',
	...over
});

describe('cc/1 contract', () => {
	it('accepts a valid inbound message', () => {
		const m = parseInbound(frame({ type: 'resize', payload: { height: 120 } }), CH);
		expect(m).not.toBeNull();
		expect(m?.type).toBe('resize');
	});

	it('rejects wrong version / channel / shape', () => {
		expect(parseInbound(frame({ v: 'cc/0' }), CH)).toBeNull();
		expect(parseInbound(frame({ ch: 'c-other' }), CH)).toBeNull();
		expect(parseInbound('string', CH)).toBeNull();
		expect(parseInbound(null, CH)).toBeNull();
		expect(parseInbound(frame({ seq: -1 }), CH)).toBeNull();
		expect(parseInbound(frame({ seq: 'x' }), CH)).toBeNull();
	});

	it('direction allowlists are exclusive', () => {
		// host side only receives sandbox→host; init is host→sandbox and must not be accepted by parseInbound
		expect(parseInbound(frame({ type: 'init' }), CH)).toBeNull();
		expect(parseOutbound(frame({ type: 'init' }), CH)?.type).toBe('init');
		expect(parseOutbound(frame({ type: 'ready' }), CH)).toBeNull();
	});

	it('rejects payloads that cannot survive JSON serialization (circular refs)', () => {
		const cyc: Record<string, unknown> = {};
		cyc.self = cyc;
		expect(isJsonSafe(cyc)).toBe(false);
		expect(parseInbound(frame({ type: 'log', payload: cyc }), CH)).toBeNull();
		// functions are blocked at the postMessage structured-clone stage; the protocol layer assumes JSON-safe only
		expect(isJsonSafe({ a: [1, 2], b: { c: 'x' } })).toBe(true);
	});
});

const ctx: CapabilityContext = {
	articles: [{ slug: 'hello-world', title: '你好', summary: 's', tags: [] }],
	theme: { '--ink': '#fff' },
	allowedOrigins: ['https://api.github.com'],
	assetPrefixes: ['/media/', '/covers/']
};

describe('capabilities default-deny', () => {
	it('grants theme and article', async () => {
		expect((await resolveCapability('theme', null, ctx)).ok).toBe(true);
		const a = await resolveCapability('article', { slug: 'hello-world' }, ctx);
		expect(a.ok && a.data).toMatchObject({ title: '你好' });
	});

	it('article missing slug or unknown slug fails', async () => {
		expect((await resolveCapability('article', {}, ctx)).ok).toBe(false);
		expect((await resolveCapability('article', { slug: 'nope' }, ctx)).error).toBe(
			'article_not_found'
		);
	});

	it('assets restricted to approved prefixes', async () => {
		expect((await resolveCapability('assets', { url: '/media/a.png' }, ctx)).ok).toBe(true);
		expect((await resolveCapability('assets', { url: 'https://evil/x' }, ctx)).ok).toBe(false);
	});

	it('denies everything not on the grant list (cookie/admin/db/…)', async () => {
		for (const cap of ['cookie', 'admin', 'db', 'secrets', 'storage', 'whatever']) {
			const r = await resolveCapability(cap, {}, ctx);
			expect(r.ok, cap).toBe(false);
			expect(r.error, cap).toBe('capability_denied');
		}
	});
});

describe('capabilities fetch', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('rejects non-allowlisted origins and non-https without fetching', async () => {
		const spy = vi.fn();
		vi.stubGlobal('fetch', spy);
		expect((await resolveCapability('fetch', { url: 'https://evil.example/x' }, ctx)).ok).toBe(
			false
		);
		expect((await resolveCapability('fetch', { url: 'http://api.github.com/x' }, ctx)).ok).toBe(
			false
		);
		expect(spy).not.toHaveBeenCalled();
	});

	it('proxy-fetches allowlisted origin and parses JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				text: async () => '{"stargazers_count":78000}'
			})
		);
		const r = await resolveCapability('fetch', { url: 'https://api.github.com/repos/a/b' }, ctx);
		expect(r.ok).toBe(true);
		expect(r.data).toEqual({ stargazers_count: 78000 });
	});
});
