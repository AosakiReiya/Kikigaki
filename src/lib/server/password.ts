/**
 * Password hashing — WebCrypto PBKDF2-SHA256 (works on Workers/Node; no native modules).
 * Format: pbkdf2$<iterations>$<salt base64>$<hash base64>
 *
 * Note: workerd's WebCrypto caps PBKDF2 iterations at 100000.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

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

// Uint8Array<ArrayBufferLike> → BufferSource (WebCrypto type compatibility)
function asBuffer(bytes: Uint8Array): BufferSource {
	return bytes as unknown as BufferSource;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const key = await crypto.subtle.importKey(
		'raw',
		asBuffer(new TextEncoder().encode(password)),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: asBuffer(salt), iterations: PBKDF2_ITERATIONS },
		key,
		KEY_BITS
	);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(new Uint8Array(bits))}`;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
	try {
		const [scheme, itersStr, saltB64, hashB64] = stored.split('$');
		if (scheme !== 'pbkdf2') return false;
		const iterations = Number(itersStr);
		if (!Number.isInteger(iterations) || iterations <= 0) return false;

		const salt = fromB64(saltB64);
		const expected = fromB64(hashB64);
		const key = await crypto.subtle.importKey(
			'raw',
			asBuffer(new TextEncoder().encode(password)),
			'PBKDF2',
			false,
			['deriveBits']
		);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: asBuffer(salt), iterations },
			key,
			KEY_BITS
		);
		const got = new Uint8Array(bits);
		if (got.length !== expected.length) return false;

		let diff = 0;
		for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
		return diff === 0;
	} catch {
		return false;
	}
}
