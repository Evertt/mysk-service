CREATE TABLE `condition_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`critical_below` integer DEFAULT 40 NOT NULL,
	`attention_below` integer DEFAULT 70 NOT NULL,
	`auto_plan` integer DEFAULT false NOT NULL,
	`last_run_at` integer,
	`last_run_orders` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `unit_condition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`equipment_id` integer NOT NULL,
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
	FOREIGN KEY (`order_organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`engineer_id`) REFERENCES `engineer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "unit_condition_score" CHECK("unit_condition"."score" between 0 and 100),
	CONSTRAINT "unit_condition_order_tenant" CHECK("unit_condition"."order_organization_id" is null or "unit_condition"."order_organization_id" = "unit_condition"."organization_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_condition_organization_id` ON `unit_condition` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `unit_condition_equipment` ON `unit_condition` (`equipment_id`,`recorded_at`);