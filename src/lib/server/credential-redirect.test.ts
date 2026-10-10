import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { mcpListTools } from '../agent/mcp/client';
import { refreshModels } from './ai';
import { encryptSecret } from './secrets';
import { d1Adapter } from './testing/d1';

const servers: Server[] = [];
afterEach(async () => {
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise<void>((resolve) => {
					server.closeAllConnections();
					server.close(() => resolve());
				})
		)
	);
});
async function listen(server: Server) {
	servers.push(server);
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Test server has no port');
	return `http://127.0.0.1:${address.port}`;
}
async function redirectFixture() {
	const received: string[] = [];
	const destination = await listen(
		createServer((request, response) => {
			received.push(String(request.headers['x-api-key'] ?? ''));
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ jsonrpc: '2.0', id: 0, result: {} }));
		})
	);
	const origin = await listen(
		createServer((_request, response) => {
			response.writeHead(307, { location: destination });
			response.end();
		})
	);
	return { received, origin };
}
describe('credential-bearing outbound redirects', () => {
	it('demonstrates that default fetch forwards a custom API-key header to a redirect destination', async () => {
		const fixture = await redirectFixture();
		const response = await fetch(fixture.origin, {
			headers: { 'x-api-key': 'synthetic-test-key' }
		});
		await response.text();
		expect(fixture.received).toEqual(['synthetic-test-key']);
	});
	it('rejects MCP redirects before any custom credential reaches the other server', async () => {
		const fixture = await redirectFixture();
		await expect(
			mcpListTools(fixture.origin, { 'x-api-key': 'synthetic-test-key' }, 3_000)
		).rejects.toThrow();
		expect(fixture.received).toEqual([]);
	});
	it('rejects AI model-catalog redirects without forwarding the stored provider credential', async () => {
		const fixture = await redirectFixture();
		const sqlite = new DatabaseSync(':memory:');
		try {
			for (const file of readdirSync('migrations')
				.filter((name) => name.endsWith('.sql'))
				.sort()) {
				sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
			}
			const encrypted = await encryptSecret('synthetic-master-key', 'synthetic-provider-key');
			sqlite
				.prepare(
					"INSERT INTO ai_providers (id,name,type,base_url,api_key_enc,created_at,updated_at) VALUES ('provider','test','anthropic',?,?,1,1)"
				)
				.run(`${fixture.origin}/v1`, encrypted);
			const result = await refreshModels(d1Adapter(sqlite), 'synthetic-master-key', 'provider');
			expect(result).toMatchObject({ ok: false });
			expect(fixture.received).toEqual([]);
		} finally {
			sqlite.close();
		}
	});
});
