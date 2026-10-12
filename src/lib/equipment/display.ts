import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import FlameIcon from "@lucide/svelte/icons/flame";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import { getTimeZone } from "#lib/dates.ts";
import { labelOptions, withLabels } from "#lib/i18n/index.ts";
import {
	type EquipmentCategory,
	equipmentCategories,
	type EquipmentStatus,
	equipmentStatuses,
} from "#lib/models.ts";

const categoryDetails: Record<EquipmentCategory, { icon: Component }> = {
	generator: { icon: ZapIcon },
	chiller: { icon: SnowflakeIcon },
	boiler: { icon: FlameIcon },
	compressor: { icon: GaugeIcon },
	pump: { icon: DropletsIcon },
	elevator: { icon: ArrowUpDownIcon },
	air_handler: { icon: FanIcon },
};

/** Each category's translated `label` and icon. */
export const categories = withLabels("equipmentCategory", categoryDetails);

/** Options for the faceted filters, in the order of the enums. */
export const categoryOptions = labelOptions(
	"equipmentCategory",
	equipmentCategories,
	categoryDetails,
);
export const statusOptions = labelOptions("equipmentStatus", equipmentStatuses);

/**
 * A status's badge variant and, for the charts, its colour: a CSS variable of the theme. The
 * primary colour for units in service, destructive for those out of it (like its badge), and the
 * muted one for decommissioned units, which are out of the picture.
 */
const statusDetails: Record<EquipmentStatus, { variant: BadgeVariant; color: string }> = {
	operational: { variant: "secondary", color: "var(--primary)" },
	needs_service: { variant: "outline", color: "var(--chart-3)" },
	out_of_service: { variant: "destructive", color: "var(--destructive)" },
	decommissioned: { variant: "ghost", color: "var(--muted-foreground)" },
};

/** Each status's translated `label`, badge variant and chart colour. */
export const statuses = withLabels("equipmentStatus", statusDetails);

/**
 * Whether the unit's warranty still covers work done on `at` (a day, or the day of a moment in
 * the user's time zone; today by default); its last day counts.
 */
export function isUnderWarranty(
	warrantyUntil: Temporal.PlainDate,
	at: Temporal.PlainDate | Temporal.Instant = Temporal.Now.instant(),
) {
	const day =
		at instanceof Temporal.Instant ? at.toZonedDateTimeISO(getTimeZone()).toPlainDate() : at;
	return Temporal.PlainDate.compare(day, warrantyUntil) <= 0;
}
