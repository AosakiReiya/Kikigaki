CREATE TABLE `permission_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`scope_name` text,
	`pattern` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `permission_rules_scope_idx` ON `permission_rules` (`scope`,`scope_name`);