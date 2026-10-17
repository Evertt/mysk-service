CREATE TABLE `checklist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`equipment_id` integer NOT NULL,
	`template_id` integer NOT NULL,
	`name` text NOT NULL,
	`norm` text,
	`validity_months` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`remarks` text,
	`completed_at` integer,
	`completed_by` integer,
	`valid_until` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`,`equipment_id`) REFERENCES `order_unit`(`organization_id`,`order_id`,`equipment_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`template_id`) REFERENCES `checklist_template`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`completed_by`) REFERENCES `engineer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_organization_id` ON `checklist` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_order_equipment` ON `checklist` (`order_id`,`equipment_id`);--> statement-breakpoint
CREATE INDEX `checklist_equipment` ON `checklist` (`equipment_id`,`kind`,`completed_at`);--> statement-breakpoint
CREATE TABLE `checklist_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`checklist_id` integer NOT NULL,
	`group_name` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`position` integer NOT NULL,
	`result` text,
	`remark` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`checklist_id`) REFERENCES `checklist`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_result_organization_id` ON `checklist_result` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_result_checklist_position` ON `checklist_result` (`checklist_id`,`position`);--> statement-breakpoint
ALTER TABLE `order_signoff` ADD `engineer_name` text;--> statement-breakpoint
ALTER TABLE `order_signoff` ADD `engineer_signature` text;--> statement-breakpoint
CREATE UNIQUE INDEX `order_unit_organization_order_equipment` ON `order_unit` (`organization_id`,`order_id`,`equipment_id`);