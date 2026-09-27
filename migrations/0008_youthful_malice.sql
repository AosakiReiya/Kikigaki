CREATE TABLE `ai_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`context_window` integer,
	`is_default` integer DEFAULT false NOT NULL,
	`task` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_models_provider_model_idx` ON `ai_models` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE INDEX `ai_models_task_idx` ON `ai_models` (`task`);--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`api_key_enc` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_providers_name_unique` ON `ai_providers` (`name`);--> statement-breakpoint
CREATE INDEX `ai_providers_enabled_idx` ON `ai_providers` (`enabled`);