CREATE TABLE `equipment_category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`specialty` text,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_category_organization_id` ON `equipment_category` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_category_organization_name` ON `equipment_category` (`organization_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `equipment_category_organization_position` ON `equipment_category` (`organization_id`,`position`);--> statement-breakpoint
-- The categories were a fixed list; now each tenant has its own. Every tenant gets one for each of
-- the old categories its equipment has, serviced by the engineers of the specialty that serviced it,
-- in the old list's order. They're named with the old categories' Dutch labels
-- (`messages/nl/enum.json`): the tenants are Dutch, and the names are theirs to change.
CREATE TABLE `__old_category` (
	`category` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`specialty` text NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__old_category`("category", "name", "specialty", "position") VALUES ('generator', 'Aggregaat', 'electrical', 0), ('chiller', 'Koelmachine', 'hvac', 1), ('boiler', 'Ketel', 'plumbing', 2), ('compressor', 'Compressor', 'mechanical', 3), ('pump', 'Pomp', 'plumbing', 4), ('elevator', 'Lift', 'controls', 5), ('air_handler', 'Luchtbehandelingskast', 'hvac', 6);--> statement-breakpoint
INSERT INTO `equipment_category`("organization_id", "name", "specialty", "position") SELECT DISTINCT `equipment`."organization_id", `__old_category`."name", `__old_category`."specialty", `__old_category`."position" FROM `equipment` JOIN `__old_category` ON `__old_category`."category" = `equipment`."category" ORDER BY 1, 4;--> statement-breakpoint
-- The equipment table is made anew (for its key to the category), as in 0002: its foreign keys
-- stay on, the checks of the keys to the units (orders) wait for the commit, and the units are
-- copied back after the new table has the old one's name. Dropping the old table deletes the rows
-- that cascade from it (contract coverage, maintenance plans), so those are put back too.
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
	`location` text,
	`installed_at` text NOT NULL,
	`warranty_until` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`category_id`) REFERENCES `equipment_category`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`site_id`) REFERENCES `customer_site`(`customer_id`,`id`) ON UPDATE no action ON DELETE no action
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
-- Each unit is of its tenant's category that was made from its old one.
INSERT INTO `equipment`("id", "organization_id", "serial_number", "model", "manufacturer", "category_id", "status", "customer_id", "site_id", "name", "location", "installed_at", "warranty_until") SELECT "id", "organization_id", "serial_number", "model", "manufacturer", (SELECT `equipment_category`."id" FROM `equipment_category` JOIN `__old_category` ON `__old_category`."name" = `equipment_category`."name" WHERE `equipment_category`."organization_id" = `__old_equipment`."organization_id" AND `__old_category`."category" = `__old_equipment`."category"), "status", "customer_id", "site_id", "name", "location", "installed_at", "warranty_until" FROM `__old_equipment`;--> statement-breakpoint
INSERT INTO `contract_equipment` SELECT * FROM `__old_contract_equipment`;--> statement-breakpoint
INSERT INTO `maintenance_plan` SELECT * FROM `__old_maintenance_plan`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'equipment';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'equipment', max(coalesce((SELECT max(`seq`) FROM `__old_equipment_sequence`), 0), coalesce((SELECT max(`id`) FROM `equipment`), 0));--> statement-breakpoint
DROP TABLE `__old_equipment_sequence`;--> statement-breakpoint
DROP TABLE `__old_equipment`;--> statement-breakpoint
DROP TABLE `__old_contract_equipment`;--> statement-breakpoint
DROP TABLE `__old_maintenance_plan`;--> statement-breakpoint
DROP TABLE `__old_category`;
