CREATE TABLE `maintenance_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`auto_create` integer DEFAULT false NOT NULL,
	`lead_days` integer DEFAULT 30 NOT NULL,
	`remind_customers` integer DEFAULT false NOT NULL,
	`last_run_at` integer,
	`last_run_orders` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
