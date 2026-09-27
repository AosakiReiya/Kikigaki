import { describe, expect, it } from 'vitest';
import { sanitizeTokensForSsr, validateBehaviors } from './themes';
import { deleteTheme, isDbThemeId, makeThemeId, validateSurfaces, validateTheme } from './themes';

describe('isDbThemeId／makeThemeId（78c：內建命名空間永不衝突）', () => {
	it('db- 前綴＋合法 slug 通過', () => {
		expect(isDbThemeId('db-neon')).toBe(true);
		expect(isDbThemeId('db-a-b-2')).toBe(true);
		expect(makeThemeId('My-Theme')).toBe('db-my-theme');
		expect(makeThemeId('  neon2 ')).toBe('db-neon2');
	});
	it('非 db- 前綴／非法 slug／內建 id 全拒', () => {
		expect(isDbThemeId('abstract')).toBe(false);
		expect(isDbThemeId('terminal')).toBe(false);
		expect(isDbThemeId('db-')).toBe(false);
		expect(isDbThemeId('db-AB')).toBe(false);
		expect(isDbThemeId('db--x')).toBe(false);
		expect(isDbThemeId('db-x_')).toBe(false);
		expect(makeThemeId('')).toBeNull();
		expect(makeThemeId('a')).toBeNull();
	});
});

describe('validateSurfaces（槽位白名單＋尺寸閘）', () => {
	it('合法集通過並保留 css 可選', () => {
		const r = validateSurfaces({ Home: { code: '<h1>hi</h1>' }, Post: { code: 'x', css: '.a{}' } });
		expect(r.ok).toBe(true);
		expect(r.value?.Post?.css).toBe('.a{}');
		expect(r.value?.Home?.css).toBeUndefined();
	});
	it('JSON 字串輸入可解析', () => {
		expect(validateSurfaces('{"About":{"code":"x"}}').ok).toBe(true);
		expect(validateSurfaces('{bad').ok).toBe(false);
	});
	it('未知 surface／缺 code／超尺寸＝拒', () => {
		expect(validateSurfaces({ Noop: { code: 'x' } }).ok).toBe(false);
		expect(validateSurfaces({ Home: { code: '  ' } }).ok).toBe(false);
		expect(validateSurfaces({ Home: { code: 'a'.repeat(80_001) } }).ok).toBe(false);
		expect(validateSurfaces([1, 2]).ok).toBe(false);
	});
});

describe('validateTheme（saveTheme 前置閘）', () => {
	const good = { id: 'db-neon', label: 'Neon', base: 'terminal' };
	it('過閘回規範化 surfaces', () => {
		const r = validateTheme({ ...good, surfaces: { Home: { code: '<p>x</p>' } } });
		expect(r.ok).toBe(true);
		expect((r.value?.surfaces as Record<string, unknown>).Home).toBeTruthy();
	});
	it('列舉所有錯誤（不短路）', () => {
		const r = validateTheme({ id: 'neon', label: '', base: 'nope', surfaces: { X: { code: '' } } });
		expect(r.ok).toBe(false);
		expect(r.errors.length).toBeGreaterThanOrEqual(3);
	});
	it('base 省略＝合法（saveTheme 補 abstract）', () => {
		expect(validateTheme(good).ok).toBe(true);
	});
});

describe('deleteTheme id 閘（防誤刪內建/注入）', () => {
	it('非 db- id 在未觸 DB 前即拒', async () => {
		expect(await deleteTheme(null as never, 'abstract')).toBe(false);
		expect(await deleteTheme(null as never, 'db-AB')).toBe(false);
	});
});

describe('sanitizeTokensForSsr (P2 SSR inline guard)', () => {
	it('neutralizes </style breakout without touching normal CSS', () => {
		const css = ':root{--a:red}';
		expect(sanitizeTokensForSsr(css)).toBe(css);
		const evil = 'a{color:red}</style><script>alert(1)</script>';
		const out = sanitizeTokensForSsr(evil);
		expect(out).not.toContain('</style>');
		expect(out).toContain('alert(1)'); // content policy unchanged, structure guarded
	});
	it('neutralizes HTML comments and caps length', () => {
		expect(sanitizeTokensForSsr('<!--x-->')).not.toContain('<!--');
		expect(sanitizeTokensForSsr('a'.repeat(50_000)).length).toBeLessThanOrEqual(40_000);
	});
});

describe('validateBehaviors (batch 4: enums & numbers only)', () => {
	it('empty input = no override', () => {
		expect(validateBehaviors('').ok).toBe(true);
		expect(validateBehaviors('').value).toEqual({});
	});
	it('valid overrides pass and clamp staggerScale', () => {
		expect(
			validateBehaviors('{"transition":"fade","preloader":false,"staggerScale":0.05}').value
		).toEqual({
			transition: 'fade',
			preloader: false,
			staggerScale: 0.2
		});
	});
	it('bad enum / type / array rejected', () => {
		expect(validateBehaviors('{"transition":"zoom"}').ok).toBe(false);
		expect(validateBehaviors('{"preloader":"yes"}').ok).toBe(false);
		expect(validateBehaviors('[]').ok).toBe(false);
		expect(validateBehaviors('{oops').ok).toBe(false);
	});
});
