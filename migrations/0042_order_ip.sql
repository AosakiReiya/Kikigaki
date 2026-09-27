-- Phase 84: buyer IP on orders (checkout rate limiting; sweep of stale pending orders)
ALTER TABLE `orders` ADD `client_ip` text;
CREATE INDEX IF NOT EXISTS `orders_client_ip_created_idx` ON `orders` (`client_ip`, `created_at`);
