CREATE TABLE `equipment_location` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`position` integer NOT NULL,
	`qr_token` text DEFAULT (lower(hex(randomblob(12)))) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`) REFERENCES `customer_site`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_location_organization_id` ON `equipment_location` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_location_site_id` ON `equipment_location` (`site_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_location_site_name` ON `equipment_location` (`site_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_location_qr_token` ON `equipment_location` (`qr_token`);--> statement-breakpoint
CREATE INDEX `equipment_location_organization_site` ON `equipment_location` (`organization_id`,`site_id`,`position`);--> statement-breakpoint
-- A unit's place at its site was a text (`equipment.location`); now it's one of the site's
-- locations, a record with a QR code of its own. Every site gets a location for each of the places
-- its units had (the same whatever the case or spaces around it, named as the first of them reads),
-- in alphabetical order, and each unit is at the location made from its text. Every unit and
-- location gets its QR code's token from the column's default.
INSERT INTO `equipment_location`("organization_id", "site_id", "name", "position") SELECT "organization_id", "site_id", "name", row_number() OVER (PARTITION BY "site_id" ORDER BY lower("name"), "name") - 1 FROM (SELECT "organization_id", "site_id", min(trim("location")) AS "name" FROM `equipment` WHERE trim(coalesce("location", '')) != '' GROUP BY "organization_id", "site_id", lower(trim("location"))) ORDER BY "organization_id", "site_id", lower("name");--> statement-breakpoint
-- The equipment table is made anew (for its key to the location), as in 0003: its foreign keys
-- stay on, the checks of the keys to the units (orders' units) wait for the commit, and the units
-- are copied back after the new table has the old one's name. Dropping the old table deletes the
-- rows that cascade from it (contract coverage, maintenance plans), so those are put back too.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__old_equipment` AS SELECT * FROM `equipment`;--> statement-breakpoint
CREATE TABLE `__old_contract_equipment` AS SELECT * FROM `contract_equipment`;--> statement-breakpoint
CREATE TABLE `__old_maintenance_plan` AS SELECT * FROM `maintenance_plan`;--> statement-breakpoint
CREATE TABLE `__new_equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`serial_number` text NOT NULL,
	`model` text NOT NULL,
	`manufacturer` text NOT NULL,
	`category_id` integer NOT NULL,
	`status` text NOT NULL,
	`customer_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	`name` text,
	`location_id` integer,
	`installed_at` text NOT NULL,
	`warranty_until` text NOT NULL,
	`qr_token` text DEFAULT (lower(hex(randomblob(12)))) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`category_id`) REFERENCES `equipment_category`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`site_id`) REFERENCES `customer_site`(`customer_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`location_id`) REFERENCES `equipment_location`(`site_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- What the table's ids have come to (its highest ever, though that row may be gone), kept for the
-- new table: an id is never given again, as the activity log knows records by them.
CREATE TABLE `__old_equipment_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'equipment';--> statement-breakpoint
DROP TABLE `equipment`;--> statement-breakpoint
ALTER TABLE `__new_equipment` RENAME TO `equipment`;--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_serial_number` ON `equipment` (`organization_id`,`serial_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_id` ON `equipment` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_customer_id` ON `equipment` (`customer_id`,`id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_customer` ON `equipment` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_unit` ON `equipment` (`organization_id`,`manufacturer`,`model`);--> statement-breakpoint
CREATE INDEX `equipment_site` ON `equipment` (`site_id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_category` ON `equipment` (`organization_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `equipment_by_location` ON `equipment` (`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_qr_token` ON `equipment` (`qr_token`);--> statement-breakpoint
-- Each unit at the location made from its text, with a token of its own (the default).
INSERT INTO `equipment`("id", "organization_id", "serial_number", "model", "manufacturer", "category_id", "status", "customer_id", "site_id", "name", "location_id", "installed_at", "warranty_until") SELECT "id", "organization_id", "serial_number", "model", "manufacturer", "category_id", "status", "customer_id", "site_id", "name", (SELECT `equipment_location`."id" FROM `equipment_location` WHERE `equipment_location`."site_id" = `__old_equipment`."site_id" AND lower(`equipment_location`."name") = lower(trim(`__old_equipment`."location"))), "installed_at", "warranty_until" FROM `__old_equipment`;--> statement-breakpoint
INSERT INTO `contract_equipment` SELECT * FROM `__old_contract_equipment`;--> statement-breakpoint
INSERT INTO `maintenance_plan` SELECT * FROM `__old_maintenance_plan`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'equipment';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'equipment', max(coalesce((SELECT max(`seq`) FROM `__old_equipment_sequence`), 0), coalesce((SELECT max(`id`) FROM `equipment`), 0));--> statement-breakpoint
DROP TABLE `__old_equipment_sequence`;--> statement-breakpoint
DROP TABLE `__old_equipment`;--> statement-breakpoint
DROP TABLE `__old_contract_equipment`;--> statement-breakpoint
DROP TABLE `__old_maintenance_plan`;
