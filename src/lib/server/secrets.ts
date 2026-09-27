/**
 * Secret sealing — provider API keys stored AES-256-GCM encrypted (a DB leak exposes no plaintext).
 * The data-encryption key derives from env var `AI_SECRET` via PBKDF2 (workerd caps iterations at 100000).
 * Format: aes256gcm$<iv b64>$<ct b64>
 *
 * Memo: losing AI_SECRET → all stored provider keys need resetting (undecryptable).
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT = new TextEncoder().encode('kikigaki-ai-secretbox:v1');

function asBuffer(bytes: Uint8Array): BufferSource {
	return bytes as unknown as BufferSource;
}

function toB64(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

function fromB64(value: string): Uint8Array {
	const bin = atob(value);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** derive the AES-GCM key from AI_SECRET (cached per process to avoid re-deriving each request) */
const keyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(secret: string): Promise<CryptoKey> {
	let p = keyCache.get(secret);
	if (!p) {
		p = (async () => {
			const base = await crypto.subtle.importKey(
				'raw',
				asBuffer(new TextEncoder().encode(secret)),
				'PBKDF2',
				false,
				['deriveKey']
			);
			return crypto.subtle.deriveKey(
				{ name: 'PBKDF2', hash: 'SHA-256', salt: asBuffer(SALT), iterations: PBKDF2_ITERATIONS },
				base,
				{ name: 'AES-GCM', length: 256 },
				false,
				['encrypt', 'decrypt']
			);
		})();
		keyCache.set(secret, p);
	}
	return p;
}

export async function encryptSecret(secret: string, plaintext: string): Promise<string> {
	const key = await deriveKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: asBuffer(iv) },
		key,
		asBuffer(new TextEncoder().encode(plaintext))
	);
	return `aes256gcm$${toB64(iv)}$${toB64(new Uint8Array(ct))}`;
}

export async function decryptSecret(secret: string, stored: string): Promise<string | null> {
	try {
		const [scheme, ivB64, ctB64] = stored.split('$');
		if (scheme !== 'aes256gcm' || !ivB64 || !ctB64) return null;
		const key = await deriveKey(secret);
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: asBuffer(fromB64(ivB64)) },
			key,
			asBuffer(fromB64(ctB64))
		);
		return new TextDecoder().decode(plain);
	} catch {
		return null; // tampered / key mismatch → null (callers ask for a key reset)
	}
}

/** whether it's already in encrypted format (compatible with manually-stored plaintext fallbacks) */
export function isEncrypted(value: string): boolean {
	return value.startsWith('aes256gcm$');
}
