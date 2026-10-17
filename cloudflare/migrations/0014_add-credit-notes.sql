CREATE TABLE `credit_note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`invoice_id` integer,
	`status` text NOT NULL,
	`vat_rate` real NOT NULL,
	`reason` text NOT NULL,
	`issued_on` text,
	`settled_on` text,
	`voided_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`invoice_id`) REFERENCES `invoice`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_note_organization_number` ON `credit_note` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_note_organization_id` ON `credit_note` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `credit_note_customer` ON `credit_note` (`customer_id`);--> statement-breakpoint
CREATE INDEX `credit_note_invoice` ON `credit_note` (`organization_id`,`invoice_id`);--> statement-breakpoint
CREATE TABLE `credit_note_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`credit_note_id` integer NOT NULL,
	`description` text NOT NULL,
	`detail` text,
	`quantity` real NOT NULL,
	`unit_price` integer NOT NULL,
	`amount` integer NOT NULL,
	`invoice_line_id` integer,
	`order_id` integer,
	`source` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`credit_note_id`) REFERENCES `credit_note`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`invoice_line_id`) REFERENCES `invoice_line`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `order`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `credit_note_line_credit_note` ON `credit_note_line` (`credit_note_id`);--> statement-breakpoint
CREATE INDEX `credit_note_line_invoice_line` ON `credit_note_line` (`organization_id`,`invoice_line_id`);--> statement-breakpoint
CREATE TABLE `partner_bonus_credit_note` (
	`organization_id` text NOT NULL,
	`bonus_year_id` integer NOT NULL,
	`credit_note_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `bonus_year_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`bonus_year_id`) REFERENCES `partner_bonus_year`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`credit_note_id`) REFERENCES `credit_note`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_bonus_credit_note_credit_note` ON `partner_bonus_credit_note` (`organization_id`,`credit_note_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_line_organization_id` ON `invoice_line` (`organization_id`,`id`);