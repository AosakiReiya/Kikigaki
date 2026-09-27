ALTER TABLE `comments` ADD `user_agent_hash` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `risk_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `moderation_result` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `moderated_at` integer;--> statement-breakpoint
CREATE INDEX `comments_ip_created_idx` ON `comments` (`ip_hash`,`created_at`);