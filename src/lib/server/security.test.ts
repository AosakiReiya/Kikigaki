import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handleAuth, handleSecurity } from './security';
import type { Handle } from '@sveltejs/kit';

const handle: Handle = ({ event, resolve }) =>
	handleSecurity({ event, resolve: (current) => handleAuth({ event: current, resolve }) });

const auth = vi.hoisted(() => ({ validateSession: vi.fn() }));
vi.mock('$lib/server/auth', () => ({ SESSION_COOKIE: 'session', ...auth }));
vi.mock('$lib/plugins', () => ({ emit: vi.fn() }));
vi.mock('$lib/plugins/server', () => ({ bootPlugins: vi.fn() }));
vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: (request: Request, next: (ctx: unknown) => unknown) =>
		next({ request, locale: 'zh-tw' })
}));

function event(path: string, route: string, method = 'GET', origin?: string): RequestEvent {
	const url = new URL(path, 'https://example.com');
	return {
		url,
		route: { id: route },
		request: new Request(url, { method, headers: origin ? { origin } : {} }),
		locals: {},
		platform: { env: { DB: {} } },
		cookies: { get: () => 'token' },
		setHeaders: vi.fn()
	} as unknown as RequestEvent;
}

beforeEach(() => {
	auth.validateSession.mockReset();
	auth.validateSession.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe('matched-route authorization', () => {
	it.each([
		'/admin/showcases',
		'/en/admin/showcases',
		'/a%64min/showcases',
		'/jp/a%64min/showcases'
	])('rejects unauthenticated management requests at %s', async (path) => {
		const resolve = vi.fn();
		await expect(
			handle({ event: event(path, '/admin/(panel)/showcases'), resolve })
		).rejects.toMatchObject({ status: 303, location: '/admin/login' });
		expect(resolve).not.toHaveBeenCalled();
	});
	it.each([
		['/en/api/admin/email/config', '/api/admin/email/config'],
		['/api/a%64min/email/config', '/api/admin/email/config'],
		['/jp/api/agent/agents', '/api/agent/agents'],
		['/en/api/upload', '/api/upload'],
		['/en/api/media', '/api/media']
	])('rejects anonymous API requests at %s', async (path, route) => {
		const resolve = vi.fn();
		const response = await handle({ event: event(path, route), resolve });
		expect(response.status).toBe(401);
		expect(resolve).not.toHaveBeenCalled();
	});
	it('requires admin role and rejects cross-origin JSON writes before running handlers', async () => {
		auth.validateSession.mockResolvedValue({ id: 'viewer', role: 'viewer' });
		const resolve = vi.fn();
		expect(
			(
				await handle({
					event: event('/api/admin/email/config', '/api/admin/email/config'),
					resolve
				})
			).status
		).toBe(403);
		auth.validateSession.mockResolvedValue({ id: 'owner', role: 'admin' });
		expect(
			(
				await handle({
					event: event(
						'/en/api/admin/email/config',
						'/api/admin/email/config',
						'POST',
						'https://attacker.example'
					),
					resolve
				})
			).status
		).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});
	it('allows admin requests and prevents private responses from being cached', async () => {
		auth.validateSession.mockResolvedValue({ id: 'owner', role: 'admin' });
		const response = await handle({
			event: event(
				'/en/api/admin/email/config',
				'/api/admin/email/config',
				'POST',
				'https://example.com'
			),
			resolve: async () => new Response('ok')
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
	it.each(['/admin/login', '/admin/setup', '/api/checkout/webhook/[provider]'])(
		'keeps intentional public routes available: %s',
		async (route) => {
			const response = await handle({
				event: event(route, route),
				resolve: async () => new Response('ok')
			});
			expect(response.status).toBe(200);
			expect(auth.validateSession).not.toHaveBeenCalled();
		}
	);
	it('preserves a media sandbox alongside the production CSP', async () => {
		vi.stubEnv('DEV', false);
		const response = await handle({
			event: event('/media/test.svg', '/media/[...key]'),
			resolve: async () =>
				new Response('<svg/>', { headers: { 'content-security-policy': 'sandbox' } })
		});
		expect(response.headers.get('content-security-policy')).toContain(', sandbox');
		expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
	});
});
