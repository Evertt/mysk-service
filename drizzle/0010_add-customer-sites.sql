CREATE TABLE `customer_site` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` integer NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`contact_name` text,
	`contact_phone` text,
	`contact_email` text,
	`contact_channel` text,
	`preferred_day` text,
	`slot_start` text,
	`slot_end` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`access_notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_site_organization_id` ON `customer_site` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_site_customer_id` ON `customer_site` (`customer_id`,`id`);--> statement-breakpoint
CREATE INDEX `customer_site_organization_customer` ON `customer_site` (`organization_id`,`customer_id`);--> statement-breakpoint
-- Every customer gets a site from their own city and country, and their equipment is there.
INSERT INTO `customer_site`("organization_id", "customer_id", "name", "city", "country", "created_at") SELECT "organization_id", "id", "city", "city", "country", "created_at" FROM `customer`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`serial_number` text NOT NULL,
	`model` text NOT NULL,
	`manufacturer` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`customer_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	`name` text,
	`location` text,
	`installed_at` text NOT NULL,
	`warranty_until` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`site_id`) REFERENCES `customer_site`(`customer_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_equipment`("id", "organization_id", "serial_number", "model", "manufacturer", "category", "status", "customer_id", "site_id", "name", "location", "installed_at", "warranty_until") SELECT "id", "organization_id", "serial_number", "model", "manufacturer", "category", "status", "customer_id", (SELECT "id" FROM `customer_site` WHERE `customer_site`."organization_id" = `equipment`."organization_id" AND `customer_site`."customer_id" = `equipment`."customer_id"), NULL, NULL, "installed_at", "warranty_until" FROM `equipment`;--> statement-breakpoint
-- What the table's ids have come to (its highest ever, though that row may be gone), kept for the
-- new table: an id is never given again, as the activity log knows records by them.
CREATE TABLE `__old_equipment_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'equipment';--> statement-breakpoint
DROP TABLE `equipment`;--> statement-breakpoint
ALTER TABLE `__new_equipment` RENAME TO `equipment`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'equipment';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'equipment', max(coalesce((SELECT max(`seq`) FROM `__old_equipment_sequence`), 0), coalesce((SELECT max(`id`) FROM `equipment`), 0));--> statement-breakpoint
DROP TABLE `__old_equipment_sequence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_serial_number` ON `equipment` (`organization_id`,`serial_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_id` ON `equipment` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_customer_id` ON `equipment` (`customer_id`,`id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_customer` ON `equipment` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_unit` ON `equipment` (`organization_id`,`manufacturer`,`model`);--> statement-breakpoint
CREATE INDEX `equipment_site` ON `equipment` (`site_id`);