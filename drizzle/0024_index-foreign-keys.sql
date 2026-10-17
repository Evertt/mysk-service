DROP INDEX `engineer_organization_user`;--> statement-breakpoint
CREATE UNIQUE INDEX `engineer_user_organization` ON `engineer` (`user_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `portal_contact_organization_user`;--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contact_user_organization` ON `portal_contact` (`user_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `equipment_site`;--> statement-breakpoint
DROP INDEX `equipment_by_location`;--> statement-breakpoint
CREATE INDEX `equipment_site` ON `equipment` (`site_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `equipment_by_location` ON `equipment` (`location_id`,`site_id`);--> statement-breakpoint
DROP INDEX `order_note_order`;--> statement-breakpoint
CREATE INDEX `order_note_user` ON `order_note` (`user_id`);--> statement-breakpoint
CREATE INDEX `order_note_order` ON `order_note` (`organization_id`,`order_id`,`created_at`);--> statement-breakpoint
DROP INDEX `order_unit_equipment`;--> statement-breakpoint
CREATE INDEX `order_unit_customer_order` ON `order_unit` (`customer_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_unit_equipment` ON `order_unit` (`equipment_id`,`customer_id`,`order_id`);--> statement-breakpoint
DROP INDEX `portal_contact_site_site`;--> statement-breakpoint
CREATE INDEX `portal_contact_site_organization_contact` ON `portal_contact_site` (`organization_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `portal_contact_site_customer_contact` ON `portal_contact_site` (`customer_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `portal_contact_site_site` ON `portal_contact_site` (`site_id`,`customer_id`);--> statement-breakpoint
DROP INDEX `saved_view_user_table_name`;--> statement-breakpoint
CREATE UNIQUE INDEX `saved_view_user_table_name` ON `saved_view` (`user_id`,`organization_id`,`table_key`,`name`);--> statement-breakpoint
DROP INDEX `checklist_template_category_template`;--> statement-breakpoint
CREATE INDEX `checklist_template_category_template` ON `checklist_template_category` (`template_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `checklist_template_item_template`;--> statement-breakpoint
CREATE INDEX `checklist_template_item_template` ON `checklist_template_item` (`organization_id`,`template_id`,`position`);--> statement-breakpoint
DROP INDEX `unit_condition_equipment`;--> statement-breakpoint
CREATE INDEX `unit_condition_order` ON `unit_condition` (`order_organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `unit_condition_engineer` ON `unit_condition` (`organization_id`,`engineer_id`);--> statement-breakpoint
CREATE INDEX `unit_condition_user` ON `unit_condition` (`user_id`);--> statement-breakpoint
CREATE INDEX `unit_condition_equipment` ON `unit_condition` (`organization_id`,`equipment_id`,`recorded_at`);--> statement-breakpoint
DROP INDEX `dock_position_door`;--> statement-breakpoint
DROP INDEX `dock_position_leveller`;--> statement-breakpoint
CREATE INDEX `dock_position_location` ON `dock_position` (`location_organization_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `dock_position_door` ON `dock_position` (`door_id`,`door_organization_id`);--> statement-breakpoint
CREATE INDEX `dock_position_leveller` ON `dock_position` (`leveller_id`,`leveller_organization_id`);--> statement-breakpoint
DROP INDEX `energy_alert_site`;--> statement-breakpoint
CREATE INDEX `energy_alert_zone` ON `energy_alert` (`organization_id`,`zone_id`);--> statement-breakpoint
CREATE INDEX `energy_alert_door` ON `energy_alert` (`organization_id`,`door_id`);--> statement-breakpoint
CREATE INDEX `energy_alert_order` ON `energy_alert` (`order_organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `energy_alert_site` ON `energy_alert` (`organization_id`,`energy_site_id`,`status`,`at`);--> statement-breakpoint
DROP INDEX `energy_consumer_zone`;--> statement-breakpoint
CREATE INDEX `energy_consumer_equipment` ON `energy_consumer` (`equipment_organization_id`,`equipment_id`);--> statement-breakpoint
CREATE INDEX `energy_consumer_zone` ON `energy_consumer` (`organization_id`,`zone_id`);--> statement-breakpoint
DROP INDEX `credit_note_customer`;--> statement-breakpoint
CREATE INDEX `credit_note_customer` ON `credit_note` (`customer_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `credit_note_line_credit_note`;--> statement-breakpoint
CREATE INDEX `credit_note_line_order` ON `credit_note_line` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `credit_note_line_credit_note` ON `credit_note_line` (`credit_note_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `invoice_customer`;--> statement-breakpoint
CREATE INDEX `invoice_customer` ON `invoice` (`customer_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `invoice_line_invoice`;--> statement-breakpoint
DROP INDEX `invoice_line_order`;--> statement-breakpoint
CREATE INDEX `invoice_line_invoice` ON `invoice_line` (`invoice_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `invoice_line_order` ON `invoice_line` (`order_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `maintenance_plan_equipment`;--> statement-breakpoint
CREATE INDEX `maintenance_plan_last_order` ON `maintenance_plan` (`last_order_organization_id`,`last_order_id`);--> statement-breakpoint
CREATE INDEX `maintenance_plan_equipment` ON `maintenance_plan` (`equipment_id`,`organization_id`);--> statement-breakpoint
DROP INDEX `stock_movement_material`;--> statement-breakpoint
CREATE INDEX `stock_movement_order` ON `stock_movement` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `stock_movement_user` ON `stock_movement` (`user_id`);--> statement-breakpoint
CREATE INDEX `stock_movement_material` ON `stock_movement` (`organization_id`,`material_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_user` ON `activity` (`user_id`);--> statement-breakpoint
CREATE INDEX `integration_token_created_by` ON `integration_token` (`created_by`);--> statement-breakpoint
CREATE INDEX `order_request_organization_order` ON `order_request` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_request_user` ON `order_request` (`user_id`);--> statement-breakpoint
CREATE INDEX `order_request_decided_by` ON `order_request` (`decided_by`);--> statement-breakpoint
CREATE INDEX `order_signoff_organization_order` ON `order_signoff` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_signoff_user` ON `order_signoff` (`user_id`);--> statement-breakpoint
CREATE INDEX `table_memory_user` ON `table_memory` (`user_id`);--> statement-breakpoint
CREATE INDEX `invitation_inviterId_idx` ON `invitation` (`inviter_id`);--> statement-breakpoint
CREATE INDEX `checklist_order_unit` ON `checklist` (`organization_id`,`order_id`,`equipment_id`);--> statement-breakpoint
CREATE INDEX `checklist_by_template` ON `checklist` (`organization_id`,`template_id`);--> statement-breakpoint
CREATE INDEX `checklist_completed_by` ON `checklist` (`organization_id`,`completed_by`);--> statement-breakpoint
CREATE INDEX `checklist_result_checklist` ON `checklist_result` (`organization_id`,`checklist_id`);--> statement-breakpoint
CREATE INDEX `contract_customer` ON `contract` (`organization_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `contract_equipment_contract` ON `contract_equipment` (`customer_id`,`contract_id`);--> statement-breakpoint
CREATE INDEX `contract_equipment_equipment` ON `contract_equipment` (`customer_id`,`equipment_id`);--> statement-breakpoint
CREATE INDEX `dock_escalation_dock` ON `dock_escalation` (`organization_id`,`dock_id`);--> statement-breakpoint
CREATE INDEX `dock_escalation_order` ON `dock_escalation` (`organization_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `dock_event_dock` ON `dock_event` (`organization_id`,`dock_id`);--> statement-breakpoint
CREATE INDEX `energy_door_site` ON `energy_door` (`organization_id`,`energy_site_id`);--> statement-breakpoint
CREATE INDEX `energy_door_zone` ON `energy_door` (`energy_site_id`,`zone_id`);--> statement-breakpoint
CREATE INDEX `energy_door_equipment` ON `energy_door` (`equipment_organization_id`,`equipment_id`);--> statement-breakpoint
CREATE INDEX `energy_door_event_door` ON `energy_door_event` (`organization_id`,`door_id`);--> statement-breakpoint
CREATE INDEX `energy_reading_zone` ON `energy_reading` (`organization_id`,`zone_id`);--> statement-breakpoint
CREATE INDEX `energy_threshold_zone` ON `energy_threshold` (`organization_id`,`zone_id`);--> statement-breakpoint
CREATE INDEX `energy_zone_site` ON `energy_zone` (`organization_id`,`energy_site_id`);--> statement-breakpoint
CREATE INDEX `partner_account_accepted_by` ON `partner_account` (`accepted_by`);--> statement-breakpoint
CREATE INDEX `partner_wallet_entry_bonus_year` ON `partner_wallet_entry` (`organization_id`,`bonus_year_id`);--> statement-breakpoint
CREATE INDEX `shop_order_wallet_entry` ON `shop_order` (`organization_id`,`wallet_entry_id`);--> statement-breakpoint
CREATE INDEX `shop_order_placed_by` ON `shop_order` (`placed_by`);--> statement-breakpoint
CREATE INDEX `shop_order_line_material` ON `shop_order_line` (`organization_id`,`material_id`);