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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
INSERT INTO `__new_order`("id", "organization_id", "number", "customer_id", "engineer_id", "type", "status", "priority", "description", "scheduled_for", "completed_at", "labor_hours", "created_at") SELECT "id", "organization_id", "number", "customer_id", "engineer_id", "type", "status", "priority", "description", "scheduled_for", "completed_at", "labor_hours", "created_at" FROM `order`;--> statement-breakpoint
-- An order was about one unit at most (`equipment_id`); now it's about any number of them, each
-- the first of its order's units.
INSERT INTO `order_unit`("organization_id", "order_id", "customer_id", "equipment_id", "position") SELECT "organization_id", "id", "customer_id", "equipment_id", 0 FROM `order` WHERE "equipment_id" IS NOT NULL;--> statement-breakpoint
-- What the table's ids have come to (its highest ever, though that row may be gone), kept for the
-- new table: an id is never given again, as the activity log knows records by them.
CREATE TABLE `__old_order_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'order';--> statement-breakpoint
DROP TABLE `order`;--> statement-breakpoint
ALTER TABLE `__new_order` RENAME TO `order`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'order';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'order', max(coalesce((SELECT max(`seq`) FROM `__old_order_sequence`), 0), coalesce((SELECT max(`id`) FROM `order`), 0));--> statement-breakpoint
DROP TABLE `__old_order_sequence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_number` ON `order` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_id` ON `order` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_customer_id` ON `order` (`customer_id`,`id`);--> statement-breakpoint
CREATE INDEX `order_organization_created` ON `order` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_organization_status` ON `order` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_organization_customer` ON `order` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `order_organization_engineer` ON `order` (`organization_id`,`engineer_id`);