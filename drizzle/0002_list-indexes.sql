CREATE INDEX `customer_organization_name` ON `customer` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `engineer_organization_name` ON `engineer` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `equipment_organization_customer` ON `equipment` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_unit` ON `equipment` (`organization_id`,`manufacturer`,`model`);--> statement-breakpoint
CREATE INDEX `material_organization_name` ON `material` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `order_organization_created` ON `order` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_organization_status` ON `order` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_organization_customer` ON `order` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `order_organization_engineer` ON `order` (`organization_id`,`engineer_id`);--> statement-breakpoint
CREATE INDEX `order_equipment_status` ON `order` (`equipment_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_line_order` ON `order_line` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_line_material` ON `order_line` (`organization_id`,`material_id`,`order_id`);