-- The invoicing module is now `invoices`, like its folder and its URL (src/modules/invoices). The
-- organizations that have it keep it, and the activity log's entries of switching it on or off
-- (subject type `module`, by the module's id) stay the module's.
UPDATE `organization_module` SET `module_id` = 'invoices' WHERE `module_id` = 'invoicing';
--> statement-breakpoint
UPDATE `activity` SET `subject_id` = 'invoices' WHERE `subject_type` = 'module' AND `subject_id` = 'invoicing';
--> statement-breakpoint
UPDATE `activity` SET `parent_id` = 'invoices' WHERE `parent_type` = 'module' AND `parent_id` = 'invoicing';
