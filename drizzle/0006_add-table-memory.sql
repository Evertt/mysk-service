CREATE TABLE `table_memory` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`table_key` text NOT NULL,
	`columns` text,
	`query` text DEFAULT '' NOT NULL,
	`view_id` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`, `table_key`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `saved_view` ADD `columns` text;