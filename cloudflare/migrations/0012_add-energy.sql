CREATE TABLE `energy_alert` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`energy_site_id` integer NOT NULL,
	`zone_id` integer NOT NULL,
	`door_id` integer,
	`key` text NOT NULL,
	`metric` text NOT NULL,
	`severity` text NOT NULL,
	`threshold` real NOT NULL,
	`measured` real NOT NULL,
	`at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`order_id` integer,
	`order_organization_id` text,
	`done_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`energy_site_id`) REFERENCES `energy_site`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`zone_id`) REFERENCES `energy_zone`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`door_id`) REFERENCES `energy_door`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "energy_alert_order_tenant" CHECK("energy_alert"."order_organization_id" is null or "energy_alert"."order_organization_id" = "energy_alert"."organization_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `energy_alert_organization_id` ON `energy_alert` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `energy_alert_key` ON `energy_alert` (`organization_id`,`key`);--> statement-breakpoint
CREATE INDEX `energy_alert_site` ON `energy_alert` (`energy_site_id`,`status`,`at`);--> statement-breakpoint
CREATE TABLE `energy_consumer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`zone_id` integer NOT NULL,
	`name` text NOT NULL,
	`rated_kw` real NOT NULL,
	`equipment_id` integer,
	`equipment_organization_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`zone_id`) REFERENCES `energy_zone`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "energy_consumer_equipment_tenant" CHECK("energy_consumer"."equipment_organization_id" is null or "energy_consumer"."equipment_organization_id" = "energy_consumer"."organization_id")
);
--> statement-breakpoint
CREATE INDEX `energy_consumer_zone` ON `energy_consumer` (`zone_id`);--> statement-breakpoint
CREATE TABLE `energy_door` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`energy_site_id` integer NOT NULL,
	`zone_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`loss_kw` real NOT NULL,
	`threshold_minutes` integer NOT NULL,
	`inside_c` real,
	`outside_c` real,
	`equipment_id` integer,
	`equipment_organization_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`energy_site_id`) REFERENCES `energy_site`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`energy_site_id`,`zone_id`) REFERENCES `energy_zone`(`energy_site_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_organization_id`,`equipment_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "energy_door_threshold" CHECK("energy_door"."threshold_minutes" > 0),
	CONSTRAINT "energy_door_equipment_tenant" CHECK("energy_door"."equipment_organization_id" is null or "energy_door"."equipment_organization_id" = "energy_door"."organization_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `energy_door_organization_id` ON `energy_door` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `energy_door_site_code` ON `energy_door` (`energy_site_id`,`code`);--> statement-breakpoint
CREATE TABLE `energy_door_event` (
	`organization_id` text NOT NULL,
	`door_id` integer NOT NULL,
	`at` integer NOT NULL,
	`open` integer NOT NULL,
	PRIMARY KEY(`door_id`, `at`, `open`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`door_id`) REFERENCES `energy_door`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `energy_reading` (
	`organization_id` text NOT NULL,
	`zone_id` integer NOT NULL,
	`start` integer NOT NULL,
	`avg_kw` real NOT NULL,
	`peak_kw` real NOT NULL,
	`kwh` real NOT NULL,
	PRIMARY KEY(`zone_id`, `start`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`zone_id`) REFERENCES `energy_zone`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `energy_site` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` integer NOT NULL,
	`name` text NOT NULL,
	`meter_name` text NOT NULL,
	`contracted_peak_kw` real NOT NULL,
	`contracted_kwh_per_year` integer NOT NULL,
	`pv_capacity_kw` real DEFAULT 0 NOT NULL,
	`tariff` real DEFAULT 0.28 NOT NULL,
	`co2_factor` real DEFAULT 0.375 NOT NULL,
	`time_zone` text DEFAULT 'Europe/Amsterdam' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`) REFERENCES `customer_site`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `energy_site_organization_id` ON `energy_site` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `energy_site_site` ON `energy_site` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `energy_threshold` (
	`zone_id` integer PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`enabled` integer NOT NULL,
	`max_kw` real NOT NULL,
	`max_kwh` real NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`zone_id`) REFERENCES `energy_zone`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `energy_zone` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`energy_site_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`floor` text,
	`area_m2` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`energy_site_id`) REFERENCES `energy_site`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `energy_zone_organization_id` ON `energy_zone` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `energy_zone_site_id` ON `energy_zone` (`energy_site_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `energy_zone_site_code` ON `energy_zone` (`energy_site_id`,`code`);