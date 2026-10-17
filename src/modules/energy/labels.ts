/** The translated names of the energy module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type {
	AlertMetric,
	AlertSeverity,
	AlertStatus,
	DoorKind,
	Period,
	ThresholdState,
	ZoneTone,
} from "./model.ts";

export const energyLabels = defineLabels({
	zoneTone: {
		nominal: m.energy_tone_nominal,
		elevated: m.energy_tone_elevated,
		peak: m.energy_tone_peak,
		offline: m.energy_tone_offline,
	} satisfies Labels<ZoneTone>,
	thresholdState: {
		active: m.energy_state_active,
		near: m.energy_state_near,
		normal: m.energy_state_normal,
		off: m.energy_state_off,
	} satisfies Labels<ThresholdState>,
	alertMetric: {
		power: m.energy_metric_power,
		energy: m.energy_metric_energy,
		door: m.energy_metric_door,
	} satisfies Labels<AlertMetric>,
	alertSeverity: {
		active: m.energy_severity_active,
		near: m.energy_severity_near,
	} satisfies Labels<AlertSeverity>,
	alertStatus: {
		open: m.energy_alert_status_open,
		order: m.energy_alert_status_order,
		done: m.energy_alert_status_done,
	} satisfies Labels<AlertStatus>,
	doorKind: {
		sectional: m.energy_door_kind_sectional,
		freezer: m.energy_door_kind_freezer,
		cold: m.energy_door_kind_cold,
	} satisfies Labels<DoorKind>,
	period: {
		day: m.energy_period_day,
		month: m.energy_period_month,
	} satisfies Labels<Period>,
});
