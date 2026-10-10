import { describe, expect, it, vi } from 'vitest';
import { GET } from './[...key]/+server';

function request(key: string, get: ReturnType<typeof vi.fn>) {
	return { params: { key }, platform: { env: { BUCKET: { get } } } } as unknown as Parameters<
		typeof GET
	>[0];
}

describe('public media access', () => {
	it.each(['goods/private.zip', 'd1/backup.sql', 'backups/database.sql'])(
		'never reads private files from the public bucket route: %s',
		async (key) => {
			const get = vi.fn().mockResolvedValue({ body: 'paid contents' });
			expect((await GET(request(key, get))).status).toBe(404);
			expect(get).not.toHaveBeenCalled();
		}
	);
	it('serves public images with a sandbox on SVG content', async () => {
		const get = vi.fn().mockResolvedValue({
			body: '<svg/>',
			httpEtag: 'etag',
			httpMetadata: { contentType: 'image/svg+xml' }
		});
		const response = await GET(request('images/public.svg', get));
		expect(await response.text()).toBe('<svg/>');
		expect(response.headers.get('content-security-policy')).toBe('sandbox');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});
});
