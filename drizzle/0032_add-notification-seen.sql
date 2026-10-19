CREATE TABLE `notification_seen` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_seen_activity_id` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`last_seen_activity_id`) REFERENCES `activity`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_seen_user` ON `notification_seen` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_seen_activity` ON `notification_seen` (`organization_id`,`last_seen_activity_id`);--> statement-breakpoint
DROP INDEX `activity_organization`;--> statement-breakpoint
CREATE UNIQUE INDEX `activity_organization_id` ON `activity` (`organization_id`,`id`);