ALTER TABLE `comments` ADD `risk_reasons` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `url_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `content_length` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `turnstile_result` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `pattern_hits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `pattern_samples` text;