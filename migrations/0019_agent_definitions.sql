CREATE TABLE `agent_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'primary' NOT NULL,
	`baseMode` text DEFAULT 'agent' NOT NULL,
	`persona` text DEFAULT '' NOT NULL,
	`model_row_id` text,
	`effort` text,
	`max_steps` integer,
	`risk_ceiling` text DEFAULT 'critical' NOT NULL,
	`color` text,
	`enabled` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_definitions_name_unique` ON `agent_definitions` (`name`);--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `agent` text;
--> statement-breakpoint
-- 內建 agents seed（persona 留空＝回退 engine AGENT_PERSONAS[baseMode]）
INSERT OR IGNORE INTO agent_definitions (id,name,description,kind,baseMode,persona,risk_ceiling,color,enabled,created_at,updated_at) VALUES (lower(hex(randomblob(16))),'chat','研究／研讀，只讀不變更','primary','chat','','read','#38bdf8',1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000);
--> statement-breakpoint
INSERT OR IGNORE INTO agent_definitions (id,name,description,kind,baseMode,persona,risk_ceiling,color,enabled,created_at,updated_at) VALUES (lower(hex(randomblob(16))),'plan','調查並產出可執行計畫','primary','plan','','medium','#a78bfa',1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000);
--> statement-breakpoint
INSERT OR IGNORE INTO agent_definitions (id,name,description,kind,baseMode,persona,risk_ceiling,color,enabled,created_at,updated_at) VALUES (lower(hex(randomblob(16))),'build','自主執行（高風險暫停待批）','primary','agent','','critical','#4ade80',1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000);
--> statement-breakpoint
INSERT OR IGNORE INTO agent_definitions (id,name,description,kind,baseMode,persona,risk_ceiling,color,enabled,created_at,updated_at) VALUES (lower(hex(randomblob(16))),'explore','快速探索站內內容（唯讀批次查）','primary','agent','你是「Explore」探索員：唯讀快速掃描站點（list/read 工具批次查），彙整重點後精簡回報，絕不修改任何資料。','read','#facc15',1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000);
