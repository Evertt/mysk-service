/**
 * The setup forms' fields (`/energy/<site>/setup`, and the dialog that adds a site): an energy site
 * for one of a customer's sites, and its zones, consumers and monitored doors. Number inputs arrive
 * as numbers (an empty one as nothing); selects and hidden ids as strings.
 */
import * as v from "valibot";

import { isTimeZone } from "#lib/dates.ts";
import {
	type Bounds,
	id,
	type Message,
	numberIn,
	omittableText,
	optionalId,
	text,
	textMax,
	wholeIn,
} from "#lib/schema.ts";

import { doorKinds } from "../model.ts";

/** A number from a number input, up to 100,000 unless `max` says otherwise. */
const amount = (message: Message, bounds: Bounds = {}) =>
	numberIn({ max: 100_000, ...bounds, message });

/** A required, trimmed text up to `max`. */
const requiredText = (message: Message, max: number) => v.pipe(text(message), textMax(max));

/**
 * A zone's or door's code: what the gateway names it by (`../ingest/format.ts` takes 1 to 40
 * characters), unique in its site.
 */
const code = () => requiredText(m.energy_setup_code_required, 40);

/** An energy site's contract, panels, tariff, CO₂ factor and time zone. */
const siteFields = {
	contractedPeakKw: amount(m.energy_setup_peak_invalid, { above: true }),
	contractedKwhPerYear: wholeIn({ max: 1_000_000_000, message: m.energy_setup_kwh_year_invalid }),
	// An empty number input is no field at all: the default.
	pvCapacityKw: v.optional(amount(m.energy_setup_pv_invalid), 0),
	tariff: amount(m.energy_setup_tariff_invalid, { above: true, max: 10 }),
	co2Factor: amount(m.energy_setup_co2_invalid, { max: 10 }),
	timeZone: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(m.energy_setup_time_zone_invalid),
		v.check((zone: string) => isTimeZone(zone), m.energy_setup_time_zone_invalid),
	),
};

/**
 * A new energy site for the customer site `siteId`. Its name and its main connection's name may be
 * left out: they're made from the customer's and the site's names, and "Main connection".
 */
export const newEnergySiteSchema = v.object({
	siteId: id(m.energy_setup_site_required),
	name: omittableText(120),
	meterName: omittableText(80),
	...siteFields,
});

/** An energy site's own settings, edited on its setup page. */
export const energySiteSchema = v.object({
	energySiteId: id(),
	name: requiredText(m.energy_setup_name_required, 120),
	meterName: requiredText(m.energy_setup_meter_required, 80),
	...siteFields,
});

export type EnergySiteInput = Omit<v.InferOutput<typeof energySiteSchema>, "energySiteId">;
export type NewEnergySiteInput = v.InferOutput<typeof newEnergySiteSchema>;

/** A zone of the site; with `zoneId` when it's edited. */
export const zoneSchema = v.object({
	energySiteId: id(),
	zoneId: v.optional(optionalId(), ""),
	code: code(),
	name: requiredText(m.energy_setup_name_required, 80),
	floor: omittableText(40),
	areaM2: v.optional(wholeIn({ max: 1_000_000, message: m.energy_setup_area_invalid }), 0),
});

export type ZoneInput = Omit<v.InferOutput<typeof zoneSchema>, "energySiteId">;

/** A unit of the site's, or none. */
const unit = () => v.optional(optionalId(m.energy_setup_unit_elsewhere), "");

/** A consumer in one of the site's zones; with `consumerId` when it's edited. */
export const consumerSchema = v.object({
	energySiteId: id(),
	consumerId: v.optional(optionalId(), ""),
	zoneId: id(m.energy_setup_zone_required),
	name: requiredText(m.energy_setup_name_required, 80),
	ratedKw: amount(m.energy_setup_rated_invalid, { above: true }),
	equipmentId: unit(),
});

export type ConsumerInput = Omit<v.InferOutput<typeof consumerSchema>, "energySiteId">;

/** A temperature in °C, optional: an empty input is none (`undefined`, stored as `null`). */
const temperature = () =>
	v.optional(amount(m.energy_setup_temperature_invalid, { min: -80, max: 80 }));

/** A monitored door in one of the site's zones; with `doorId` when it's edited. */
export const doorSchema = v.object({
	energySiteId: id(),
	doorId: v.optional(optionalId(), ""),
	zoneId: id(m.energy_setup_zone_required),
	code: code(),
	name: requiredText(m.energy_setup_name_required, 80),
	kind: v.picklist(doorKinds, m.validation_choose_one),
	lossKw: amount(m.energy_setup_loss_invalid),
	thresholdMinutes: wholeIn({ min: 1, max: 1440, message: m.energy_setup_minutes_invalid }),
	insideC: temperature(),
	outsideC: temperature(),
	equipmentId: unit(),
});

export type DoorInput = Omit<v.InferOutput<typeof doorSchema>, "energySiteId">;

/** An energy site to delete, by its id. */
export const deleteSiteSchema = v.object({ id: id() });

/** A zone, consumer or door of the energy site `energySiteId` to delete, by its id. */
export const deletePartSchema = v.object({ energySiteId: id(), id: id() });
