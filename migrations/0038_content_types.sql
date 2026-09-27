-- Phase 79b: dynamic content types (DB manifests) + generic items table.
-- Built-in types (posts/pages/series) stay code-defined; anything registered
-- here renders through the dynamic form + validation and lands in content_items.
CREATE TABLE content_types (
	key text PRIMARY KEY NOT NULL,
	label text NOT NULL,
	fields text DEFAULT '[]' NOT NULL,
	title_field text DEFAULT 'title' NOT NULL,
	enabled integer DEFAULT 1 NOT NULL,
	created_at integer NOT NULL,
	updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE content_items (
	id text PRIMARY KEY NOT NULL,
	type_key text NOT NULL,
	slug text NOT NULL,
	data text DEFAULT '{}' NOT NULL,
	published integer DEFAULT 0 NOT NULL,
	sort_order integer DEFAULT 0 NOT NULL,
	created_at integer NOT NULL,
	updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX content_items_type_slug_idx ON content_items (type_key, slug);
--> statement-breakpoint
CREATE INDEX content_items_type_pub_idx ON content_items (type_key, published);
