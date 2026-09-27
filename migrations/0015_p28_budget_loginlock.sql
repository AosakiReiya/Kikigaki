CREATE TABLE `login_attempts` (
	`ip` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ai_models` ADD `reasoning_budget` integer;