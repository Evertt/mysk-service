CREATE TABLE `component` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`equipment_id` integer NOT NULL,
	`number` text NOT NULL,
	`name` text NOT NULL,
	`material_id` integer,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `component_organization_id` ON `component` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `component_organization_number` ON `component` (`organization_id`,`number`);--> statement-breakpoint
CREATE INDEX `component_equipment` ON `component` (`organization_id`,`equipment_id`,`position`);--> statement-breakpoint
CREATE TABLE `component_checkpoint` (
	`organization_id` text NOT NULL,
	`component_id` integer NOT NULL,
	`template_item_id` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `component_id`, `template_item_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`component_id`) REFERENCES `component`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `component_checkpoint_item` ON `component_checkpoint` (`organization_id`,`template_item_id`);--> statement-breakpoint
-- A condition may be a component's now (`component_id`, a key to `component` with the tenant):
-- a new composite key, which SQLite only gets by making the table anew. The conditions are
-- copied over, each the unit's as a whole, and the table's AUTOINCREMENT sequence is kept, so
-- an id is never given again (the activity log knows records by them). Nothing refers to
-- `unit_condition`, so dropping it takes nothing along.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_unit_condition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`equipment_id` integer NOT NULL,
	`component_id` integer,
	`score` integer NOT NULL,
	`advice` text,
	`source` text NOT NULL,
	`order_id` integer,
	`order_organization_id` text,
	`engineer_id` integer,
	`user_id` text,
	`recorded_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`component_id`) REFERENCES `component`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`engineer_id`) REFERENCES `engineer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "unit_condition_score" CHECK("__new_unit_condition"."score" between 0 and 100),
	CONSTRAINT "unit_condition_order_tenant" CHECK("__new_unit_condition"."order_organization_id" is null or "__new_unit_condition"."order_organization_id" = "__new_unit_condition"."organization_id")
);
--> statement-breakpoint
INSERT INTO `__new_unit_condition`("id", "organization_id", "equipment_id", "score", "advice", "source", "order_id", "order_organization_id", "engineer_id", "user_id", "recorded_at", "created_at") SELECT "id", "organization_id", "equipment_id", "score", "advice", "source", "order_id", "order_organization_id", "engineer_id", "user_id", "recorded_at", "created_at" FROM `unit_condition`;--> statement-breakpoint
CREATE TABLE `__old_unit_condition_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'unit_condition';--> statement-breakpoint
DROP TABLE `unit_condition`;--> statement-breakpoint
ALTER TABLE `__new_unit_condition` RENAME TO `unit_condition`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'unit_condition';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'unit_condition', max(coalesce((SELECT max(`seq`) FROM `__old_unit_condition_sequence`), 0), coalesce((SELECT max(`id`) FROM `unit_condition`), 0));--> statement-breakpoint
DROP TABLE `__old_unit_condition_sequence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `unit_condition_organization_id` ON `unit_condition` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `unit_condition_equipment` ON `unit_condition` (`organization_id`,`equipment_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `unit_condition_component` ON `unit_condition` (`organization_id`,`component_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `unit_condition_order` ON `unit_condition` (`order_organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `unit_condition_engineer` ON `unit_condition` (`organization_id`,`engineer_id`);--> statement-breakpoint
CREATE INDEX `unit_condition_user` ON `unit_condition` (`user_id`);