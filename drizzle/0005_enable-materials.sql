-- Materials became an optional module (src/modules/materials): every organization that had them
-- as part of the core keeps them, switched on since the organization was made (its `created_at`
-- is in milliseconds, a module row's in seconds).
INSERT OR IGNORE INTO `organization_module` (`organization_id`, `module_id`, `created_at`)
SELECT `id`, 'materials', `created_at` / 1000 FROM `organization`;
