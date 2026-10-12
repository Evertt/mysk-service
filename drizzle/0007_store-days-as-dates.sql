DROP INDEX "activity_organization";--> statement-breakpoint
DROP INDEX "activity_subject";--> statement-breakpoint
DROP INDEX "activity_parent";--> statement-breakpoint
DROP INDEX "customer_organization_code";--> statement-breakpoint
DROP INDEX "customer_organization_id";--> statement-breakpoint
DROP INDEX "customer_organization_name";--> statement-breakpoint
DROP INDEX "engineer_organization_email";--> statement-breakpoint
DROP INDEX "engineer_organization_id";--> statement-breakpoint
DROP INDEX "engineer_organization_user";--> statement-breakpoint
DROP INDEX "engineer_organization_name";--> statement-breakpoint
DROP INDEX "equipment_organization_serial_number";--> statement-breakpoint
DROP INDEX "equipment_organization_id";--> statement-breakpoint
DROP INDEX "equipment_customer_id";--> statement-breakpoint
DROP INDEX "equipment_organization_customer";--> statement-breakpoint
DROP INDEX "equipment_organization_unit";--> statement-breakpoint
DROP INDEX "order_organization_number";--> statement-breakpoint
DROP INDEX "order_organization_id";--> statement-breakpoint
DROP INDEX "order_organization_created";--> statement-breakpoint
DROP INDEX "order_organization_status";--> statement-breakpoint
DROP INDEX "order_organization_customer";--> statement-breakpoint
DROP INDEX "order_organization_engineer";--> statement-breakpoint
DROP INDEX "order_equipment_status";--> statement-breakpoint
DROP INDEX "order_note_order";--> statement-breakpoint
DROP INDEX "saved_view_user_table_name";--> statement-breakpoint
DROP INDEX "saved_view_table";--> statement-breakpoint
DROP INDEX "account_userId_idx";--> statement-breakpoint
DROP INDEX "invitation_organizationId_idx";--> statement-breakpoint
DROP INDEX "invitation_email_idx";--> statement-breakpoint
DROP INDEX "member_organizationId_idx";--> statement-breakpoint
DROP INDEX "member_userId_idx";--> statement-breakpoint
DROP INDEX "organization_slug_unique";--> statement-breakpoint
DROP INDEX "session_token_unique";--> statement-breakpoint
DROP INDEX "session_userId_idx";--> statement-breakpoint
DROP INDEX "user_email_unique";--> statement-breakpoint
DROP INDEX "verification_identifier_idx";--> statement-breakpoint
DROP INDEX "contract_organization_number";--> statement-breakpoint
DROP INDEX "contract_customer_id";--> statement-breakpoint
DROP INDEX "invoice_organization_number";--> statement-breakpoint
DROP INDEX "invoice_organization_id";--> statement-breakpoint
DROP INDEX "invoice_customer";--> statement-breakpoint
DROP INDEX "invoice_line_invoice";--> statement-breakpoint
DROP INDEX "invoice_line_order";--> statement-breakpoint
DROP INDEX "invoice_line_source";--> statement-breakpoint
DROP INDEX "maintenance_plan_organization_id";--> statement-breakpoint
DROP INDEX "maintenance_plan_organization_next_due";--> statement-breakpoint
DROP INDEX "maintenance_plan_equipment";--> statement-breakpoint
DROP INDEX "material_organization_sku";--> statement-breakpoint
DROP INDEX "material_organization_id";--> statement-breakpoint
DROP INDEX "material_organization_name";--> statement-breakpoint
DROP INDEX "order_line_order";--> statement-breakpoint
DROP INDEX "order_line_material";--> statement-breakpoint
DROP INDEX "stock_movement_material";--> statement-breakpoint
ALTER TABLE `engineer` ALTER COLUMN "hired_at" TO "hired_at" text NOT NULL;--> statement-breakpoint
CREATE INDEX `activity_organization` ON `activity` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `activity_subject` ON `activity` (`organization_id`,`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `activity_parent` ON `activity` (`organization_id`,`parent_type`,`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_organization_code` ON `customer` (`organization_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_organization_id` ON `customer` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `customer_organization_name` ON `customer` (`organization_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `engineer_organization_email` ON `engineer` (`organization_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `engineer_organization_id` ON `engineer` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engineer_organization_user` ON `engineer` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `engineer_organization_name` ON `engineer` (`organization_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_serial_number` ON `equipment` (`organization_id`,`serial_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_organization_id` ON `equipment` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_customer_id` ON `equipment` (`customer_id`,`id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_customer` ON `equipment` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `equipment_organization_unit` ON `equipment` (`organization_id`,`manufacturer`,`model`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_number` ON `order` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_organization_id` ON `order` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `order_organization_created` ON `order` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_organization_status` ON `order` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_organization_customer` ON `order` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `order_organization_engineer` ON `order` (`organization_id`,`engineer_id`);--> statement-breakpoint
CREATE INDEX `order_equipment_status` ON `order` (`equipment_id`,`status`);--> statement-breakpoint
CREATE INDEX `order_note_order` ON `order_note` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `saved_view_user_table_name` ON `saved_view` (`organization_id`,`user_id`,`table_key`,`name`);--> statement-breakpoint
CREATE INDEX `saved_view_table` ON `saved_view` (`organization_id`,`table_key`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `contract_organization_number` ON `contract` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `contract_customer_id` ON `contract` (`customer_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_organization_number` ON `invoice` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_organization_id` ON `invoice` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `invoice_customer` ON `invoice` (`customer_id`);--> statement-breakpoint
CREATE INDEX `invoice_line_invoice` ON `invoice_line` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_line_order` ON `invoice_line` (`order_id`);--> statement-breakpoint
CREATE INDEX `invoice_line_source` ON `invoice_line` (`organization_id`,`source`);--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_plan_organization_id` ON `maintenance_plan` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `maintenance_plan_organization_next_due` ON `maintenance_plan` (`organization_id`,`next_due_on`);--> statement-breakpoint
CREATE INDEX `maintenance_plan_equipment` ON `maintenance_plan` (`equipment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `material_organization_sku` ON `material` (`organization_id`,`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `material_organization_id` ON `material` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `material_organization_name` ON `material` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `order_line_order` ON `order_line` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_line_material` ON `order_line` (`organization_id`,`material_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `stock_movement_material` ON `stock_movement` (`material_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `equipment` ALTER COLUMN "installed_at" TO "installed_at" text NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ALTER COLUMN "warranty_until" TO "warranty_until" text NOT NULL;--> statement-breakpoint
ALTER TABLE `contract` ALTER COLUMN "starts_on" TO "starts_on" text NOT NULL;--> statement-breakpoint
ALTER TABLE `contract` ALTER COLUMN "ends_on" TO "ends_on" text NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice` ALTER COLUMN "issued_on" TO "issued_on" text;--> statement-breakpoint
ALTER TABLE `invoice` ALTER COLUMN "due_on" TO "due_on" text;--> statement-breakpoint
ALTER TABLE `invoice` ALTER COLUMN "paid_on" TO "paid_on" text;--> statement-breakpoint
ALTER TABLE `invoicing_settings` ALTER COLUMN "bill_from" TO "bill_from" text NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance_plan` ALTER COLUMN "next_due_on" TO "next_due_on" text NOT NULL;--> statement-breakpoint
-- The days were stored as moments (seconds since 1970): each is now its day (`yyyy-mm-dd`) in
-- Amsterdam's time zone (from the last Sunday of March to the last of October, 01:00 UTC, two
-- hours ahead of UTC; else one). A day stored as Amsterdam's midnight or as UTC's gets its own day.
-- (Changing the column's type may have kept a number as its digits: what has no dashes yet is one.)
UPDATE `engineer` SET `hired_at` = date(`hired_at` + (case when `hired_at` >= unixepoch(date(strftime('%Y', `hired_at`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `hired_at` < unixepoch(date(strftime('%Y', `hired_at`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `hired_at` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `equipment` SET `installed_at` = date(`installed_at` + (case when `installed_at` >= unixepoch(date(strftime('%Y', `installed_at`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `installed_at` < unixepoch(date(strftime('%Y', `installed_at`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `installed_at` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `equipment` SET `warranty_until` = date(`warranty_until` + (case when `warranty_until` >= unixepoch(date(strftime('%Y', `warranty_until`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `warranty_until` < unixepoch(date(strftime('%Y', `warranty_until`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `warranty_until` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `contract` SET `starts_on` = date(`starts_on` + (case when `starts_on` >= unixepoch(date(strftime('%Y', `starts_on`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `starts_on` < unixepoch(date(strftime('%Y', `starts_on`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `starts_on` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `contract` SET `ends_on` = date(`ends_on` + (case when `ends_on` >= unixepoch(date(strftime('%Y', `ends_on`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `ends_on` < unixepoch(date(strftime('%Y', `ends_on`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `ends_on` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `invoice` SET `issued_on` = date(`issued_on` + (case when `issued_on` >= unixepoch(date(strftime('%Y', `issued_on`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `issued_on` < unixepoch(date(strftime('%Y', `issued_on`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `issued_on` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `invoice` SET `due_on` = date(`due_on` + (case when `due_on` >= unixepoch(date(strftime('%Y', `due_on`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `due_on` < unixepoch(date(strftime('%Y', `due_on`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `due_on` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `invoice` SET `paid_on` = date(`paid_on` + (case when `paid_on` >= unixepoch(date(strftime('%Y', `paid_on`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `paid_on` < unixepoch(date(strftime('%Y', `paid_on`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `paid_on` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `invoicing_settings` SET `bill_from` = date(`bill_from` + (case when `bill_from` >= unixepoch(date(strftime('%Y', `bill_from`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `bill_from` < unixepoch(date(strftime('%Y', `bill_from`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `bill_from` NOT LIKE '%-%';--> statement-breakpoint
UPDATE `maintenance_plan` SET `next_due_on` = date(`next_due_on` + (case when `next_due_on` >= unixepoch(date(strftime('%Y', `next_due_on`, 'unixepoch') || '-03-25', 'weekday 0') || ' 01:00') and `next_due_on` < unixepoch(date(strftime('%Y', `next_due_on`, 'unixepoch') || '-10-25', 'weekday 0') || ' 01:00') then 7200 else 3600 end), 'unixepoch') WHERE `next_due_on` NOT LIKE '%-%';
