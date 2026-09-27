/**
 * Plugin Hooks contract (Phase 21) — the ONLY interface between Core and plugins.
 *
 * Two primitives:
 *   action (verb events): emit() calls in order, non-blocking, no return value, error-isolated = observation / side-channel effects
 *   filter (noun processing): applyFilter() relays (waterfall), error-isolated = data extension (e.g. the search index)
 *
 * SSR/Workers safety iron rules (see hooks.ts):
 *   - per-request data always travels via ctx params; the Core layer holds no per-request mutable state
 *   - handlers must be try/catch isolated and never block the main flow (mirroring analytics' existing tolerance)
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { Locale } from '$lib/paraglide/runtime';

/* * per-request context carried by every call (stateless: created by Core, passed to handlers, never entering modules) */
export interface HookContext {
	db?: D1Database;
	locale?: Locale;
	/* * the request that triggered this event (if any) */
	url?: URL;
	/* * admin operator id (for pub events; absent on the front end) */
	userId?: string;
	/** encryption master key mirror (purchase_thanks and similar plugins decrypt email credentials via this; injected by Core's call site) */
	masterKey?: string;
}

/* ----------------------------- event table ----------------------------- */

export interface PostEvent {
	slug: string;
	locale: Locale;
	/* * publish state at trigger time */
	published: boolean;
}

export interface CommentCreatedEvent {
	id: string;
	postSlug: string;
	name: string;
	content: string;
	/* * the moderation pipeline's final verdict */
	status: 'approved' | 'pending' | 'spam';
	approved: boolean;
}

export interface PageviewRecordedEvent {
	path: string;
	inserted: boolean;
	locale: string | null;
	refDomain: string | null;
	utmSource: string | null;
	utmMedium: string | null;
}

/* * P83d: commerce / registry lifecycle events */
export interface OrderPaidEvent {
	orderId: string;
	/** buyer email as recorded at settlement (may be empty) */
	email: string;
	provider: string;
	currency: string;
	totalCents: number;
	kind: 'goods' | 'tip';
	itemCount: number;
}

export interface OrderRefundedEvent {
	orderId: string;
	provider: string;
}

export interface SupportReceivedEvent {
	orderId: string;
	amountCents: number;
	message: string;
}

export interface TypeCreatedEvent {
	key: string;
	label: string;
}

export interface ItemPublishedEvent {
	typeKey: string;
	slug: string;
}

/* * event name → payload type (new core events must register here) */
export interface EventMap {
	'post:created': PostEvent;
	'post:updated': PostEvent;
	'post:published': PostEvent;
	'post:unpublished': PostEvent;
	'comment:created': CommentCreatedEvent;
	'pageview:recorded': PageviewRecordedEvent;
	'admin:loaded': AdminLoadedEvent;
	'order:paid': OrderPaidEvent;
	'order:refunded': OrderRefundedEvent;
	'support:received': SupportReceivedEvent;
	'type:created': TypeCreatedEvent;
	'item:published': ItemPublishedEvent;
}

export interface AdminLoadedEvent {
	userId: string;
}

/* * filter name → [value type] (type placeholder; applyFilter uses the same key) */
export interface FilterMap {
	'search:index': SearchIndexEntry[];
}

export interface SearchIndexEntry {
	slug: string;
	kind: 'post' | 'page';
	title: string;
	summary: string;
	tags: { name: string; display: string }[];
}

/* ------------------------------ plugins ------------------------------ */

export interface PluginManifest {
	id: string;
	name: string;
	description: string;
	/* * core capabilities (for future sandbox authorization; v1 only registers metadata) */
	capabilities?: string[];
}

/* * plugins implemented in code (built-ins = statically bundled; future DB plugins = Phase 22) */
export interface Plugin {
	manifest: PluginManifest;
	hooks: Hooks;
}

/* * handler for a single event type (actions return void; filters return the processed value) */
export type Handler<K extends keyof EventMap> = (
	event: EventMap[K],
	ctx: HookContext
) => void | Promise<void>;

export type FilterHandler<K extends keyof FilterMap> = (
	value: FilterMap[K],
	ctx: HookContext
) => FilterMap[K] | Promise<FilterMap[K]>;

/* * the hooks a plugin declares interest in; key = event / filter name */
export interface Hooks {
	on?: {
		[K in keyof EventMap]?: Handler<K>;
	};
	filter?: {
		[K in keyof FilterMap]?: FilterHandler<K>;
	};
}
