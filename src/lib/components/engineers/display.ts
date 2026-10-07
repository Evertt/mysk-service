import CogIcon from "@lucide/svelte/icons/cog";
import CpuIcon from "@lucide/svelte/icons/cpu";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import { labelOptions, withLabels } from "#lib/i18n/labels.js";
import { type EngineerSpecialty, engineerSpecialties } from "#lib/models.js";

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
