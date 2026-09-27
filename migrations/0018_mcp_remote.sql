CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`headers_enc` text DEFAULT '' NOT NULL,
	`enabled` integer NOT NULL,
	`timeout_ms` integer DEFAULT 30000 NOT NULL,
	`risk` text DEFAULT 'high' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`status_note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_servers_name_unique` ON `mcp_servers` (`name`);--> statement-breakpoint
CREATE TABLE `mcp_tools` (
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`raw_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`schema_json` text DEFAULT '{}' NOT NULL,
	`cached_at` integer NOT NULL,
	PRIMARY KEY(`server_id`, `name`),
	FOREIGN KEY (`server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
