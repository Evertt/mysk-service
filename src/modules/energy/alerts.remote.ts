/**
 * A site's alerts: the list (open ones, or all), "Maak opdracht" (an order of an open alert) and
 * "Afhandelen" (resolving one). Every office member may do both.
 */
import * as v from "valibot";

import { alertStatuses } from "./model.ts";
import { command, query } from "./remote-functions.ts";
import { orderAlert, resolveAlert, siteAlerts } from "./server/alerts.ts";
import { loadSite } from "./server/figures.ts";

const id = v.pipe(v.number(), v.integer(), v.minValue(1));

/** The site's alerts, newest first: those of `status`, or all of them. */
export const getEnergyAlerts = query(
	v.object({ site: id, status: v.nullable(v.picklist(alertStatuses)) }),
	async ({ site, status }) => {
		await loadSite(site);
		return siteAlerts(site, status);
	},
);

/** Makes an order of an open alert; answers its number. */
export const makeAlertOrder = command(id, async (alertId) => ({
	number: await orderAlert(alertId),
}));

/** Resolves an alert. */
export const resolveEnergyAlert = command(id, async (alertId) => {
	await resolveAlert(alertId);
});
