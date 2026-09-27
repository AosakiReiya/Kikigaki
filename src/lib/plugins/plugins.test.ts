import { describe, it, expect, vi } from 'vitest';
import { registerPlugin, emit, applyFilter, hookRegistry, setPluginGate } from './hooks';
import type { Plugin, SearchIndexEntry } from './types';

const makeSpy = (id: string, calls: string[], throwAt?: () => void): Plugin => ({
	manifest: { id, name: id, description: '' },
	hooks: {
		on: {
			'post:published': async (e) => {
				calls.push(id + ':' + e.slug);
				throwAt?.();
			}
		}
	}
});

describe('P83d commerce/registry events', () => {
	const cap = (id: string, bag: Record<string, unknown[]>) =>
		registerPlugin({
			manifest: { id, name: id, description: '' },
			hooks: {
				on: {
					'order:paid': async (e) => {
						(bag['order:paid'] ??= []).push(e);
					},
					'order:refunded': async (e) => {
						(bag['order:refunded'] ??= []).push(e);
					},
					'support:received': async (e) => {
						(bag['support:received'] ??= []).push(e);
					},
					'type:created': async (e) => {
						(bag['type:created'] ??= []).push(e);
					},
					'item:published': async (e) => {
						(bag['item:published'] ??= []).push(e);
					}
				}
			}
		});

	it('all five events dispatch with typed payloads', async () => {
		const bag: Record<string, unknown[]> = {};
		cap('p83d-cap', bag);
		await emit(
			'order:paid',
			{
				orderId: 'o1',
				email: 'a@b.c',
				provider: 'mock',
				currency: 'usd',
				totalCents: 1200,
				kind: 'goods',
				itemCount: 1
			},
			{}
		);
		await emit('order:refunded', { orderId: 'o1', provider: 'mock' }, {});
		await emit('support:received', { orderId: 'o2', amountCents: 500, message: 'hi' }, {});
		await emit('type:created', { key: 'notes', label: 'Notes' }, {});
		await emit('item:published', { typeKey: 'notes', slug: 'first' }, {});
		expect(bag['order:paid']).toEqual([
			{
				orderId: 'o1',
				email: 'a@b.c',
				provider: 'mock',
				currency: 'usd',
				totalCents: 1200,
				kind: 'goods',
				itemCount: 1
			}
		]);
		expect(bag['order:refunded']).toEqual([{ orderId: 'o1', provider: 'mock' }]);
		expect(bag['support:received']).toEqual([{ orderId: 'o2', amountCents: 500, message: 'hi' }]);
		expect(bag['type:created']).toEqual([{ key: 'notes', label: 'Notes' }]);
		expect(bag['item:published']).toEqual([{ typeKey: 'notes', slug: 'first' }]);
	});
});

describe('hooks engine', () => {
	it('emit dispatches payload+ctx to all subscribers in registration order', async () => {
		const calls: string[] = [];
		registerPlugin(makeSpy('p-order-a', calls));
		registerPlugin(makeSpy('p-order-b', calls));
		await emit('post:published', { slug: 'x1', locale: 'zh-tw', published: true }, { userId: 'u' });
		expect(calls).toEqual(['p-order-a:x1', 'p-order-b:x1']);
	});

	it('a throwing handler is isolated: logged, next handlers still run, emit resolves', async () => {
		const calls: string[] = [];
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		registerPlugin(
			makeSpy('p-boom', calls, () => {
				throw new Error('boom');
			})
		);
		registerPlugin(makeSpy('p-after', calls));
		await expect(
			emit('post:published', { slug: 'x2', locale: 'zh-tw', published: true })
		).resolves.toBeUndefined();
		expect(calls).toEqual(['p-boom:x2', 'p-after:x2']); // boom is thrown after the push
		expect(err).toHaveBeenCalled();
		err.mockRestore();
	});

	it('registerPlugin is idempotent by plugin id (dev HMR / double import safe)', async () => {
		const calls: string[] = [];
		registerPlugin(makeSpy('p-idem', calls));
		registerPlugin(makeSpy('p-idem', calls));
		await emit('post:published', { slug: 'x3', locale: 'zh-tw', published: true });
		expect(calls.filter((c) => c === 'p-idem:x3')).toHaveLength(1);
	});

	it('unknown event with no subscribers is a no-op', async () => {
		await expect(
			emit('comment:created', {
				id: 'c1',
				postSlug: 's',
				name: 'n',
				content: 'c',
				status: 'pending',
				approved: false
			})
		).resolves.toBeUndefined();
	});

	it('applyFilter runs waterfall; a broken filter is skipped without corrupting value', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		registerPlugin({
			manifest: { id: 'f-good1', name: '', description: '' },
			hooks: {
				filter: {
					'search:index': (v: SearchIndexEntry[]) => [
						...v,
						{ slug: 'a', kind: 'post', title: 'A', summary: '', tags: [] }
					]
				}
			}
		});
		registerPlugin({
			manifest: { id: 'f-bad', name: '', description: '' },
			hooks: {
				filter: {
					'search:index': (() => {
						throw new Error('filter boom');
					}) as never
				}
			}
		});
		registerPlugin({
			manifest: { id: 'f-good2', name: '', description: '' },
			hooks: {
				filter: {
					'search:index': (v: SearchIndexEntry[]) => [
						...v,
						{ slug: 'b', kind: 'page', title: 'B', summary: '', tags: [] }
					]
				}
			}
		});
		const out = await applyFilter('search:index', []);
		expect(out.map((e) => e.slug)).toContain('a');
		expect(out.map((e) => e.slug)).toContain('b'); // the bad ones that got through
		err.mockRestore();
	});

	it('built-in plugins are registered (search filter + activity actions)', () => {
		// dynamic import triggers index.ts side-effect registration
		return import('./index').then(() => {
			const reg = hookRegistry();
			expect(reg.filters['search:index']).toContain('builtin-search');
			expect(reg.actions['post:published']).toContain('builtin-activity');
			expect(reg.actions['comment:created']).toContain('builtin-activity');
		});
	});

	it('plugin gate (Phase 22 registry) skips disabled plugins on both hooks kinds', async () => {
		const calls: string[] = [];
		registerPlugin(makeSpy('p-gated', calls));
		setPluginGate((id) => id === 'p-gated');
		await emit('post:published', { slug: 'g1', locale: 'zh-tw', published: true });
		expect(calls).toEqual([]); // disabled → never dispatch
		setPluginGate(null);
		await emit('post:published', { slug: 'g2', locale: 'zh-tw', published: true });
		expect(calls).toEqual(['p-gated:g2']); // release resumes instantly
	});

	it('a throwing gate fails open (availability first)', async () => {
		const calls: string[] = [];
		registerPlugin(makeSpy('p-gate-err', calls));
		setPluginGate(() => {
			throw new Error('gate db down');
		});
		await emit('post:published', { slug: 'g3', locale: 'zh-tw', published: true });
		expect(calls).toEqual(['p-gate-err:g3']); // gate broken → dispatch as usual
		setPluginGate(null);
	});
});
