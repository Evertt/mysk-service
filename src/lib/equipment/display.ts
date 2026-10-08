import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import FlameIcon from "@lucide/svelte/icons/flame";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";
import { nextDay } from "#lib/dates.ts";
import { labelOptions, withLabels } from "#lib/i18n/labels.ts";
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

const statusDetails: Record<EquipmentStatus, { variant: BadgeVariant }> = {
	operational: { variant: "secondary" },
	needs_service: { variant: "outline" },
	out_of_service: { variant: "destructive" },
	decommissioned: { variant: "ghost" },
};

/** Each status's translated `label` and badge variant. */
export const statuses = withLabels("equipmentStatus", statusDetails);

/** Whether the unit's warranty still covers work done at `at` (now by default); its last day counts. */
export const isUnderWarranty = (warrantyUntil: Date, at: Date = new Date()) =>
	at < nextDay(warrantyUntil);
