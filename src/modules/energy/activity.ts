/** How the activity log reads for the energy module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import { formatNumber } from "#lib/i18n/index.ts";

/** What's done with an alert besides its creation (by the ingest, as the system), as sentences. */
export const energyActions = {
	alert_ordered: m.energy_activity_action_ordered,
	alert_resolved: m.energy_activity_action_resolved,
} satisfies Record<string, Sentence>;

/** A setting that's on or off. */
const onOff = (value: unknown) => (value ? m.energy_on() : m.energy_off());

/** A number of kW or kWh. */
const amount = (value: unknown) => formatNumber(Number(value));

const sitePage = (id: string) =>
	resolve("/(app)/(modules)/energy/[site]", { site: String(Number(id)) });

export const energySubjects: Record<string, SubjectType> = {
	/** An energy site, the parent of its alerts and thresholds: their entries are on its page. */
	energy_site: { noun: m.energy_activity_subject_site, href: ({ id }) => sitePage(id) },
	/** An alert, by what it's about (a zone's or a door's code); its parent is its site. */
	energy_alert: { noun: m.energy_activity_subject_alert },
	/** A zone's thresholds, by the zone's code; its parent is its site. */
	energy_threshold: {
		noun: m.energy_activity_subject_threshold,
		fields: {
			enabled: { label: m.energy_threshold_enabled, format: onOff },
			maxKw: { label: m.energy_threshold_max_kw, format: amount },
			maxKwh: { label: m.energy_threshold_max_kwh, format: amount },
		},
	},
};
