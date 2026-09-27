CREATE TABLE `page_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_translations_page_locale_idx` ON `page_translations` (`page_id`,`locale`);--> statement-breakpoint
CREATE INDEX `page_translations_locale_idx` ON `page_translations` (`locale`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`show_in_nav` integer DEFAULT false NOT NULL,
	`nav_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE INDEX `pages_nav_idx` ON `pages` (`published`,`show_in_nav`,`nav_order`);