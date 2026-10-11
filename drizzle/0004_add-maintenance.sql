CREATE TABLE `maintenance_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`equipment_id` integer NOT NULL,
	`order_type` text NOT NULL,
	`description` text NOT NULL,
	`interval_months` integer NOT NULL,
	`next_due_on` integer NOT NULL,
	`anchor_day` integer NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`last_order_id` integer,
	`last_order_organization_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_order_organization_id`,`last_order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "maintenance_plan_last_order_tenant" CHECK("maintenance_plan"."last_order_organization_id" is null or "maintenance_plan"."last_order_organization_id" = "maintenance_plan"."organization_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_plan_organization_id` ON `maintenance_plan` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `maintenance_plan_organization_next_due` ON `maintenance_plan` (`organization_id`,`next_due_on`);--> statement-breakpoint
CREATE INDEX `maintenance_plan_equipment` ON `maintenance_plan` (`equipment_id`);