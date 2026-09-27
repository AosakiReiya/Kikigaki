import { describe, it, expect } from 'vitest';
import { buildContentTree, renderMarkdown, renderTree } from '../markdown';
import { parseParams, parseBody } from './props';
import { serializeTree, deserializeTree } from './tree';
import { pickerDefs, pickerDefFor } from '$lib/content-components/picker/schema';

describe('props parser', () => {
	it('parses key=value info string', () => {
		expect(parseParams('type=warning title="hello world"')).toEqual({
			type: 'warning',
			title: 'hello world'
		});
	});

	it('treats bare key as boolean', () => {
		expect(parseParams('autoplay')).toEqual({ autoplay: true });
	});

	it('coerces numbers and booleans in body', () => {
		expect(parseBody('height: 320\nautoplay: true')).toEqual({
			height: 320,
			autoplay: true
		});
	});

	it('parses JSON object body', () => {
		expect(parseBody('{"a":1}')).toEqual({ a: 1 });
	});

	it('wraps JSON array body under data', () => {
		expect(parseBody('[1,2,3]')).toEqual({ data: [1, 2, 3] });
	});

	it('returns empty for malformed JSON', () => {
		expect(parseBody('{bad json}')).toEqual({});
	});
});

describe('content tree', () => {
	it('splits text and component nodes', () => {
		const body = 'hello\n\n:::callout type=tip\ninner body\n:::\n\nworld';
		const tree = buildContentTree(body);
		expect(tree.nodes.map((n) => n.type)).toEqual(['text', 'component', 'text']);
		const comp = tree.nodes[1];
		if (comp.type !== 'component') throw new Error('expected component');
		expect(comp.name).toBe('callout');
		expect(comp.props).toEqual({ type: 'tip' });
		expect(comp.children?.[0]).toMatchObject({ type: 'text' });
		const first = comp.children?.[0];
		if (first?.type !== 'text') throw new Error('expected text child');
		expect(first.html).toContain('inner body');
	});

	it('CRLF 正文仍識別 ::: 區塊與閉合（Phase 44 防線）', () => {
		const body =
			'# t\r\n\r\n:::callout type=tip\r\nintro\r\n:::\r\n\r\n:::youtube dQw4w9WgXcQ\r\n:::\r\n\r\n:::gallery cols=2\r\n["a.png","b.png"]\r\n:::\r\n';
		const tree = buildContentTree(body);
		const comps = tree.nodes.filter((n) => n.type === 'component');
		expect(comps.map((c) => (c.type === 'component' ? c.name : ''))).toEqual([
			'callout',
			'youtube',
			'gallery'
		]);
		const { html } = renderMarkdown(body);
		expect(html).toContain('data-cc="callout"');
		expect(html).toContain('data-cc="youtube"');
		expect(html).toContain('data-cc="gallery"');
		expect(html).not.toContain(':::');
		// Nested (YouTube inside Callout, double closing): the outer block consumes only one youtube placeholder
		const nested = buildContentTree(
			':::callout type=tip\r\nintro\r\n\r\n:::youtube dQw4w9WgXcQ\r\n:::\r\n:::\r\n'
		);
		expect(nested.nodes.map((n) => n.type)).toEqual(['component']);
	});

	it('ignores unknown ::: names', () => {
		const tree = buildContentTree(':::notacomponent\nx\n:::');
		expect(tree.nodes.every((n) => !(n.type === 'component' && n.name === 'notacomponent'))).toBe(
			true
		);
	});

	it('chart body JSON merges with info params', () => {
		const body = ':::chart type=bar\n{"data":{"labels":["a"]}}\n:::';
		const tree = buildContentTree(body);
		const comp = tree.nodes[0];
		if (comp.type !== 'component') throw new Error('expected component');
		expect(comp.props).toEqual({ type: 'bar', data: { labels: ['a'] } });
	});

	it('merges adjacent text nodes', () => {
		const tree = buildContentTree('a\n\nb\n\nc');
		expect(tree.nodes).toHaveLength(1);
		expect(tree.nodes[0].type).toBe('text');
	});
});

