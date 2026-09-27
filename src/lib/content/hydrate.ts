/**
 * Content Component Hydration — mount real Svelte components onto placeholder divs rendered via {@html}.
 *
 * Placeholder protocol (produced by markdown.ts):
 *   <div class="cc not-prose" data-cc="name" data-cc-mode="mount"
 *        data-cc-props="{json}" [data-cc-children="<nested placeholder html>"]>
 *
 * Phase 16 nesting: children-mode components (Callout) inject data-cc-children via {@html};
 * nested .cc nodes only appear in the DOM after injection, so a "mount → rescan" fixpoint loop
 * runs until no new components appear.
 * Phase 17 custom components: names missing from the official registry → async fetch+compile via
 * custom-registry; after mounting, run the fixpoint again over the instance subtree (custom
 * components may nest any component).
 */
import { mount, unmount, flushSync } from 'svelte';
import type { Component } from 'svelte';
import { registry } from '$lib/content-components/registry';
import { ensureCustomComponent, getCustomComponent } from '$lib/workshop/custom-registry';

const instances = new WeakMap<HTMLElement, Record<string, unknown>>();

function mountInto(el: HTMLElement, component: Component, props: Record<string, unknown>): void {
	const instance = mount(component, { target: el, props });
	instances.set(el, instance);
}

function propsOf(el: HTMLElement): Record<string, unknown> {
	return {
		...parseProps(el.dataset.ccProps),
		...(el.dataset.ccChildren !== undefined ? { childrenHtml: el.dataset.ccChildren } : {})
	};
}

/** Mount all unmounted placeholders under root (sync components fixpoint; custom components continue async) */
function hydrateAll(root: HTMLElement): void {
	flushSync();
	let mounted = true;
	let guard = 0;
	while (mounted && guard++ < 50) {
		mounted = false;
		root.querySelectorAll<HTMLElement>('div[data-cc][data-cc-mode="mount"]').forEach((el) => {
			if (instances.has(el) || el.dataset.ccBusy) return;
			const name = el.dataset.cc;
			if (!name) return;
			const def = registry[name] as Component | undefined;
			if (def) {
				mountInto(el, def, propsOf(el));
				mounted = true;
				return;
			}
			// custom components: cache ready → mount; otherwise kick off loading
			const pending = getCustomComponent(name);
			if (pending) {
				void pending.then((c) => {
					if (!c || instances.has(el)) return;
					mountInto(el, c, propsOf(el));
					hydrateAll(el); // continue mounting nested placeholders inside the instance
				});
				return;
			}
			el.dataset.ccBusy = '1';
			void ensureCustomComponent(name)
				.then((c) => {
					delete el.dataset.ccBusy;
					if (c && !instances.has(el)) {
						mountInto(el, c, propsOf(el));
						hydrateAll(el);
					}
				})
				.catch(() => {
					delete el.dataset.ccBusy;
				});
		});
		flushSync();
	}
}

function parseProps(json: string | undefined): Record<string, unknown> {
	if (!json) return {};
	try {
		const parsed: unknown = JSON.parse(json);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** Unmount all mounted components under root (incl. root's own subtree) */
function destroyAll(root: HTMLElement): void {
	const els = [root, ...root.querySelectorAll<HTMLElement>('div[data-cc]')];
	for (const el of els) {
		const instance = instances.get(el);
		if (instance) {
			unmount(instance);
			instances.delete(el);
		}
	}
}

/**
 * Svelte action: `use:hydrateComponents={{ src }}`.
 * src (source HTML string) change → remount; destroy → unmount all.
 */
export function hydrateComponents(node: HTMLElement, params: { src: string }) {
	const apply = () => {
		destroyAll(node);
		hydrateAll(node);
	};

	void params;
	apply();

	return {
		update(next: { src: string }) {
			void next;
			apply();
		},
		destroy() {
			destroyAll(node);
		}
	};
}
