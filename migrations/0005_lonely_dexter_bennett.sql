CREATE TABLE `post_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_translations_post_locale_idx` ON `post_translations` (`post_id`,`locale`);--> statement-breakpoint
CREATE INDEX `post_translations_locale_idx` ON `post_translations` (`locale`);--> statement-breakpoint
ALTER TABLE `post_versions` ADD `locale` text DEFAULT 'zh-tw' NOT NULL;--> statement-breakpoint
INSERT INTO `post_translations` (`id`, `post_id`, `locale`, `title`, `summary`, `body`, `created_at`, `updated_at`)
SELECT 'tr:' || `id` || ':zh-tw', `id`, 'zh-tw', `title`, `summary`, `body`, `created_at`, `updated_at` FROM `posts`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `summary`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `body`;