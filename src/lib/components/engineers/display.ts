import CogIcon from "@lucide/svelte/icons/cog";
import CpuIcon from "@lucide/svelte/icons/cpu";
import DropletsIcon from "@lucide/svelte/icons/droplets";
import FanIcon from "@lucide/svelte/icons/fan";
import ZapIcon from "@lucide/svelte/icons/zap";
import type { Component } from "svelte";

import { type EngineerSpecialty, engineerSpecialties } from "#lib/models.js";

interface Display {
	label: string;
	icon: Component;
}

export const specialties: Record<EngineerSpecialty, Display> = {
	electrical: { label: "Electrical", icon: ZapIcon },
	mechanical: { label: "Mechanical", icon: CogIcon },
	hvac: { label: "HVAC", icon: FanIcon },
	plumbing: { label: "Plumbing", icon: DropletsIcon },
	controls: { label: "Controls", icon: CpuIcon },
};

/** Options for the specialty filter and select, in the order of `engineerSpecialties`. */
export const specialtyOptions = engineerSpecialties.map((value) => ({
	value,
	...specialties[value],
}));
