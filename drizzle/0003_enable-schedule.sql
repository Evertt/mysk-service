-- The schedule became an optional module (src/modules/schedule): every organization that had it
-- as part of the core keeps it.
INSERT OR IGNORE INTO `organization_module` (`organization_id`, `module_id`)
SELECT `id`, 'schedule' FROM `organization`;
