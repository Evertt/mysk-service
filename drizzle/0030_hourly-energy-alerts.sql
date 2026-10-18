-- A zone's consumption alerts were once per hour (`zone:<id>:<yyyy-mm-dd>T<hh>`, a new one each
-- hour of a day over its kWh), and are once per day now (`zone:<id>:<yyyy-mm-dd>`; `zoneDayAlertKey`
-- in src/modules/energy/model.ts). Of each day's open ones, the latest (the day's kWh so far, the
-- most) goes on as the day's alert, unless the day has one already; the others are done. Then the
-- hourly ones left give their key up, which is a power alert's of that hour.
UPDATE `energy_alert` SET `key` = substr(`key`, 1, length(`key`) - 3)
WHERE `id` IN (
	SELECT `id` FROM (
		SELECT `id`, row_number() OVER (
			PARTITION BY `organization_id`, substr(`key`, 1, length(`key`) - 3)
			ORDER BY `at` DESC, `id` DESC
		) AS `latest`
		FROM `energy_alert`
		WHERE `metric` = 'energy' AND `status` = 'open'
			AND `key` GLOB 'zone:*:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]'
	) WHERE `latest` = 1
)
AND NOT EXISTS (
	SELECT 1 FROM `energy_alert` AS `day`
	WHERE `day`.`organization_id` = `energy_alert`.`organization_id`
		AND `day`.`key` = substr(`energy_alert`.`key`, 1, length(`energy_alert`.`key`) - 3)
);
--> statement-breakpoint
UPDATE `energy_alert` SET `status` = 'done', `done_at` = unixepoch()
WHERE `metric` = 'energy' AND `status` = 'open'
	AND `key` GLOB 'zone:*:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]';
--> statement-breakpoint
UPDATE `energy_alert` SET `key` = `key` || ':energy'
WHERE `metric` = 'energy'
	AND `key` GLOB 'zone:*:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]';
