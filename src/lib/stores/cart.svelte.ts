/**
 * Cart (79e): module-level $state + localStorage persistence. De-duped by typeKey/slug;
 * purely client-side orchestration — prices are for display, the server recomputes at checkout (tamper-proofing is the backend's job).
 */
export interface CartLine {
	typeKey: string;
	slug: string;
	title: string;
	price: string;
}

const KEY = '***';

const store = $state<{ items: CartLine[] }>({ items: load() });

function load(): CartLine[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(v)
			? v
					.filter(
						(l: CartLine) =>
							typeof l?.typeKey === 'string' &&
							typeof l?.slug === 'string' &&
							typeof l?.price === 'string' &&
							l.price.length < 20
					)
					.slice(0, 20)
			: [];
	} catch {
		return [];
	}
}

function persist() {
	try {
		localStorage.setItem(KEY, JSON.stringify(store.items.slice(0, 20)));
	} catch {
		/* no _storage_ (SSR/private mode) = memory only */
	}
}

export function cartItems(): CartLine[] {
	return store.items;
}

export function cartAdd(line: CartLine): boolean {
	if (store.items.some((l) => l.typeKey === line.typeKey && l.slug === line.slug)) return false;
	store.items = [...store.items, { ...line, price: line.price.slice(0, 16) }];
	persist();
	return true;
}

export function cartRemove(typeKey: string, slug: string): void {
	store.items = store.items.filter((l) => !(l.typeKey === typeKey && l.slug === slug));
	persist();
}

export function cartClear(): void {
	store.items = [];
	persist();
}
