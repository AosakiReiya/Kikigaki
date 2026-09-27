/** Shared helpers (usable client-side and in previews) */

/** Resolve the 11-char video id from a YouTube URL or bare id; empty string on failure */
export function extractYouTubeId(value: string): string {
	if (!value) return '';
	const v = value.trim();
	if (/^[\w-]{11}$/.test(v)) return v;
	try {
		const url = new URL(v);
		if (url.hostname.includes('youtu.be')) {
			return url.pathname.slice(1).slice(0, 11);
		}
		const watch = url.searchParams.get('v');
		if (watch) return watch.slice(0, 11);
		const m = url.pathname.match(/\/(embed|shorts)\/([\w-]{11})/);
		if (m) return m[2];
	} catch {
		/* Not a URL: try grabbing a trailing 11-char segment */
		const m = v.match(/([\w-]{11})/);
		if (m) return m[1];
	}
	return '';
}
