-- A defect's extent is a percentage of its element now (1–100), not NEN's class (1–5): an element's
-- defects of one category add their extents up, by NEN 2767-1's method. The check changes, which
-- SQLite only does by making the tables anew, keeping their AUTOINCREMENT sequences; each defect,
-- and each rejected point's draft, takes its class's typical value (1, 5, 20, 50 or 85%,
-- `extentPresets`). Then the defects' and their conditions' scores are worked out again, by the
-- norm's tables and method.
-- Their photos refer to both: with the foreign keys off, dropping them takes none along.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_condition_defect` (
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
	CONSTRAINT "condition_defect_extent" CHECK("__new_condition_defect"."extent" between 1 and 100),
	CONSTRAINT "condition_defect_score" CHECK("__new_condition_defect"."score" between 1 and 6)
);--> statement-breakpoint
INSERT INTO `__new_condition_defect`("id", "organization_id", "condition_id", "component_id", "description", "severity", "extent", "intensity", "score", "checklist_point_id", "position") SELECT "id", "organization_id", "condition_id", "component_id", "description", "severity", CASE "extent" WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 20 WHEN 4 THEN 50 ELSE 85 END, "intensity", "score", "checklist_point_id", "position" FROM `condition_defect`;--> statement-breakpoint
CREATE TABLE `__old_condition_defect_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'condition_defect';--> statement-breakpoint
DROP TABLE `condition_defect`;--> statement-breakpoint
ALTER TABLE `__new_condition_defect` RENAME TO `condition_defect`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'condition_defect';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'condition_defect', max(coalesce((SELECT max(`seq`) FROM `__old_condition_defect_sequence`), 0), coalesce((SELECT max(`id`) FROM `condition_defect`), 0));--> statement-breakpoint
DROP TABLE `__old_condition_defect_sequence`;--> statement-breakpoint
CREATE UNIQUE INDEX `condition_defect_organization_id` ON `condition_defect` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `condition_defect_condition` ON `condition_defect` (`organization_id`,`condition_id`,`position`);--> statement-breakpoint
CREATE INDEX `condition_defect_component` ON `condition_defect` (`organization_id`,`component_id`);--> statement-breakpoint
CREATE TABLE `__new_condition_point_defect` (
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
	CONSTRAINT "condition_point_defect_extent" CHECK("__new_condition_point_defect"."extent" between 1 and 100)
);--> statement-breakpoint
INSERT INTO `__new_condition_point_defect`("id", "organization_id", "checklist_point_id", "equipment_id", "severity", "extent", "intensity", "updated_at") SELECT "id", "organization_id", "checklist_point_id", "equipment_id", "severity", CASE "extent" WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 20 WHEN 4 THEN 50 ELSE 85 END, "intensity", "updated_at" FROM `condition_point_defect`;--> statement-breakpoint
CREATE TABLE `__old_condition_point_defect_sequence` AS SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'condition_point_defect';--> statement-breakpoint
DROP TABLE `condition_point_defect`;--> statement-breakpoint
ALTER TABLE `__new_condition_point_defect` RENAME TO `condition_point_defect`;--> statement-breakpoint
DELETE FROM `sqlite_sequence` WHERE `name` = 'condition_point_defect';--> statement-breakpoint
INSERT INTO `sqlite_sequence`(`name`, `seq`) SELECT 'condition_point_defect', max(coalesce((SELECT max(`seq`) FROM `__old_condition_point_defect_sequence`), 0), coalesce((SELECT max(`id`) FROM `condition_point_defect`), 0));--> statement-breakpoint
DROP TABLE `__old_condition_point_defect_sequence`;--> statement-breakpoint
CREATE UNIQUE INDEX `condition_point_defect_organization_id` ON `condition_point_defect` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `condition_point_defect_point` ON `condition_point_defect` (`organization_id`,`checklist_point_id`);--> statement-breakpoint
CREATE INDEX `condition_point_defect_equipment` ON `condition_point_defect` (`organization_id`,`equipment_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Each defect's score alone, and each condition's with defects, by NEN 2767-1's method (the
-- worst element's): `defectScore()` and `recordScore()`.
CREATE TABLE `__nen_points` AS WITH `points`(`category`, `class`, `tenths`) AS (VALUES (1, 1, 1), (1, 2, 2), (1, 3, 6), (1, 4, 12), (1, 5, 20), (2, 1, 2), (2, 2, 6), (2, 3, 12), (2, 4, 20), (2, 5, 100), (3, 1, 6), (3, 2, 12), (3, 3, 20), (3, 4, 100), (3, 5, 300), (4, 1, 12), (4, 2, 20), (4, 3, 100), (4, 4, 300), (4, 5, 700), (5, 1, 20), (5, 2, 100), (5, 3, 300), (5, 4, 700), (5, 5, 1000)) SELECT * FROM `points`;--> statement-breakpoint
UPDATE `condition_defect` SET `score` = (SELECT (CASE WHEN p.`tenths` <= 12 THEN 1 WHEN p.`tenths` <= 20 THEN 2 WHEN p.`tenths` <= 100 THEN 3 WHEN p.`tenths` <= 300 THEN 4 WHEN p.`tenths` <= 700 THEN 5 ELSE 6 END) FROM `__nen_points` p WHERE p.`category` = (CASE `severity` WHEN 'slight' THEN 0 WHEN 'serious' THEN 1 ELSE 2 END + CASE `intensity` WHEN 'initial' THEN 1 WHEN 'advanced' THEN 2 ELSE 3 END) AND p.`class` = (CASE WHEN `extent` < 2 THEN 1 WHEN `extent` < 10 THEN 2 WHEN `extent` < 30 THEN 3 WHEN `extent` < 70 THEN 4 ELSE 5 END));--> statement-breakpoint
CREATE TABLE `__nen_scores` AS WITH `sums` AS (SELECT `condition_id`, `component_id`, (CASE `severity` WHEN 'slight' THEN 0 WHEN 'serious' THEN 1 ELSE 2 END + CASE `intensity` WHEN 'initial' THEN 1 WHEN 'advanced' THEN 2 ELSE 3 END) AS `category`, min(100, sum(`extent`)) AS `extent` FROM `condition_defect` GROUP BY `condition_id`, `component_id`, (CASE `severity` WHEN 'slight' THEN 0 WHEN 'serious' THEN 1 ELSE 2 END + CASE `intensity` WHEN 'initial' THEN 1 WHEN 'advanced' THEN 2 ELSE 3 END)), `elements` AS (SELECT s.`condition_id`, s.`component_id`, sum(p.`tenths`) AS `tenths` FROM `sums` s JOIN `__nen_points` p ON p.`category` = s.`category` AND p.`class` = (CASE WHEN s.`extent` < 2 THEN 1 WHEN s.`extent` < 10 THEN 2 WHEN s.`extent` < 30 THEN 3 WHEN s.`extent` < 70 THEN 4 ELSE 5 END) GROUP BY s.`condition_id`, s.`component_id`) SELECT `condition_id`, max((CASE WHEN `tenths` <= 12 THEN 1 WHEN `tenths` <= 20 THEN 2 WHEN `tenths` <= 100 THEN 3 WHEN `tenths` <= 300 THEN 4 WHEN `tenths` <= 700 THEN 5 ELSE 6 END)) AS `score` FROM `elements` GROUP BY `condition_id`;--> statement-breakpoint
UPDATE `unit_condition` SET `score` = (SELECT s.`score` FROM `__nen_scores` s WHERE s.`condition_id` = `unit_condition`.`id`) WHERE `id` IN (SELECT `condition_id` FROM `__nen_scores`);--> statement-breakpoint
DROP TABLE `__nen_scores`;--> statement-breakpoint
DROP TABLE `__nen_points`;
