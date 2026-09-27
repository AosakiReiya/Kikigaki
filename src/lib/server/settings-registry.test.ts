/** P83b unit: settings field registry — uniqueness, legacy write-behavior fidelity, plugin namespace. */
import { describe, it, expect } from 'vitest';
import {
	SETTINGS_FIELDS,
	cleanFieldValue,
	pluginSettingsKey,
	splitPluginRows,
	PLUGIN_SETTINGS_PREFIX
} from './settings-registry';
import type { SettingsField } from './settings-registry';

const field = (prop: string): SettingsField => {
	const f = SETTINGS_FIELDS.find((x) => x.prop === prop);
	if (!f) throw new Error(`missing field ${prop}`);
	return f;
};

describe('registry shape', () => {
	it('keys and props are unique', () => {
		const keys = SETTINGS_FIELDS.map((f) => f.key);
		const props = SETTINGS_FIELDS.map((f) => f.prop);
		expect(new Set(keys).size).toBe(keys.length);
		expect(new Set(props).size).toBe(props.length);
	});
	it('covers the legacy hand-written field list (ALL_KEYS bug-class guard)', () => {
		// every simple key that used to be hand-listed in ALL_KEYS
		const legacy = [
			'logo',
			'hero_bg',
			'seo_og_image',
			'seo_twitter_site',
			'site_name',
			'site_short_name',
			'site_description',
			'author_name',
			'author_handle',
			'site_url',
			'footer_text',
			'copyright_text',
			'site_timezone',
			'socials_config',
			'about_body',
			'agent_instructions'
		];
		const have = new Set(SETTINGS_FIELDS.map((f) => f.key));
		for (const k of legacy) expect(have.has(k), `registry lost ${k}`).toBe(true);
	});
});

describe('cleanFieldValue (legacy write behavior fidelity)', () => {
	it('name trims and caps at 80', () => {
		expect(cleanFieldValue('  hello  ', field('name'))).toBe('hello');
		expect(cleanFieldValue('x'.repeat(120), field('name'))).toBe('x'.repeat(80));
	});
	it('authorHandle strips leading @ then caps', () => {
		expect(cleanFieldValue(' @reiya ', field('authorHandle'))).toBe('reiya');
	});
	it('twitterSite normalizes to single @ prefix; empty stays empty', () => {
		expect(cleanFieldValue('@@kikigaki', field('twitterSite'))).toBe('@kikigaki');
		expect(cleanFieldValue('  ', field('twitterSite'))).toBe('');
	});
	it('siteUrl rejects non-https (field skipped), strips trailing slashes', () => {
		expect(cleanFieldValue('http://x.com/', field('siteUrl'))).toBeNull();
		expect(cleanFieldValue('https://example.com//', field('siteUrl'))).toBe('https://example.com');
		expect(cleanFieldValue('', field('siteUrl'))).toBe('');
	});
	it('timezone validates charset', () => {
		expect(cleanFieldValue('Asia/Taipei', field('timezone'))).toBe('Asia/Taipei');
		expect(cleanFieldValue('bad zone!', field('timezone'))).toBeNull();
	});
	it('socialsConfig slices at 4000 without trimming', () => {
		expect(cleanFieldValue(' {"a":1} ', field('socialsConfig'))).toBe(' {"a":1} ');
	});
	it('logo passes through untouched (legacy had no trim/cap)', () => {
		expect(cleanFieldValue(' media/x.png ', field('logo'))).toBe(' media/x.png ');
	});
});

describe('plugin settings namespace', () => {
	it('pluginSettingsKey validates ids', () => {
		expect(pluginSettingsKey('shop')).toBe(`${PLUGIN_SETTINGS_PREFIX}shop`);
		expect(pluginSettingsKey('my-ext2')).toBe(`${PLUGIN_SETTINGS_PREFIX}my-ext2`);
		expect(pluginSettingsKey('Bad')).toBeNull();
		expect(pluginSettingsKey('')).toBeNull();
		expect(pluginSettingsKey('a'.repeat(50))).toBeNull();
	});
	it('splitPluginRows keeps valid objects, drops garbage', () => {
		const rows = [
			{ key: 'plugin.shop', value: '{"currency":"twd"}' },
			{ key: 'plugin.bad json', value: '{}' },
			{ key: 'plugin.broken', value: '{oops' },
			{ key: 'plugin.arr', value: '[1,2]' },
			{ key: 'logo', value: 'x' }
		];
		expect(splitPluginRows(rows)).toEqual({ shop: { currency: 'twd' } });
	});
});
