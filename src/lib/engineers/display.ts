import CogIcon from "@lucide/svelte/icons/cog";
import CpuIcon from "@lucide/svelte/icons/cpu";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import { labelOptions, withLabels } from "#lib/i18n/labels.ts";
import { type EngineerSpecialty, engineerSpecialties } from "#lib/models.ts";
import { m } from "#lib/paraglide/messages.js";

interface Display {
	icon: Component;
}

const specialtyDetails: Record<EngineerSpecialty, Display> = {
	electrical: { icon: ZapIcon },
	mechanical: { icon: CogIcon },
	hvac: { icon: FanIcon },
	plumbing: { icon: DropletsIcon },
	controls: { icon: CpuIcon },
};

/** Each specialty's translated `label` and icon. */
export const specialties = withLabels("engineerSpecialty", specialtyDetails);

/** Options for the specialty filter and select, in the order of `engineerSpecialties`. */
export const specialtyOptions = labelOptions(
	"engineerSpecialty",
	engineerSpecialties,
	specialtyDetails,
);

/** The usual regions engineers work in, as stored. Regions are text, so others may exist. */
export const engineerRegions = ["North", "East", "South", "West", "Central"] as const;

const regionLabels: Record<(typeof engineerRegions)[number], () => string> = {
	North: m.engineers_region_north,
	East: m.engineers_region_east,
	South: m.engineers_region_south,
	West: m.engineers_region_west,
	Central: m.engineers_region_central,
};

/** A region's name in the current language, e.g. `North` → `Noord`; any other region as stored. */
export const regionLabel = (region: string) =>
	Object.hasOwn(regionLabels, region)
		? regionLabels[region as keyof typeof regionLabels]()
		: region;

/** Options for the region filter and select: the usual regions, then `others` (e.g. in use). */
export const regionOptions = (others: Iterable<string> = []) =>
	[...new Set([...engineerRegions, ...others])].map((value) => ({
		value,
		label: regionLabel(value),
	}));
