CREATE TABLE `checklist_template` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`norm` text,
	`validity_months` integer DEFAULT 12 NOT NULL,
	`position` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_organization_id` ON `checklist_template` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_organization_name` ON `checklist_template` (`organization_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `checklist_template_organization_position` ON `checklist_template` (`organization_id`,`position`);--> statement-breakpoint
CREATE TABLE `checklist_template_category` (
	`organization_id` text NOT NULL,
	`category_id` integer NOT NULL,
	`template_id` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `category_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`template_id`) REFERENCES `checklist_template`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`category_id`) REFERENCES `equipment_category`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_template_category_template` ON `checklist_template_category` (`template_id`);--> statement-breakpoint
CREATE TABLE `checklist_template_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`template_id` integer NOT NULL,
	`group_name` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`template_id`) REFERENCES `checklist_template`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_template_item_organization_id` ON `checklist_template_item` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `checklist_template_item_template` ON `checklist_template_item` (`template_id`,`position`);