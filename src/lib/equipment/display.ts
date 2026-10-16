import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import { getTimeZone } from "#lib/dates.ts";
import { labelOptions, withLabels } from "#lib/i18n/index.ts";
import { type EquipmentStatus, equipmentStatuses } from "#lib/models.ts";

/** Options for the status filter, in the order of the enum. */
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
