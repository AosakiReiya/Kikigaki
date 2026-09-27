import type { RequestHandler } from './$types';

/**
 * /media/[...key] — serve public files from R2 (no dashboard public-bucket setup needed).
 * The path is the key; immutable caching (uploaded filenames are UUIDs; content never changes).
 */
export const GET: RequestHandler = async ({ params, platform }) => {
	const bucket = platform?.env.BUCKET;
	const key = params.key;
	if (!bucket || !key) return new Response(null, { status: 404 });

	const obj = await bucket.get(key);
	if (!obj) return new Response(null, { status: 404 });

	const headers = new Headers();
	headers.set('etag', obj.httpEtag);
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	// build headers manually (writeHttpMetadata can't proxy under local platformProxy — would 500)
	const meta = obj.httpMetadata;
	headers.set('content-type', meta?.contentType ?? 'application/octet-stream');
	if (meta?.cacheControl) headers.set('cache-control', meta.cacheControl);
	if (meta?.contentLanguage) headers.set('content-language', meta.contentLanguage);
	if (meta?.contentDisposition) headers.set('content-disposition', meta.contentDisposition);
	if (meta?.contentEncoding) headers.set('content-encoding', meta.contentEncoding);

	// same-origin media always nosniff — blocks MIME sniffing
	headers.set('x-content-type-options', 'nosniff');

	// SVG can embed <script>: the sandbox disables script execution — prevents same-origin stored XSS
	const contentType = headers.get('content-type') ?? '';
	if (contentType.includes('image/svg+xml')) {
		headers.set('content-security-policy', 'sandbox');
	}

	// workers-types vs DOM lib BodyInit type conflict — force cast
	return new Response(obj.body as unknown as BodyInit, { headers });
};
