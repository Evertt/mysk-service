import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import FlameIcon from "@lucide/svelte/icons/flame";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import { humanize } from "#lib/format.js";
import { type EquipmentCategory, equipmentCategories, equipmentStatuses } from "#lib/models.js";

export const categories: Record<EquipmentCategory, { label: string; icon: Component }> = {
	generator: { label: "Generator", icon: ZapIcon },
	chiller: { label: "Chiller", icon: SnowflakeIcon },
	boiler: { label: "Boiler", icon: FlameIcon },
	compressor: { label: "Compressor", icon: GaugeIcon },
	pump: { label: "Pump", icon: DropletsIcon },
	elevator: { label: "Elevator", icon: ArrowUpDownIcon },
	air_handler: { label: "Air handler", icon: FanIcon },
};

/** Options for the faceted filters, in the order of the enums. */
export const categoryOptions = equipmentCategories.map((value) => ({
	value,
	...categories[value],
}));
export const statusOptions = equipmentStatuses.map((value) => ({ value, label: humanize(value) }));

/** Whether the unit's warranty still covers work done at `at` (now by default). */
export const isUnderWarranty = (warrantyUntil: Date, at: Date = new Date()) => at < warrantyUntil;
