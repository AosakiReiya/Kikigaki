CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `body` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `pinned` integer DEFAULT false NOT NULL;