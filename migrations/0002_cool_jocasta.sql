CREATE TABLE `post_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_versions_post_idx` ON `post_versions` (`post_id`,`created_at`);