CREATE TABLE `order_photo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`position` integer NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_photo_organization_order` ON `order_photo` (`organization_id`,`order_id`,`position`);--> statement-breakpoint
CREATE INDEX `order_photo_user` ON `order_photo` (`user_id`);--> statement-breakpoint
ALTER TABLE `order_request` ADD `fault` text;