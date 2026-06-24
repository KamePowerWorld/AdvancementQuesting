CREATE TABLE `dashboard_configs` (
	`key` text PRIMARY KEY NOT NULL,
	`config_json` text DEFAULT '{"widgets":[]}' NOT NULL,
	`updated_at` integer NOT NULL
);
