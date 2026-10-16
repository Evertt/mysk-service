import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import FlameIcon from "@lucide/svelte/icons/flame";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
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
 * A status's badge tone and, for the charts, its colour: a CSS variable of the theme. The
 * primary colour for units in service, destructive for those out of it (like its badge), and the
 * muted one for decommissioned units, which are out of the picture.
 */
const statusDetails: Record<EquipmentStatus, { tone: BadgeTone; color: string }> = {
	operational: { tone: "success", color: "var(--primary)" },
	needs_service: { tone: "warning", color: "var(--chart-3)" },
	out_of_service: { tone: "danger", color: "var(--destructive)" },
	decommissioned: { tone: "neutral", color: "var(--muted-foreground)" },
};

/** Each status's translated `label`, badge tone and chart colour. */
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

/** What a unit is, by make: its manufacturer and model, e.g. `Daikin EWAD-410`. */
export const unitModel = (unit: { manufacturer: string; model: string }) =>
	`${unit.manufacturer} ${unit.model}`;

/**
 * What a unit is called: the customer's own name for it if it has one (`Automatische deur kantine
 * BES-3`), else its manufacturer and model.
 */
export const unitTitle = (unit: { name: string | null; manufacturer: string; model: string }) =>
	unit.name ?? unitModel(unit);

/**
 * A unit on one line, e.g. in a select: its name first if it has one, then its manufacturer and
 * model and its serial number, `Deur kantine BES-3 · Hörmann ST 50 · H1234567`.
 */
export const unitLine = (unit: {
	name: string | null;
	manufacturer: string;
	model: string;
	serialNumber: string;
}) => [unit.name, unitModel(unit), unit.serialNumber].filter(Boolean).join(" · ");
