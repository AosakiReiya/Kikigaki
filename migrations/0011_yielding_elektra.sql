CREATE TABLE `registry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'private' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`review` text DEFAULT 'approved' NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registry_kind_slug_idx` ON `registry_items` (`kind`,`slug`);--> statement-breakpoint
CREATE INDEX `registry_enabled_idx` ON `registry_items` (`kind`,`enabled`);--> statement-breakpoint
CREATE TABLE `registry_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`version` integer NOT NULL,
	`artifact` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `registry_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registry_versions_idx` ON `registry_versions` (`item_id`,`version`);--> statement-breakpoint
-- 目錄 seed：官方主題 ＋ 官方內容元件（source=official；固定 id 冪等）
INSERT OR IGNORE INTO registry_items (id,kind,slug,name,description,source,version,enabled,review,capabilities,created_at,updated_at) VALUES
 ('reg-theme-abstract','theme','abstract','Abstract（基準）','現行設計令牌＋布簾轉場','official',1,1,'approved','[]',1787900000000,1787900000000),
 ('reg-theme-minimal','theme','minimal','Minimal','克制令牌＋fade＋無Preloader','official',1,1,'approved','[]',1787900000000,1787900000000),
 ('reg-theme-terminal','theme','terminal','Terminal','結構換肤：命令列版面＋man page','official',1,1,'approved','[]',1787900000000,1787900000000),
 ('reg-theme-magazine','theme','magazine','Magazine','襯線印刷令牌','official',1,1,'approved','[]',1787900000000,1787900000000),
 ('reg-comp-callout','component','callout','Callout','提示框（四型）','official',1,1,'approved','["self-contained"]',1787900000000,1787900000000),
 ('reg-comp-youtube','component','youtube','YouTube','responsive embed','official',1,1,'approved','["network:embed"]',1787900000000,1787900000000),
 ('reg-comp-post','component','post','Post Card','文章引用卡','official',1,1,'approved','["read:posts"]',1787900000000,1787900000000),
 ('reg-comp-chart','component','chart','Chart','SVG 圖表','official',1,1,'approved','["self-contained"]',1787900000000,1787900000000),
 ('reg-comp-timeline','component','timeline','Timeline','時間軸','official',1,1,'approved','["self-contained"]',1787900000000,1787900000000),
 ('reg-comp-gallery','component','gallery','Gallery','圖集','official',1,1,'approved','["read:assets"]',1787900000000,1787900000000),
 ('reg-comp-card','component','card','Card','資訊卡','official',1,1,'approved','["self-contained"]',1787900000000,1787900000000),
 ('reg-comp-code','component','code','Code','代碼展示','official',1,1,'approved','["self-contained"]',1787900000000,1787900000000);
