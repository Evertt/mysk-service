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

CREATE UNIQUE INDEX `customer_site_organization_id` ON `customer_site` (`organization_id`,`id`);
CREATE UNIQUE INDEX `customer_site_customer_id` ON `customer_site` (`customer_id`,`id`);
CREATE INDEX `customer_site_organization_customer` ON `customer_site` (`organization_id`,`customer_id`);
-- Every customer gets a site from their own city and country, and their equipment is there.
INSERT INTO `customer_site`("organization_id", "customer_id", "name", "city", "country", "created_at") SELECT "organization_id", "id", "city", "city", "country", "created_at" FROM `customer`;
-- The equipment table is made anew (for its key to the site). A Durable Object keeps its foreign
-- keys on, so instead of switching them off (as drizzle-kit writes it): the orders' keys to the
-- units are checked when the migrations commit, and the units are copied back after the new table
-- has the old one's name. Dropping the old table deletes the rows that cascade from it (contract
-- coverage, maintenance plans), so those are put back too.
PRAGMA defer_foreign_keys = on;
CREATE TABLE `__old_equipment` AS SELECT * FROM `equipment`;
CREATE TABLE `__old_contract_equipment` AS SELECT * FROM `contract_equipment`;
CREATE TABLE `__old_maintenance_plan` AS SELECT * FROM `maintenance_plan`;
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

DROP TABLE `equipment`;
ALTER TABLE `__new_equipment` RENAME TO `equipment`;
CREATE UNIQUE INDEX `equipment_organization_serial_number` ON `equipment` (`organization_id`,`serial_number`);
CREATE UNIQUE INDEX `equipment_organization_id` ON `equipment` (`organization_id`,`id`);
CREATE UNIQUE INDEX `equipment_customer_id` ON `equipment` (`customer_id`,`id`);
CREATE INDEX `equipment_organization_customer` ON `equipment` (`organization_id`,`customer_id`);
CREATE INDEX `equipment_organization_unit` ON `equipment` (`organization_id`,`manufacturer`,`model`);
CREATE INDEX `equipment_site` ON `equipment` (`site_id`);
INSERT INTO `equipment`("id", "organization_id", "serial_number", "model", "manufacturer", "category", "status", "customer_id", "site_id", "name", "location", "installed_at", "warranty_until") SELECT "id", "organization_id", "serial_number", "model", "manufacturer", "category", "status", "customer_id", (SELECT "id" FROM `customer_site` WHERE `customer_site`."organization_id" = `__old_equipment`."organization_id" AND `customer_site`."customer_id" = `__old_equipment`."customer_id"), NULL, NULL, "installed_at", "warranty_until" FROM `__old_equipment`;
INSERT INTO `contract_equipment` SELECT * FROM `__old_contract_equipment`;
INSERT INTO `maintenance_plan` SELECT * FROM `__old_maintenance_plan`;
DROP TABLE `__old_equipment`;
DROP TABLE `__old_contract_equipment`;
DROP TABLE `__old_maintenance_plan`;