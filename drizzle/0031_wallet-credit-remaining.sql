ALTER TABLE `partner_wallet_entry` ADD `remaining` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- What's left of each credit, by replaying every wallet's ledger in the order it was made, by the
-- rules of `replayWallet()` (src/modules/partner-programme/model.ts): what goes out takes from the
-- credit that expires first (of the credit still valid on the day it was made, read in the
-- database's local time zone); an expiry takes from the credit past its date; a reversal gives back
-- to the credit it names (its date and year) what was taken of it, and brings in the rest as credit
-- of its own. Each step holds the wallet's credit so far as a JSON array of
-- {id, amount, remaining, valid_until, bonus_year_id}.
CREATE TABLE `__wallet_credit_left` AS
WITH RECURSIVE
	`entry` AS (
		SELECT `organization_id`, `customer_id`, `id`, `kind`, `amount`, `valid_until`, `bonus_year_id`,
			date(`created_at`, 'unixepoch', 'localtime') AS `made_on`,
			row_number() OVER (PARTITION BY `organization_id`, `customer_id` ORDER BY `id`) AS `n`
		FROM `partner_wallet_entry`
	),
	`replay` (`organization_id`, `customer_id`, `n`, `lots`) AS (
		SELECT DISTINCT `organization_id`, `customer_id`, 0, '[]' FROM `entry`
		UNION ALL
		SELECT `r`.`organization_id`, `r`.`customer_id`, `r`.`n` + 1, (
			SELECT json_group_array(json_object(
				'id', `id`, 'amount', `amount`, 'remaining', `remaining`,
				'valid_until', `valid_until`, 'bonus_year_id', `bonus_year_id`
			))
			FROM (
				-- The credit there was, less what this entry takes of it, plus what it gives back.
				SELECT `id`, `amount`, `valid_until`, `bonus_year_id`,
					`remaining`
					- CASE WHEN `e`.`amount` < 0 AND `takes` THEN max(0, min(`remaining`, -`e`.`amount` - coalesce(sum(CASE WHEN `takes` THEN `remaining` END) OVER (ORDER BY `valid_until` IS NULL, `valid_until`, `id` ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))) ELSE 0 END
					+ CASE WHEN `e`.`kind` = 'reversal' AND `e`.`amount` > 0 AND `named` THEN max(0, min(`amount` - `remaining`, `e`.`amount` - coalesce(sum(CASE WHEN `named` THEN `amount` - `remaining` END) OVER (ORDER BY `id` ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))) ELSE 0 END
					AS `remaining`
				FROM (
					SELECT `id`, `amount`, `remaining`, `valid_until`, `bonus_year_id`,
						`remaining` > 0 AND CASE WHEN `e`.`kind` = 'expiry'
							THEN `e`.`valid_until` IS NULL OR `valid_until` IS NULL OR `valid_until` <= `e`.`valid_until`
							ELSE `valid_until` IS NULL OR `valid_until` >= `e`.`made_on` END AS `takes`,
						`bonus_year_id` IS `e`.`bonus_year_id` AND `valid_until` IS `e`.`valid_until` AS `named`
					FROM (
						SELECT json_extract(`value`, '$.id') AS `id`, json_extract(`value`, '$.amount') AS `amount`,
							json_extract(`value`, '$.remaining') AS `remaining`,
							json_extract(`value`, '$.valid_until') AS `valid_until`,
							json_extract(`value`, '$.bonus_year_id') AS `bonus_year_id`
						FROM json_each(`r`.`lots`)
					)
				)
				UNION ALL
				-- The credit this entry brings in of its own: an award's, an adjustment up's, and what
				-- a reversal gives beyond what was taken of the credit it names.
				SELECT `e`.`id`, `own`, `e`.`valid_until`, `e`.`bonus_year_id`, `own`
				FROM (
					SELECT CASE WHEN `e`.`kind` = 'reversal'
						THEN `e`.`amount` - coalesce((
							SELECT sum(json_extract(`value`, '$.amount') - json_extract(`value`, '$.remaining'))
							FROM json_each(`r`.`lots`)
							WHERE json_extract(`value`, '$.bonus_year_id') IS `e`.`bonus_year_id`
								AND json_extract(`value`, '$.valid_until') IS `e`.`valid_until`
						), 0)
						ELSE `e`.`amount` END AS `own`
				)
				WHERE `e`.`amount` > 0 AND `own` > 0
			)
		)
		FROM `replay` AS `r`
		JOIN `entry` AS `e` ON `e`.`organization_id` = `r`.`organization_id`
			AND `e`.`customer_id` = `r`.`customer_id` AND `e`.`n` = `r`.`n` + 1
	)
SELECT json_extract(`lot`.`value`, '$.id') AS `id`, json_extract(`lot`.`value`, '$.remaining') AS `remaining`
FROM `replay` AS `r`, json_each(`r`.`lots`) AS `lot`
WHERE `r`.`n` = (
	SELECT max(`n`) FROM `entry` WHERE `organization_id` = `r`.`organization_id` AND `customer_id` = `r`.`customer_id`
);--> statement-breakpoint
UPDATE `partner_wallet_entry` SET `remaining` = `left`.`remaining`
FROM `__wallet_credit_left` AS `left` WHERE `left`.`id` = `partner_wallet_entry`.`id`;--> statement-breakpoint
DROP TABLE `__wallet_credit_left`;
