-- The schedule became an optional module (src/modules/schedule): every organization that had it
-- as part of the core keeps it, switched on since the organization was made (its `created_at` is
-- in milliseconds, a module row's in seconds).
INSERT OR IGNORE INTO `organization_module` (`organization_id`, `module_id`, `created_at`)
SELECT `id`, 'schedule', `created_at` / 1000 FROM `organization`;
