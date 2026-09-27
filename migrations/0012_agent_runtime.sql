CREATE TABLE `agent_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_call_id`) REFERENCES `agent_tool_calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_approvals_run_idx` ON `agent_approvals` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `agent_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`run_id` text,
	`type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_events_cursor_idx` ON `agent_events` (`session_id`,`id`);--> statement-breakpoint
CREATE TABLE `agent_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`run_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text DEFAULT '[]' NOT NULL,
	`tool_call_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_messages_session_idx` ON `agent_messages` (`session_id`,`id`);--> statement-breakpoint
CREATE TABLE `agent_plan_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `agent_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_plan_steps_idx` ON `agent_plan_steps` (`plan_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `agent_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`session_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_plans_run_idx` ON `agent_plans` (`run_id`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`input` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`steps_used` integer DEFAULT 0 NOT NULL,
	`tool_calls_used` integer DEFAULT 0 NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`max_steps` integer DEFAULT 24 NOT NULL,
	`max_tool_calls` integer DEFAULT 60 NOT NULL,
	`max_token_budget` integer DEFAULT 200000 NOT NULL,
	`wall_ms` integer DEFAULT 0 NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_runs_session_idx` ON `agent_runs` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'chat' NOT NULL,
	`model_row_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_sessions_user_idx` ON `agent_sessions` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `agent_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`step` integer NOT NULL,
	`name` text NOT NULL,
	`args` text DEFAULT '{}' NOT NULL,
	`risk` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'pending_approval' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`result` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_tool_calls_run_idx` ON `agent_tool_calls` (`run_id`,`step`);