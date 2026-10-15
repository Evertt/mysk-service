CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`user_name` text NOT NULL,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_label` text NOT NULL,
	`parent_type` text,
	`parent_id` text,
	`parent_label` text,
	`changes` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_organization` ON `activity` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `activity_subject` ON `activity` (`organization_id`,`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `activity_parent` ON `activity` (`organization_id`,`parent_type`,`parent_id`);--> statement-breakpoint
CREATE TABLE `customer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`segment` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_organization_code` ON `customer` (`organization_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_organization_id` ON `customer` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `customer_organization_name` ON `customer` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `engineer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`specialty` text NOT NULL,
	`region` text NOT NULL,
	`hourly_rate` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`hired_at` text NOT NULL,
	`user_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engineer_organization_email` ON `engineer` (`organization_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `engineer_organization_id` ON `engineer` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engineer_organization_user` ON `engineer` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `engineer_organization_name` ON `engineer` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`serial_number` text NOT NULL,
	`model` text NOT NULL,
	`manufacturer` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`customer_id` integer NOT NULL,
	`installed_at` text NOT NULL,
	`warranty_until` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_serial_number` ON `equipment` (`organization_id`,`serial_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_id` ON `equipment` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_customer_id` ON `equipment` (`customer_id`,`id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_customer` ON `equipment` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_unit` ON `equipment` (`organization_id`,`manufacturer`,`model`);--> statement-breakpoint
CREATE TABLE `order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`equipment_id` integer,
	`engineer_id` integer,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`description` text NOT NULL,
	`scheduled_for` integer,
	`completed_at` integer,
	`labor_hours` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`equipment_id`) REFERENCES `equipment`(`customer_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`engineer_id`) REFERENCES `engineer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_number` ON `order` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_id` ON `order` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `order_organization_created` ON `order` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_organization_status` ON `order` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_organization_customer` ON `order` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `order_organization_engineer` ON `order` (`organization_id`,`engineer_id`);--> statement-breakpoint
CREATE INDEX `order_equipment_status` ON `order` (`equipment_id`,`status`);--> statement-breakpoint
CREATE TABLE `order_note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`user_id` text,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_note_order` ON `order_note` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_signoff` (
	`order_id` integer PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`signer_name` text NOT NULL,
	`signature` text NOT NULL,
	`user_id` text,
	`signed_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organization_module` (
	`organization_id` text NOT NULL,
	`module_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `module_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `saved_view` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`table_key` text NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`columns` text,
	`shared` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_view_user_table_name` ON `saved_view` (`organization_id`,`user_id`,`table_key`,`name`);--> statement-breakpoint
CREATE INDEX `saved_view_table` ON `saved_view` (`organization_id`,`table_key`);--> statement-breakpoint
CREATE TABLE `table_memory` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`table_key` text NOT NULL,
	`columns` text,
	`query` text DEFAULT '' NOT NULL,
	`view_id` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`, `table_key`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `contract` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`level` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`monthly_fee` integer NOT NULL,
	`response_hours` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_organization_number` ON `contract` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `contract_customer_id` ON `contract` (`customer_id`,`id`);--> statement-breakpoint
CREATE TABLE `contract_equipment` (
	`customer_id` integer NOT NULL,
	`contract_id` integer NOT NULL,
	`equipment_id` integer NOT NULL,
	PRIMARY KEY(`contract_id`, `equipment_id`),
	FOREIGN KEY (`customer_id`,`contract_id`) REFERENCES `contract`(`customer_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`,`equipment_id`) REFERENCES `equipment`(`customer_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoice` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`status` text NOT NULL,
	`payment_term_days` integer NOT NULL,
	`vat_rate` real NOT NULL,
	`issued_on` text,
	`due_on` text,
	`paid_on` text,
	`voided_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_organization_number` ON `invoice` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_organization_id` ON `invoice` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `invoice_customer` ON `invoice` (`customer_id`);--> statement-breakpoint
CREATE TABLE `invoice_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` integer NOT NULL,
	`description` text NOT NULL,
	`detail` text,
	`quantity` real NOT NULL,
	`unit_price` integer NOT NULL,
	`amount` integer NOT NULL,
	`order_id` integer,
	`source` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`invoice_id`) REFERENCES `invoice`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoice_line_invoice` ON `invoice_line` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_line_order` ON `invoice_line` (`order_id`);--> statement-breakpoint
CREATE INDEX `invoice_line_source` ON `invoice_line` (`organization_id`,`source`);--> statement-breakpoint
CREATE TABLE `invoicing_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`vat_rate` real DEFAULT 21 NOT NULL,
	`payment_term_days` integer DEFAULT 30 NOT NULL,
	`bill_from` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `maintenance_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`equipment_id` integer NOT NULL,
	`order_type` text NOT NULL,
	`description` text NOT NULL,
	`interval_months` integer NOT NULL,
	`next_due_on` text NOT NULL,
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
CREATE INDEX `maintenance_plan_equipment` ON `maintenance_plan` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `material` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`unit_price` integer NOT NULL,
	`stock` real NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_organization_sku` ON `material` (`organization_id`,`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `material_organization_id` ON `material` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `material_organization_name` ON `material` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `order_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`material_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`material_id`) REFERENCES `material`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_line_order` ON `order_line` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_line_material` ON `order_line` (`organization_id`,`material_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `stock_movement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`material_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`kind` text NOT NULL,
	`order_id` integer,
	`order_number` text,
	`user_id` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`material_id`) REFERENCES `material`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_movement_material` ON `stock_movement` (`material_id`,`created_at`);