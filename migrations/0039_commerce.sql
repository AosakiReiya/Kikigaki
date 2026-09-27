-- Phase 79e-1: digital-goods commerce (provider-neutral orders + delivery tokens).
CREATE TABLE orders (
	id text PRIMARY KEY NOT NULL,
	email text DEFAULT '' NOT NULL,
	status text DEFAULT 'pending' NOT NULL,
	provider text DEFAULT 'stripe' NOT NULL,
	provider_session text,
	currency text DEFAULT 'usd' NOT NULL,
	total_cents integer DEFAULT 0 NOT NULL,
	created_at integer NOT NULL,
	updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX orders_status_idx ON orders (status);
--> statement-breakpoint
CREATE UNIQUE INDEX orders_provider_session_idx ON orders (provider_session);
--> statement-breakpoint
CREATE TABLE order_items (
	id text PRIMARY KEY NOT NULL,
	order_id text NOT NULL REFERENCES orders(id) ON DELETE cascade,
	type_key text NOT NULL,
	slug text NOT NULL,
	title text DEFAULT '' NOT NULL,
	price_cents integer NOT NULL,
	file_key text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX order_items_order_idx ON order_items (order_id);
--> statement-breakpoint
CREATE TABLE delivery_tokens (
	token text PRIMARY KEY NOT NULL,
	order_item_id text NOT NULL REFERENCES order_items(id) ON DELETE cascade,
	created_at integer NOT NULL,
	expires_at integer,
	downloads integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX delivery_tokens_item_idx ON delivery_tokens (order_item_id);
