CREATE TABLE `shop_category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_category_organization_id` ON `shop_category` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shop_category_organization_name` ON `shop_category` (`organization_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `shop_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`placed_by` text,
	`status` text DEFAULT 'placed' NOT NULL,
	`payment` text DEFAULT 'parts_credit' NOT NULL,
	`total` integer NOT NULL,
	`vat` integer DEFAULT 0 NOT NULL,
	`wallet_entry_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`placed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`customer_id`) REFERENCES `customer`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`wallet_entry_id`) REFERENCES `partner_wallet_entry`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_order_organization_id` ON `shop_order` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shop_order_organization_number` ON `shop_order` (`organization_id`,`number`);--> statement-breakpoint
CREATE INDEX `shop_order_customer` ON `shop_order` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `shop_order_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` integer NOT NULL,
	`material_id` integer NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`order_id`) REFERENCES `shop_order`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`material_id`) REFERENCES `material`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shop_order_line_order` ON `shop_order_line` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `shop_product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`material_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`description` text,
	`unit` text NOT NULL,
	`popular` integer DEFAULT false NOT NULL,
	`credit_eligible` integer DEFAULT true NOT NULL,
	`on_request` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`material_id`) REFERENCES `material`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`category_id`) REFERENCES `shop_category`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_product_organization_id` ON `shop_product` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shop_product_organization_material` ON `shop_product` (`organization_id`,`material_id`);--> statement-breakpoint
CREATE INDEX `shop_product_category` ON `shop_product` (`organization_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `shop_product_checkpoint` (
	`organization_id` text NOT NULL,
	`product_id` integer NOT NULL,
	`template_item_id` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `product_id`, `template_item_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`product_id`) REFERENCES `shop_product`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shop_product_checkpoint_item` ON `shop_product_checkpoint` (`organization_id`,`template_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `partner_wallet_entry_organization_id` ON `partner_wallet_entry` (`organization_id`,`id`);