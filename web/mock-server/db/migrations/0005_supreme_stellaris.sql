CREATE TABLE `reward_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_uuid` text NOT NULL,
	`player_name` text NOT NULL,
	`quest_id` integer NOT NULL,
	`quest_title` text NOT NULL,
	`reward_type` text NOT NULL,
	`reward_label` text,
	`item_type` text,
	`amount` integer DEFAULT 1 NOT NULL,
	`claimed_at` text NOT NULL,
	`source` text DEFAULT 'claim' NOT NULL
);
