// @vitest-environment node
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signedJwt } from './server/gsc';

const { privateKey } = crypto.generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	publicKeyEncoding: { type: 'spki', format: 'pem' }
});

describe('signedJwt（Service Account OAuth 斷言）', () => {
	it('三段式、claims 齊全、aud 帶 tokenUrl', async () => {
		const jwt = await signedJwt(
			{ client_email: 'sa@test-iam.iam.gserviceaccount.com', private_key: privateKey },
			'https://oauth2.googleapis.com/token'
		);
		const [h, c, sig] = jwt.split('.');
		expect(sig).toBeTruthy();
		const header = JSON.parse(Buffer.from(h, 'base64url').toString());
		const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
		expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
		expect(claims.iss).toBe('sa@test-iam.iam.gserviceaccount.com');
		expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
		expect(claims.scope).toContain('webmasters.readonly');
		expect(claims.exp - claims.iat).toBe(3600);
	});
	it('簽名可被公鑰驗證（WebCrypto RSASSA-PKCS1-v1_5）', async () => {
		const jwt = await signedJwt(
			{ client_email: 'a@b.iam', private_key: privateKey },
			'https://t.example/token'
		);
		const [h, c, sig] = jwt.split('.');
		const pubDer = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
		const key = await crypto.subtle.importKey(
			'spki',
			pubDer as unknown as ArrayBuffer,
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['verify']
		);
		const sigBytes = Uint8Array.from(
			Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
		);
		const ok = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			key,
			sigBytes as unknown as ArrayBuffer,
			new TextEncoder().encode(`${h}.${c}`)
		);
		expect(ok).toBe(true);
	});
	it('不同 tokenUrl → 不同斷言（不可混用）', async () => {
		const a = await signedJwt({ client_email: 'x@y', private_key: privateKey }, 'https://t1');
		const b = await signedJwt({ client_email: 'x@y', private_key: privateKey }, 'https://t2');
		expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
	});
});
