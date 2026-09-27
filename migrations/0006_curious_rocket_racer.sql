CREATE TABLE `tag_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_translations_tag_locale_idx` ON `tag_translations` (`tag_id`,`locale`);