/**
 * Props parsing: ::: block info string (key=value) + body (JSON / key: value)
 * Merge rule: body wins over info string (the more explicit source overrides).
 */

/** Parse key=value params from the info string (values may be double-quoted) */
export function parseParams(input: string): Record<string, unknown> {
	const props: Record<string, unknown> = {};
	const re = /([\w-]+)(?:=("[^"]*"|[^\s]*))?/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(input)) !== null) {
		const key = m[1];
		const raw = m[2];
		if (raw === undefined) {
			props[key] = true;
		} else {
			props[key] = coerce(raw.replace(/^"|"$/g, ''));
		}
	}
	return props;
}

/** 解析 ::: 區塊內文：JSON（含陣列）或 key: value 行 */
export function parseBody(input: string): Record<string, unknown> {
	const trimmed = input.trim();
	if (!trimmed) return {};
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return { data: parsed };
			if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
			return {};
		} catch {
			return {};
		}
	}
	const props: Record<string, unknown> = {};
	for (const line of trimmed.split('\n')) {
		const t = line.trim();
		if (!t) continue;
		const idx = t.indexOf(':');
		if (idx === -1) continue;
		const key = t.slice(0, idx).trim();
		const value = t.slice(idx + 1).trim();
		props[key] = coerce(value);
	}
	return props;
}

/** 字面值型別推斷：數字／布林／null／JSON 結構先轉，其餘留字串 */
function coerce(value: string): unknown {
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null') return null;
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	if (value.startsWith('[') || value.startsWith('{')) {
		try {
			return JSON.parse(value);
		} catch {
			/* 非合法 JSON，留原字串 */
		}
	}
	return value;
}
