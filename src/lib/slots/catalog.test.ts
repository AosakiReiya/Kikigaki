/** P83a unit: slot assignment parsing + support-zone sync bridge. */
import { describe, it, expect } from 'vitest';
import { parseSlotAssignments, mergeSupportAssignments, SLOT_NAMES, MAX_PER_SLOT } from './catalog';

describe('parseSlotAssignments (sanitizer)', () => {
	it('keeps only catalog slots and safe component ids', () => {
		const raw = JSON.stringify({
			'post.after': ['support-zone', 'BAD NAME', 'ok-one', 42, null],
			'not.a.slot': ['x'],
			'home.hero': 'not-an-array'
		});
		expect(parseSlotAssignments(raw)).toEqual({ 'post.after': ['support-zone', 'ok-one'] });
	});
	it('caps per slot and de-duplicates preserving order', () => {
		const many = Array.from({ length: MAX_PER_SLOT + 5 }, (_, i) => `c${i}`);
		const dup = ['b', 'a', 'b', ...many];
		const out = parseSlotAssignments(JSON.stringify({ 'post.after': dup }));
		expect(out['post.after'].length).toBeLessThanOrEqual(MAX_PER_SLOT);
		expect(out['post.after'].slice(0, 2)).toEqual(['b', 'a']);
	});
	it('fail-silent on garbage input', () => {
		expect(parseSlotAssignments(undefined)).toEqual({});
		expect(parseSlotAssignments('')).toEqual({});
		expect(parseSlotAssignments('{oops')).toEqual({});
		expect(parseSlotAssignments('[1,2]')).toEqual({});
		expect(parseSlotAssignments('null')).toEqual({});
	});
	it('catalog is stable (slot names are public contract)', () => {
		expect(SLOT_NAMES).toContain('post.after');
		expect(SLOT_NAMES).toContain('admin.dashboard');
	});
});

describe('mergeSupportAssignments (surfaces → defaults bridge)', () => {
	it('adds support-zone to implied slots, keeps others', () => {
		const merged = mergeSupportAssignments({ 'post.after': ['related-products'] }, 'post,about');
		expect(merged['post.after']).toEqual(['related-products', 'support-zone']);
		expect(merged['about.after']).toEqual(['support-zone']);
	});
	it('removes support-zone when surface turned off, keeps others', () => {
		const merged = mergeSupportAssignments(
			{ 'post.after': ['support-zone', 'x'], 'about.after': ['support-zone'] },
			'support'
		);
		expect(merged['post.after']).toEqual(['x']);
		expect(merged['about.after']).toBeUndefined();
	});
	it('idempotent', () => {
		const once = mergeSupportAssignments({}, 'post,support,about');
		const twice = mergeSupportAssignments(once, 'post,support,about');
		expect(twice).toEqual(once);
	});
	it('drops empty slots from output', () => {
		expect(mergeSupportAssignments({}, '')).toEqual({});
	});
});
