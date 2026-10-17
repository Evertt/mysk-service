CREATE TABLE `integration_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`module_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_by` text,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_token_hash` ON `integration_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `integration_token_organization_module` ON `integration_token` (`organization_id`,`module_id`);--> statement-breakpoint
CREATE TABLE `dock_escalation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`dock_id` integer NOT NULL,
	`equipment_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`dock_id`) REFERENCES `dock_position`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dock_escalation_door` ON `dock_escalation` (`organization_id`,`equipment_id`);--> statement-breakpoint
CREATE TABLE `dock_event` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`dock_id` integer NOT NULL,
	`type` text NOT NULL,
	`at` integer NOT NULL,
	`payload` text,
	`outcome` text NOT NULL,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`dock_id`) REFERENCES `dock_position`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dock_event_received` ON `dock_event` (`organization_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `dock_position` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`site_id` integer NOT NULL,
	`code` text NOT NULL,
	`position` text DEFAULT '' NOT NULL,
	`location_id` integer,
	`location_organization_id` text,
	`door_id` integer,
	`door_organization_id` text,
	`leveller_id` integer,
	`leveller_organization_id` text,
	`scp_code` text,
	`key_id` text,
	`key_storage_unit` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`site_id`) REFERENCES `customer_site`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_organization_id`,`location_id`) REFERENCES `equipment_location`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`door_organization_id`,`door_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`leveller_organization_id`,`leveller_id`) REFERENCES `equipment`(`organization_id`,`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "dock_position_location_tenant" CHECK("dock_position"."location_organization_id" is null or "dock_position"."location_organization_id" = "dock_position"."organization_id"),
	CONSTRAINT "dock_position_door_tenant" CHECK("dock_position"."door_organization_id" is null or "dock_position"."door_organization_id" = "dock_position"."organization_id"),
	CONSTRAINT "dock_position_leveller_tenant" CHECK("dock_position"."leveller_organization_id" is null or "dock_position"."leveller_organization_id" = "dock_position"."organization_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dock_position_organization_id` ON `dock_position` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `dock_position_organization_code` ON `dock_position` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `dock_position_site` ON `dock_position` (`organization_id`,`site_id`);--> statement-breakpoint
CREATE INDEX `dock_position_door` ON `dock_position` (`door_id`);--> statement-breakpoint
CREATE INDEX `dock_position_leveller` ON `dock_position` (`leveller_id`);--> statement-breakpoint
CREATE TABLE `dock_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`dock_id` integer NOT NULL,
	`carrier` text,
	`plate` text,
	`reference` text,
	`slot_start` integer,
	`slot_end` integer,
	`checked_in_at` integer NOT NULL,
	`locked_at` integer,
	`door_opened_at` integer,
	`door_closed_at` integer,
	`unlocked_at` integer,
	`checked_out_at` integer,
	`door_open_seconds` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`dock_id`) REFERENCES `dock_position`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dock_session_organization_id` ON `dock_session` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `dock_session_dock` ON `dock_session` (`organization_id`,`dock_id`,`checked_in_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `dock_session_open` ON `dock_session` (`dock_id`) WHERE "dock_session"."checked_out_at" is null;--> statement-breakpoint
CREATE TABLE `dock_state` (
	`organization_id` text NOT NULL,
	`dock_id` integer NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`door_open_since` integer,
	`scp_online` integer DEFAULT true NOT NULL,
	`fault_reason` text,
	`key_location` text DEFAULT 'scp' NOT NULL,
	`door_alert` text,
	`last_event_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `dock_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`dock_id`) REFERENCES `dock_position`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
