CREATE TABLE `saved_view` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`table_key` text NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_view_user_table_name` ON `saved_view` (`organization_id`,`user_id`,`table_key`,`name`);--> statement-breakpoint
CREATE INDEX `saved_view_table` ON `saved_view` (`organization_id`,`table_key`);