-- Phase 79e-3: support/tip orders (kind='tip', optional buyer message)
ALTER TABLE `orders` ADD `kind` text NOT NULL DEFAULT 'goods';
ALTER TABLE `orders` ADD `message` text;
