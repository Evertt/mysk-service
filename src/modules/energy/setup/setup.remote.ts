/**
 * A site's setup page (`/energy/<site>/setup`), for managers only: its settings, and its zones,
 * consumers and monitored doors to add, edit and delete (`../server/setup.ts`). Each change asks
 * for the page's data again.
 */
import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

import { recordId } from "#lib/schema.ts";
import { refuse } from "#lib/server/forms.ts";

import { forManagers } from "../remote-functions.ts";
import {
	deleteConsumer,
	deleteDoor,
	deleteEnergySite as remove,
	deleteZone,
	saveConsumer,
	saveDoor,
	saveZone,
	siteSetup,
	updateEnergySite,
} from "../server/setup.ts";
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

/** Saves the site's own settings. */
export const saveEnergySite = forManagers.form(
	energySiteSchema,
	async ({ energySiteId, ...input }) => {
		await updateEnergySite(energySiteId, input);
		void getEnergySetup(energySiteId).refresh();
	},
);

/** Deletes the site (refused while it holds measurements), and goes to the sites. */
export const deleteEnergySite = forManagers.form(deleteSiteSchema, async ({ id }, issue) => {
	refuse(issue, await remove(id));
	redirect(303, resolve("/(app)/(modules)/energy"));
});

/** Adds or saves a zone of the site. */
export const saveEnergyZone = forManagers.form(
	zoneSchema,
	async ({ energySiteId, ...input }, issue) => {
		refuse(issue, await saveZone(energySiteId, input));
		void getEnergySetup(energySiteId).refresh();
		return { code: input.code };
	},
);

/** Deletes a zone of the site (refused while it holds measurements). */
export const deleteEnergyZone = forManagers.form(deletePartSchema, async (input, issue) => {
	refuse(issue, await deleteZone(input.energySiteId, input.id));
	void getEnergySetup(input.energySiteId).refresh();
});

/** Adds or saves a consumer in one of the site's zones. */
export const saveEnergyConsumer = forManagers.form(
	consumerSchema,
	async ({ energySiteId, ...input }, issue) => {
		refuse(issue, await saveConsumer(energySiteId, input));
		void getEnergySetup(energySiteId).refresh();
		return { name: input.name };
	},
);

/** Deletes a consumer of the site. */
export const deleteEnergyConsumer = forManagers.form(deletePartSchema, async (input) => {
	await deleteConsumer(input.energySiteId, input.id);
	void getEnergySetup(input.energySiteId).refresh();
});

/** Adds or saves a monitored door in one of the site's zones. */
export const saveEnergyDoor = forManagers.form(
	doorSchema,
	async ({ energySiteId, ...input }, issue) => {
		refuse(issue, await saveDoor(energySiteId, input));
		void getEnergySetup(energySiteId).refresh();
		return { code: input.code };
	},
);

/** Deletes a door of the site (refused while it holds measurements). */
export const deleteEnergyDoor = forManagers.form(deletePartSchema, async (input, issue) => {
	refuse(issue, await deleteDoor(input.energySiteId, input.id));
	void getEnergySetup(input.energySiteId).refresh();
});
