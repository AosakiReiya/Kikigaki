/**
 * Minimal Markdown renderer (Phase 28 W4) — for Agent messages, not general MD.
 * Safety policy: escape ALL HTML first, then pattern-replace on the escaped string,
 * so <script> / [x](javascript:…) in input can never become HTML.
 * Supports: ``` code blocks, `inline code`, **bold**, *italic*, [text](http(s) URL), - lists, --- rules.
 */

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function safeUrl(u: string): boolean {
	return /^https?:\/\//i.test(u);
}

function inline(s: string): string {
	let out = s;
	out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
	out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
	out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text: string, url: string) =>
		safeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : all
	);
	return out;
}

export function miniMd(src: string): string {
	if (!src) return '';
	const escaped = esc(src);
	const lines = escaped.split('\n');
	const html: string[] = [];
	let inCode = false;
	let codeBuf: string[] = [];
	let inList = false;

	const closeList = (): void => {
		if (inList) {
			html.push('</ul>');
			inList = false;
		}
	};

	for (const raw of lines) {
		const line = raw.trimEnd();
		if (/^```/.test(line.trim())) {
			if (inCode) {
				html.push(`<pre class="mm-code"><code>${codeBuf.join('\n')}</code></pre>`);
				codeBuf = [];
				inCode = false;
			} else {
				closeList();
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			codeBuf.push(line);
			continue;
		}
		if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
			closeList();
			html.push('<hr class="mm-hr"/>');
			continue;
		}
		const li = line.match(/^\s*[-*]\s+(.*)$/);
		if (li) {
			if (!inList) {
				html.push('<ul class="mm-ul">');
				inList = true;
			}
			html.push(`<li>${inline(li[1])}</li>`);
			continue;
		}
		closeList();
		if (line === '') {
			html.push('<br/>');
			continue;
		}
		html.push(`<p class="mm-p">${inline(line)}</p>`);
	}
	if (inCode && codeBuf.length)
		html.push(`<pre class="mm-code"><code>${codeBuf.join('\n')}</code></pre>`);
	closeList();
	return html.join('');
}
