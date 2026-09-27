CREATE TABLE `custom_components` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`code` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`ai_generated` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_components_name_unique` ON `custom_components` (`name`);--> statement-breakpoint
CREATE INDEX `custom_components_enabled_idx` ON `custom_components` (`enabled`);