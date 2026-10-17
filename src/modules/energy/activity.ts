/** How the activity log reads for the energy module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import { formatNumber } from "#lib/i18n/index.ts";

import { energyLabels } from "./labels.ts";

/** What's done with an alert besides its creation (by the ingest, as the system), as sentences. */
export const energyActions = {
	alert_ordered: m.energy_activity_action_ordered,
	alert_resolved: m.energy_activity_action_resolved,
} satisfies Record<string, Sentence>;

/** A setting that's on or off. */
const onOff = (value: unknown) => (value ? m.energy_on() : m.energy_off());

/** A number: kW, kWh, €/kWh, minutes. */
const amount = (value: unknown) => formatNumber(Number(value));

const sitePage = (id: string) =>
	resolve("/(app)/(modules)/energy/[site]", { site: String(Number(id)) });

/** A door's kind, e.g. "Sectional door". */
const doorKind = (value: unknown) => energyLabels.labelOrValue("doorKind", String(value));

export const energySubjects: Record<string, SubjectType> = {
	/**
	 * An energy site, by its name: the parent of its zones, consumers, doors, alerts and
	 * thresholds, whose entries are on its page.
	 */
	energy_site: {
		noun: m.energy_activity_subject_site,
		href: ({ id }) => sitePage(id),
		fields: {
			meterName: { label: m.energy_setup_meter },
			contractedPeakKw: { label: m.energy_setup_peak, format: amount },
			contractedKwhPerYear: { label: m.energy_setup_kwh_year, format: amount },
			pvCapacityKw: { label: m.energy_setup_pv, format: amount },
			tariff: { label: m.energy_setup_tariff, format: amount },
			co2Factor: { label: m.energy_setup_co2, format: amount },
			timeZone: { label: m.energy_setup_time_zone },
		},
	},
	/** A zone, by its code; its parent is its site. */
	energy_zone: {
		noun: m.energy_activity_subject_zone,
		fields: {
			floor: { label: m.energy_setup_floor },
			areaM2: { label: m.energy_setup_area, format: amount },
		},
	},
	/** A consumer, by its name; its parent is its site. */
	energy_consumer: {
		noun: m.energy_activity_subject_consumer,
		fields: {
			zone: { label: m.energy_setup_zone },
			ratedKw: { label: m.energy_setup_rated, format: amount },
			equipmentId: { label: m.energy_setup_unit, ref: "unit" },
		},
	},
	/** A monitored door, by its code; its parent is its site. */
	energy_door: {
		noun: m.energy_activity_subject_door,
		fields: {
			zone: { label: m.energy_setup_zone },
			kind: { label: m.energy_setup_kind, format: doorKind },
			lossKw: { label: m.energy_setup_loss, format: amount },
			thresholdMinutes: { label: m.energy_setup_minutes, format: amount },
			insideC: { label: m.energy_setup_inside, format: amount },
			outsideC: { label: m.energy_setup_outside, format: amount },
			equipmentId: { label: m.energy_setup_unit, ref: "unit" },
		},
	},
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
