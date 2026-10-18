-- A dock's last event to the millisecond (was whole seconds), so an event older than it
-- within the same second is stale.
UPDATE `dock_state` SET `last_event_at` = `last_event_at` * 1000 WHERE `last_event_at` IS NOT NULL;
