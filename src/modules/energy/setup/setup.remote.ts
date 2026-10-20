/**
 * A site's setup page (`/energy/<site>/setup`), for managers only: its settings, and its zones,
 * consumers and monitored doors to add, edit and delete (`../server/sites.ts`,
 * `../server/parts.ts`). The page watches the site (`watchEnergySetup`), so a change, also
 * another manager's, shows.
 */
import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

import { recordId } from "#lib/schema.ts";
import { live } from "#lib/server/live.ts";

import { forManagers } from "../remote-functions.ts";
import {
	deleteConsumer,
	deleteDoor,
	deleteZone,
	saveConsumer,
	saveDoor,
	saveZone,
} from "../server/parts.ts";
import { deleteEnergySite as remove, siteSetup, updateEnergySite } from "../server/sites.ts";
import {
	consumerSchema,
	deletePartSchema,
	deleteSiteSchema,
	doorSchema,
	energySiteSchema,
	zoneSchema,
} from "./setup-schema.ts";

/** The site's settings, zones, consumers and doors, and the units at its customer site. */
export const getEnergySetup = forManagers.query(recordId(), (id) => siteSetup(id));

/** When the site or one of its parts last changed. */
export const watchEnergySetup = forManagers.query.live(recordId(), (id) =>
	live({ type: "energy_site", id }),
);

/** Saves the site's own settings. */
export const saveEnergySite = forManagers.form(energySiteSchema, ({ energySiteId, ...input }) =>
	updateEnergySite(energySiteId, input),
);

/** Deletes the site (refused while it holds measurements), and goes to the sites. */
export const deleteEnergySite = forManagers.form(deleteSiteSchema, async ({ id }) => {
	await remove(id);
	redirect(303, resolve("/(app)/(modules)/energy"));
});

/** Adds or saves a zone of the site. */
export const saveEnergyZone = forManagers.form(zoneSchema, async ({ energySiteId, ...input }) => {
	await saveZone(energySiteId, input);
	return { code: input.code };
});

/** Deletes a zone of the site (refused while it holds measurements). */
export const deleteEnergyZone = forManagers.form(deletePartSchema, (input) =>
	deleteZone(input.energySiteId, input.id),
);

/** Adds or saves a consumer in one of the site's zones. */
export const saveEnergyConsumer = forManagers.form(
	consumerSchema,
	async ({ energySiteId, ...input }) => {
		await saveConsumer(energySiteId, input);
		return { name: input.name };
	},
);

/** Deletes a consumer of the site. */
export const deleteEnergyConsumer = forManagers.form(deletePartSchema, (input) =>
	deleteConsumer(input.energySiteId, input.id),
);

/** Adds or saves a monitored door in one of the site's zones. */
export const saveEnergyDoor = forManagers.form(doorSchema, async ({ energySiteId, ...input }) => {
	await saveDoor(energySiteId, input);
	return { code: input.code };
});

/** Deletes a door of the site (refused while it holds measurements). */
export const deleteEnergyDoor = forManagers.form(deletePartSchema, (input) =>
	deleteDoor(input.energySiteId, input.id),
);
