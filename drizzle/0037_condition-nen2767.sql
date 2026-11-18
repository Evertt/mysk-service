-- Conditions are scored on NEN 2767's scale now, 1 (excellent) to 6 (very poor), from their
-- defects, instead of a percentage. The score's check changes, which SQLite only does by making
-- the table anew: each condition gets its score by its percentage's band (90% or more is 1,
-- 80–89% 2, 70–79% 3, 40–69% 4, 20–39% 5, below 20% 6: `scoreOfPercent()`) and keeps the
-- percentage in `legacy_percent`, which marks it converted (it has no defects). The table's
-- AUTOINCREMENT sequence is kept, so an id is never given again (the activity log knows records by
-- them). Nothing refers to `unit_condition` yet, so dropping it takes nothing along; the defects'
-- tables, which do, are made after.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_unit_condition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`equipment_id` integer NOT NULL,
	`component_id` integer,
	`score` integer NOT NULL,
	`legacy_percent` integer,
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
	FOREIGN KEY (`order_organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`component_id`) REFERENCES `component`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`engineer_id`) REFERENCES `engineer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "unit_condition_order_tenant" CHECK("__new_unit_condition"."order_organization_id" is null or "__new_unit_condition"."order_organization_id" = "__new_unit_condition"."organization_id"),
	CONSTRAINT "unit_condition_score" CHECK("__new_unit_condition"."score" between 1 and 6)
);
--> statement-breakpoint
INSERT INTO `__new_unit_condition`("id", "organization_id", "equipment_id", "component_id", "score", "legacy_percent", "advice", "source", "order_id", "order_organization_id", "engineer_id", "user_id", "recorded_at", "created_at") SELECT "id", "organization_id", "equipment_id", "component_id", CASE WHEN "score" >= 90 THEN 1 WHEN "score" >= 80 THEN 2 WHEN "score" >= 70 THEN 3 WHEN "score" >= 40 THEN 4 WHEN "score" >= 20 THEN 5 ELSE 6 END, "score", "advice", "source", "order_id", "order_organization_id", "engineer_id", "user_id", "recorded_at", "created_at" FROM `unit_condition`;--> statement-breakpoint
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
CREATE INDEX `unit_condition_user` ON `unit_condition` (`user_id`);--> statement-breakpoint
CREATE TABLE `condition_defect` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`condition_id` integer NOT NULL,
	`component_id` integer,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`extent` integer NOT NULL,
	`intensity` text NOT NULL,
	`score` integer NOT NULL,
	`checklist_point_id` integer,
	`position` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`condition_id`) REFERENCES `unit_condition`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`component_id`) REFERENCES `component`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_defect_extent" CHECK("condition_defect"."extent" between 1 and 5),
	CONSTRAINT "condition_defect_score" CHECK("condition_defect"."score" between 1 and 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `condition_defect_organization_id` ON `condition_defect` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `condition_defect_condition` ON `condition_defect` (`organization_id`,`condition_id`,`position`);--> statement-breakpoint
CREATE INDEX `condition_defect_component` ON `condition_defect` (`organization_id`,`component_id`);--> statement-breakpoint
CREATE TABLE `condition_point_defect` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`checklist_point_id` integer NOT NULL,
	`equipment_id` integer NOT NULL,
	`severity` text NOT NULL,
	`extent` integer NOT NULL,
	`intensity` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_point_defect_extent" CHECK("condition_point_defect"."extent" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `condition_point_defect_organization_id` ON `condition_point_defect` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `condition_point_defect_point` ON `condition_point_defect` (`organization_id`,`checklist_point_id`);--> statement-breakpoint
CREATE INDEX `condition_point_defect_equipment` ON `condition_point_defect` (`organization_id`,`equipment_id`);--> statement-breakpoint
CREATE TABLE `condition_defect_photo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`equipment_id` integer NOT NULL,
	`defect_id` integer,
	`point_defect_id` integer,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`defect_id`) REFERENCES `condition_defect`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`point_defect_id`) REFERENCES `condition_point_defect`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "condition_defect_photo_owner" CHECK(("condition_defect_photo"."defect_id" is null) <> ("condition_defect_photo"."point_defect_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `condition_defect_photo_organization_id` ON `condition_defect_photo` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `condition_defect_photo_equipment` ON `condition_defect_photo` (`organization_id`,`equipment_id`);--> statement-breakpoint
CREATE INDEX `condition_defect_photo_defect` ON `condition_defect_photo` (`organization_id`,`defect_id`,`position`);--> statement-breakpoint
CREATE INDEX `condition_defect_photo_point` ON `condition_defect_photo` (`organization_id`,`point_defect_id`);--> statement-breakpoint
-- The thresholds are scores from which a unit is critical and needs attention now, instead of
-- percentages below which: each maps by the same bands, from the highest percentage still below
-- it (`criticalFrom = band(critical_below − 1)`), so the defaults 40 and 70 become 5 and 4. A pair
-- that maps onto one score, or outside 2–6, is moved apart so attention stays below critical.
ALTER TABLE `condition_settings` ADD `critical_from` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `condition_settings` ADD `attention_from` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
UPDATE `condition_settings` SET `critical_from` = max(3, CASE WHEN `critical_below` - 1 >= 90 THEN 1 WHEN `critical_below` - 1 >= 80 THEN 2 WHEN `critical_below` - 1 >= 70 THEN 3 WHEN `critical_below` - 1 >= 40 THEN 4 WHEN `critical_below` - 1 >= 20 THEN 5 ELSE 6 END), `attention_from` = CASE WHEN `attention_below` - 1 >= 90 THEN 1 WHEN `attention_below` - 1 >= 80 THEN 2 WHEN `attention_below` - 1 >= 70 THEN 3 WHEN `attention_below` - 1 >= 40 THEN 4 WHEN `attention_below` - 1 >= 20 THEN 5 ELSE 6 END;--> statement-breakpoint
UPDATE `condition_settings` SET `attention_from` = min(`critical_from` - 1, max(2, `attention_from`));--> statement-breakpoint
ALTER TABLE `condition_settings` DROP COLUMN `critical_below`;--> statement-breakpoint
ALTER TABLE `condition_settings` DROP COLUMN `attention_below`;
