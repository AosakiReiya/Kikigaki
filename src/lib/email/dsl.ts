/**
 * Phase 67b — Email DSL parser: MDX-style component syntax → AST
 * <Email> <Header /> <Text>free text {{var}}</Text> <Button href="...">anchor text</Button> </Email>
 * Supports: self-closing tags, paired tags (children = text/nested), key="value" attributes (&quot; escapes)
 */
export interface DslNode {
	kind: 'element';
	name: string;
	props: Record<string, string>;
	children: (DslNode | DslText)[];
}
export interface DslText {
	kind: 'text';
	value: string;
}
export type DslAny = DslNode | DslText;

export interface ParseResult {
	root?: DslNode;
	errors: string[];
}

const TAG = /<(\/?)([A-Za-z][\w-]*)((?:\s+[A-Za-z][\w-]*="[^"]*")*)\s*(\/?)>/g;
const ATTR = /([A-Za-z][\w-]*)="([^"]*)"/g;

/* Note: parsing does NOT decode entities — the interpolation layer (compile.interpolate) owns HTML escaping;
   literals pass through, avoiding decode/encode cancellation that could enable injection */
export function parseDsl(source: string): ParseResult {
	const errors: string[] = [];
	const root: DslNode = { kind: 'element', name: 'root', props: {}, children: [] };
	const stack: DslNode[] = [root];
	let last = 0;
	let m: RegExpExecArray | null;
	TAG.lastIndex = 0;
	const pushText = (raw: string) => {
		const v = raw.trim();
		if (v) stack[stack.length - 1].children.push({ kind: 'text', value: v });
	};
	while ((m = TAG.exec(source)) !== null) {
		pushText(source.slice(last, m.index));
		last = m.index + m[0].length;
		const [, closing, name, attrsRaw, selfClose] = m;
		if (closing) {
			const top = stack.pop();
			if (!top || top.name !== name) {
				errors.push(`標籤順序錯誤：</${name}>（当前栈頂 ${top ? `</${top.name}>` : '空'}）`);
				stack.push(root); // fall back to avoid crashes
			}
			continue;
		}
		const props: Record<string, string> = {};
		let a: RegExpExecArray | null;
		ATTR.lastIndex = 0;
		while ((a = ATTR.exec(attrsRaw)) !== null) props[a[1]] = a[2];
		const el: DslNode = { kind: 'element', name, props, children: [] };
		stack[stack.length - 1].children.push(el);
		if (!selfClose) stack.push(el);
	}
	pushText(source.slice(last));
	if (stack.length !== 1) errors.push('有未關閉的標籤');
	if (root.children.length === 0) errors.push('DSL 為空');
	return { root: root.children.find((c): c is DslNode => c.kind === 'element'), errors };
}
