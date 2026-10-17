CREATE TABLE `partner_bonus_year` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` integer NOT NULL,
	`year` integer NOT NULL,
	`status` text NOT NULL,
	`partner_revenue` integer NOT NULL,
	`bonus_revenue_cash` integer NOT NULL,
	`bonus_revenue_credit` integer NOT NULL,
	`level` text,
	`cash_rate` integer,
	`credit_rate` integer,
	`cash_amount` integer NOT NULL,
	`credit_amount` integer NOT NULL,
	`credit_valid_until` text NOT NULL,
	`finalised_at` integer NOT NULL,
	`choice` text,
	`chosen_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_bonus_year_organization_id` ON `partner_bonus_year` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `partner_bonus_year_customer_year` ON `partner_bonus_year` (`organization_id`,`customer_id`,`year`);--> statement-breakpoint
CREATE TABLE `partner_order_classification` (
	`organization_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`category` text,
	`eligibility` text,
	`share` integer,
	PRIMARY KEY(`organization_id`, `order_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `partner_account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` integer NOT NULL,
	`accepted_on` text NOT NULL,
	`accepted_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_account_organization_customer` ON `partner_account` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `partner_programme_year` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`year` integer NOT NULL,
	`tiers` text NOT NULL,
	`categories` text NOT NULL,
	`credit_valid_years` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_programme_year_organization_year` ON `partner_programme_year` (`organization_id`,`year`);--> statement-breakpoint
CREATE TABLE `partner_wallet_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` integer NOT NULL,
	`bonus_year_id` integer,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`valid_until` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`bonus_year_id`) REFERENCES `partner_bonus_year`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `partner_wallet_entry_customer` ON `partner_wallet_entry` (`organization_id`,`customer_id`);