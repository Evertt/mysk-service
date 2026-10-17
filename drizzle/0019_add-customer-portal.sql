CREATE TABLE `order_request` (
	`order_id` integer PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`reporter_name` text NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	`rejection_reason` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `portal_contact` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` integer NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`invitation_id` text,
	`all_sites` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contact_organization_id` ON `portal_contact` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contact_customer_id` ON `portal_contact` (`customer_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contact_organization_user` ON `portal_contact` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contact_organization_email` ON `portal_contact` (`organization_id`,`email`);--> statement-breakpoint
CREATE INDEX `portal_contact_organization_customer` ON `portal_contact` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `portal_contact_site` (
	`organization_id` text NOT NULL,
	`contact_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	PRIMARY KEY(`contact_id`, `site_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`contact_id`) REFERENCES `portal_contact`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`,`contact_id`) REFERENCES `portal_contact`(`customer_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`,`site_id`) REFERENCES `customer_site`(`customer_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_contact_site_site` ON `portal_contact_site` (`site_id`);