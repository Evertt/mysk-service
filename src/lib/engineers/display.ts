import CogIcon from "@lucide/svelte/icons/cog";
import CpuIcon from "@lucide/svelte/icons/cpu";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import { labelOptions, withLabels } from "#lib/i18n/index.ts";
import { type EngineerSpecialty, engineerSpecialties } from "#lib/models.ts";

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

/**
 * The engineers with those of the `fitting` specialties first, in that order, then the others; in
 * the order given otherwise. E.g. an order's: the specialties that service its units' categories,
 * first unit first (a category with none adds `null`, which fits no one).
 */
export function fittingFirst<T extends { specialty: EngineerSpecialty }>(
	engineers: readonly T[],
	fitting: readonly (EngineerSpecialty | null)[],
): T[] {
	const rank = (specialty: EngineerSpecialty) => {
		const index = fitting.indexOf(specialty);
		return index === -1 ? fitting.length : index;
	};
	return engineers.toSorted((a, b) => rank(a.specialty) - rank(b.specialty));
}

/** An engineer's first name: all of them a customer sees (`Jan de Vries` → `Jan`). */
export const firstName = (name: string) => name.split(" ")[0];
