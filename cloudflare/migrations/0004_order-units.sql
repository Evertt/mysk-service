-- An order was about one unit at most (`order.equipment_id`); now it's about any number of them
-- (`order_unit`), and the column goes. Dropping it makes the order table anew, as 0002 and 0003 do
-- the equipment table: its foreign keys stay on, the checks of the keys to the orders (invoice
-- lines, stock movements) wait for the commit, and the orders are copied back after the new table
-- has the old one's name. Dropping the old table deletes the rows that cascade from it (notes,
-- sign-offs, material lines) and empties the maintenance plans' last orders (`set null`), so those
-- are put back too. The order's units are made from the copy, once the new table is in place.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__old_order` AS SELECT * FROM `order`;--> statement-breakpoint
CREATE TABLE `__old_order_note` AS SELECT * FROM `order_note`;--> statement-breakpoint
CREATE TABLE `__old_order_signoff` AS SELECT * FROM `order_signoff`;--> statement-breakpoint
CREATE TABLE `__old_order_line` AS SELECT * FROM `order_line`;--> statement-breakpoint
CREATE TABLE `__old_maintenance_plan` AS SELECT `id`, `last_order_organization_id`, `last_order_id` FROM `maintenance_plan` WHERE `last_order_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`engineer_id` integer,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`description` text NOT NULL,
	`scheduled_for` integer,
	`completed_at` integer,
	`labor_hours` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`engineer_id`) REFERENCES `engineer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- What the table's ids have come to (its highest ever, though that row may be gone), kept for the
-- new table: an id is never given again, as the activity log knows records by them.
CREATE TABLE `__old_order_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'order';--> statement-breakpoint
DROP TABLE `order`;--> statement-breakpoint
ALTER TABLE `__new_order` RENAME TO `order`;--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_number` ON `order` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_id` ON `order` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_customer_id` ON `order` (`customer_id`,`id`);--> statement-breakpoint
CREATE INDEX `order_organization_created` ON `order` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_organization_status` ON `order` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_organization_customer` ON `order` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `order_organization_engineer` ON `order` (`organization_id`,`engineer_id`);--> statement-breakpoint
INSERT INTO `order`("id", "organization_id", "number", "customer_id", "engineer_id", "type", "status", "priority", "description", "scheduled_for", "completed_at", "labor_hours", "created_at") SELECT "id", "organization_id", "number", "customer_id", "engineer_id", "type", "status", "priority", "description", "scheduled_for", "completed_at", "labor_hours", "created_at" FROM `__old_order`;--> statement-breakpoint
CREATE TABLE `order_unit` (
	`organization_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`equipment_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`order_id`, `equipment_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`,`order_id`) REFERENCES `order`(`customer_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`,`equipment_id`) REFERENCES `equipment`(`customer_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_unit_order_position` ON `order_unit` (`order_id`,`position`);--> statement-breakpoint
CREATE INDEX `order_unit_equipment` ON `order_unit` (`equipment_id`,`order_id`);--> statement-breakpoint
-- Each order's unit, if it had one, is the first of its units.
INSERT INTO `order_unit`("organization_id", "order_id", "customer_id", "equipment_id", "position") SELECT "organization_id", "id", "customer_id", "equipment_id", 0 FROM `__old_order` WHERE "equipment_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO `order_note` SELECT * FROM `__old_order_note`;--> statement-breakpoint
INSERT INTO `order_signoff` SELECT * FROM `__old_order_signoff`;--> statement-breakpoint
INSERT INTO `order_line` SELECT * FROM `__old_order_line`;--> statement-breakpoint
UPDATE `maintenance_plan` SET `last_order_organization_id` = (SELECT `last_order_organization_id` FROM `__old_maintenance_plan` WHERE `__old_maintenance_plan`.`id` = `maintenance_plan`.`id`), `last_order_id` = (SELECT `last_order_id` FROM `__old_maintenance_plan` WHERE `__old_maintenance_plan`.`id` = `maintenance_plan`.`id`) WHERE `id` IN (SELECT `id` FROM `__old_maintenance_plan`);--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'order';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'order', max(coalesce((SELECT max(`seq`) FROM `__old_order_sequence`), 0), coalesce((SELECT max(`id`) FROM `order`), 0));--> statement-breakpoint
DROP TABLE `__old_order_sequence`;--> statement-breakpoint
DROP TABLE `__old_order`;--> statement-breakpoint
DROP TABLE `__old_order_note`;--> statement-breakpoint
DROP TABLE `__old_order_signoff`;--> statement-breakpoint
DROP TABLE `__old_order_line`;--> statement-breakpoint
DROP TABLE `__old_maintenance_plan`;
