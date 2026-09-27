import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({ goto: (...a: unknown[]) => goto(...a) }));

// must mock before import (vitest handles ESM hoisting)
const { smartBack } = await import('./smart-back');

function setEnv(opts: {
	index: number | undefined;
	referrer?: string;
	origin?: string;
	back?: () => void;
}) {
	const back = opts.back ?? vi.fn();
	vi.stubGlobal('history', { state: { 'sveltekit:history': opts.index }, back });
	vi.stubGlobal('document', { referrer: opts.referrer ?? '' });
	vi.stubGlobal('location', { origin: opts.origin ?? 'https://example.com' });
	return back;
}

describe('smartBack', () => {
	beforeEach(() => goto.mockReset());
	afterEach(() => vi.unstubAllGlobals());

	it('站內有歷史：history.back()，不 goto', () => {
		const back = setEnv({ index: 3 });
		smartBack();
		expect(back).toHaveBeenCalledTimes(1);
		expect(goto).not.toHaveBeenCalled();
	});

	it('index 0 + 同站 referrer → 導向來源頁', () => {
		setEnv({ index: 0, referrer: 'https://example.com/about' });
		smartBack();
		expect(goto).toHaveBeenCalledWith('/about');
	});

	it('index 0 + 跨站 referrer → 走預設 fallback', () => {
		setEnv({ index: 0, referrer: 'https://evil.example/x' });
		smartBack();
		expect(goto).toHaveBeenCalledWith('/blog');
	});

	it('index undefined（直開）無 referrer → /blog；可自訂 fallback', () => {
		setEnv({ index: undefined });
		smartBack('/');
		expect(goto).toHaveBeenCalledWith('/');
	});

	it('無效 referrer 不炸、走 fallback', () => {
		setEnv({ index: 0, referrer: 'not a url' });
		expect(() => smartBack()).not.toThrow();
		expect(goto).toHaveBeenCalledWith('/blog');
	});
});
