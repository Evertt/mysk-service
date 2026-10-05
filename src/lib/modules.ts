/**
 * The app's optional modules: feature sets on top of the core (customers, equipment, orders, …)
 * that some tenants buy and others don't.
 *
 * This registry is the basis for per-tenant module access later on: which tenant has which module,
 * hiding a module's navigation and links, and refusing its routes and remote functions. Nothing
 * uses it for that yet; for now it only describes the modules.
 *
 * A module keeps to itself so it can be switched off: its routes live under `route`, its
 * components in `#lib/components/<id>/`, and its tables reference the core tables, never the
 * other way round.
 */
import type { RouteId } from "$app/types";
import FileCheckIcon from "@lucide/svelte/icons/file-check";
import type { Component } from "svelte";

export interface AppModule {
	id: string;
	label: string;
	description: string;
	/** The route id of the module's section, for `resolve()`. */
	route: RouteId;
	icon: Component;
}

export const modules = [
	{
		id: "contracts",
		label: "Service contracts",
		description:
			"Maintenance agreements: a monthly fee for covering a customer's equipment with a guaranteed response time.",
		route: "/(app)/contracts",
		icon: FileCheckIcon,
	},
] as const satisfies readonly AppModule[];

export type ModuleId = (typeof modules)[number]["id"];
