ALTER TABLE `checklist_result` ADD `template_item_id` integer;--> statement-breakpoint
-- The points copied before: the template point of their checklist's template with their group and
-- text (the first, should two have them), as the parts shop matched them until now.
UPDATE `checklist_result` SET `template_item_id` = (
	SELECT i.`id` FROM `checklist_template_item` i
	JOIN `checklist` c ON c.`id` = `checklist_result`.`checklist_id`
		AND c.`organization_id` = `checklist_result`.`organization_id`
	WHERE i.`organization_id` = c.`organization_id` AND i.`template_id` = c.`template_id`
		AND i.`group_name` = `checklist_result`.`group_name` AND i.`text` = `checklist_result`.`text`
	ORDER BY i.`position`, i.`id` LIMIT 1
);