describe('renderMarkdown', () => {
	it('emits mountable placeholder for components', () => {
		const { html } = renderMarkdown(':::youtube abcdefghijk\n:::');
		expect(html).toContain('data-cc="youtube"');
		expect(html).toContain('data-cc-mode="mount"');
	});

	it('marks placeholders not-prose so @tailwindcss/typography skips component subtrees', () => {
		const { html } = renderMarkdown(':::post hello-world\n:::');
		expect(html).toContain('class="cc not-prose"');
	});

	it('renderTree output matches placeholders', () => {
		const tree = buildContentTree(':::post hello-world\n:::');
		const html = renderTree(tree);
		expect(html).toContain('data-cc="post"');
		expect(html).toContain('&quot;slug&quot;:&quot;hello-world&quot;');
	});

	it('text mode merges info params with positional body', () => {
		const tree = buildContentTree(':::youtube title="示範"\ndQw4w9WgXcQ\n:::');
		const comp = tree.nodes[0];
		if (comp.type !== 'component') throw new Error('expected component');
		expect(comp.props).toEqual({ title: '示範', src: 'dQw4w9WgXcQ' });
	});

	it('keeps heading TOC generation working', () => {
		const { toc } = renderMarkdown('## Section Title');
		expect(toc).toEqual([{ id: 'section-title', text: 'Section Title', depth: 2 }]);
	});
});

describe('picker schema serialize', () => {
	it.each(pickerDefs)('roundtrips $name example through the parser', (def) => {
		const md = def.serialize(def.example);
		const tree = buildContentTree(md);
		const comp = tree.nodes.find((n) => n.type === 'component');
		expect(comp, `no component parsed from:\n${md}`).toBeDefined();
		expect(comp!.type).toBe('component');
		if (comp!.type === 'component') expect(comp!.name).toBe(def.name);
	});

	it('youtube serializes share links to bare IDs', () => {
		const def = pickerDefFor('youtube')!;
		const md = def.serialize({ src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
		expect(md).toBe(':::youtube dQw4w9WgXcQ\n:::');
	});

	it('callout keeps markdown content as structured children', () => {
		const def = pickerDefFor('callout')!;
		const md = def.serialize({ type: 'warning', title: '注意', content: 'a\n- b' });
		const tree = buildContentTree(md);
		const comp = tree.nodes[0];
		if (comp.type !== 'component') throw new Error('expected component');
		expect(comp.props).toEqual({ type: 'warning', title: '注意' });
		const html = comp.children?.map((c) => (c.type === 'text' ? c.html : '')).join('');
		expect(html).toContain('<li>');
	});
});

describe('nesting & serialization (phase 16)', () => {
	it('container nested inside a children-mode container becomes a child node', () => {
		const body = ':::callout type=tip\nintro text\n\n:::post hello-world\n:::\n\noutro\n:::';
		const tree = buildContentTree(body);
		const comp = tree.nodes[0];
		if (comp.type !== 'component') throw new Error('expected component');
		expect(comp.name).toBe('callout');
		expect(comp.children?.map((n) => n.type)).toEqual(['text', 'component', 'text']);
		const nested = comp.children?.[1];
		if (nested?.type !== 'component') throw new Error('expected nested component');
		expect(nested.name).toBe('post');
		expect(nested.props).toEqual({ slug: 'hello-world' });
	});

	it('nested placeholder is serialized into the parent data-cc-children attribute', () => {
		const { html } = renderMarkdown(':::callout\nsee\n\n:::youtube dQw4w9WgXcQ\n:::\n:::');
		expect(html).toContain('data-cc="callout"');
		const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
		expect(decoded).toContain('data-cc="youtube"');
	});

	it('serializeTree → deserializeTree round-trips a nested tree', () => {
		const body = ':::callout type=tip\ntext\n\n:::post hello-world\n:::\n:::\n\nafter';
		const tree = buildContentTree(body);
		const back = deserializeTree(JSON.parse(JSON.stringify(serializeTree(tree.nodes))));
		expect(back).toEqual(tree.nodes);
	});

	it('deserializeTree rejects malformed payloads', () => {
		expect(deserializeTree('nope')).toBeNull();
		expect(deserializeTree([{ type: 'bogus' }])).toBeNull();
		expect(deserializeTree([{ type: 'text' }])).toBeNull();
		expect(deserializeTree([])).toEqual([]);
	});

	it('text nodes carry raw markdown source for editors/AI', () => {
		const tree = buildContentTree('## Heading\n\nparagraph text');
		const first = tree.nodes[0];
		if (first.type !== 'text') throw new Error('expected text');
		expect(first.source).toContain('## Heading');
		expect(first.html).toContain('<h2');
	});
});
