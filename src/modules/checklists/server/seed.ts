import { eq } from "drizzle-orm";

import { insertRows } from "#lib/server/db/parameters.ts";
import { equipmentCategory } from "#lib/server/db/schema.ts";
import {
	type FieldworksCategory,
	seedCategories,
	shltrCategories,
} from "#lib/server/db/seed/categories.ts";
import { defineSeed, type TenantDraft } from "#lib/server/db/seed/module-seed.ts";

import { checklistTemplate, checklistTemplateCategory, checklistTemplateItem } from "./schema.ts";
import { seedChecklists } from "./seed-checklists.ts";

type ShltrCategory = (typeof shltrCategories)[number]["key"];

/** A demo template: its points as `[group, text]`, and the demo categories (by key) it's for. */
interface SeedTemplate<Category> {
	name: string;
	norm: string | null;
	validityMonths?: number;
	points: [group: string, text: string][];
	categories: Category[];
}

/**
 * SHLTR's templates, the mockup's five verbatim (`docs/plans/shltr-domain.md`, §2.7), with its
 * categories: the doors with springs and cables by the sectional door's, airco by the F-gas
 * checks, docks by the leveller's, stairs by NEN-EN ISO 14122, and the rest by the general one,
 * a visual check valid for six months (so some of its inspections have expired).
 */
const shltrTemplates: SeedTemplate<ShltrCategory>[] = [
	{
		name: "Sectionaaldeur",
		norm: "NEN-EN 12604/12453",
		points: [
			["Mechanisch", "Torsieveren op spanning en breuk gecontroleerd"],
			["Mechanisch", "Staaldraadkabels vrij van rafels en corrosie"],
			["Mechanisch", "Rollen, scharnieren en geleiderails gesmeerd"],
			["Mechanisch", "Veerbreukbeveiliging en kabelbreukbeveiliging getest"],
			["Elektrisch", "Aandrijving, eindschakelaars en noodstop werkend"],
			["Veiligheid", "Fotocel / lichtscherm stopt en keert deur"],
			["Veiligheid", "Onderloopbeveiliging (sluitkantbeveiliging) getest"],
			["Afdichting", "Bodem-, zij- en bovenafdichting intact"],
			["Afronding", "Keuringssticker geplaatst en logboek bijgewerkt"],
		],
		categories: ["sectional_door", "high_speed_door"],
	},
	{
		name: "Airco / koeltechniek",
		norm: "F-gassen",
		points: [
			["Binnenunit", "Filters gereinigd of vervangen"],
			["Binnenunit", "Verdamper en condensafvoer schoon, pomp werkt"],
			["Buitenunit", "Condensor gereinigd, ventilator vrij"],
			["Koudemiddel", "Lekdichtheidscontrole uitgevoerd (F-gassen)"],
			["Koudemiddel", "Drukken en oververhitting gemeten"],
			["Elektrisch", "Aansluitingen en stroomopname gecontroleerd"],
			["Prestatie", "Uitblaastemperatuur binnen specificatie"],
			["Afronding", "Logboek F-gassen bijgewerkt"],
		],
		categories: ["hvac"],
	},
	{
		name: "Dockleveller / Salvo dock",
		norm: null,
		points: [
			["Hydrauliek", "Oliepeil en slangen zonder lekkage"],
			["Hydrauliek", "Cilinders en veiligheidsventiel getest"],
			["Constructie", "Lip, scharnieren en plateau zonder scheuren"],
			["Veiligheid", "Voetbeschermingsplaten en waarschuwingsstrepen aanwezig"],
			["Salvo", "Wheel-Lok / chock vergrendeling getest"],
			["Salvo", "SCP-paneel, sleutel en beacon functioneren"],
			["Afronding", "Keuringssticker geplaatst"],
		],
		categories: ["dock_leveller", "salvo_dock"],
	},
	{
		name: "Bordes / trap",
		norm: "NEN-EN ISO 14122",
		points: [
			["Constructie", "Boutverbindingen en verankering vast"],
			["Constructie", "Leuningen en kniesloten stevig"],
			["Veiligheid", "Antislip treden in goede staat"],
			["Veiligheid", "Kickplates aanwezig en onbeschadigd"],
			["Afwerking", "Corrosie en coating beoordeeld"],
			["Afronding", "Rapportage vastgelegd"],
		],
		categories: ["stairs"],
	},
	{
		name: "Algemene inspectie",
		norm: null,
		// A lighter visual check, every six months.
		validityMonths: 6,
		points: [
			["Algemeen", "Visuele inspectie op schade"],
			["Algemeen", "Werking volgens specificatie"],
			["Veiligheid", "Veiligheidsvoorzieningen aanwezig"],
			["Afronding", "Rapportage vastgelegd"],
		],
		categories: ["fire_door", "automatic_door", "aerial_platform", "other"],
	},
];

/**
 * The Fieldworks demo tenants' templates, in Dutch like the rest of their data: for boilers,
 * chillers, air handlers, generators and lifts. Compressors and pumps have none, so the list shows
 * gaps.
 */
const fieldworksTemplates: SeedTemplate<FieldworksCategory>[] = [
	{
		name: "Stookinstallatie",
		norm: "NEN 3028",
		points: [
			["Verbranding", "Rookgasanalyse (CO, CO₂, O₂) uitgevoerd"],
			["Verbranding", "Branderinstelling en ontsteking gecontroleerd"],
			["Veiligheid", "Vlambeveiliging en maximaalthermostaat getest"],
			["Veiligheid", "Gasaansluitingen op dichtheid gecontroleerd"],
			["Water", "Waterdruk en expansievat gecontroleerd"],
			["Afronding", "Logboek bijgewerkt"],
		],
		categories: ["boiler"],
	},
	{
		name: "Koelmachine",
		norm: "F-gassen",
		points: [
			["Koudemiddel", "Lekdichtheidscontrole uitgevoerd"],
			["Koudemiddel", "Drukken en temperaturen gemeten"],
			["Condensor", "Condensor gereinigd, ventilatoren vrij"],
			["Elektrisch", "Aansluitingen en stroomopname gecontroleerd"],
			["Afronding", "Logboek F-gassen bijgewerkt"],
		],
		categories: ["chiller"],
	},
	{
		name: "Luchtbehandelingskast",
		norm: null,
		validityMonths: 6,
		points: [
			["Filters", "Filters vervangen en drukverschil genoteerd"],
			["Ventilator", "V-snaren en lagers gecontroleerd"],
			["Batterijen", "Verwarmings- en koelbatterij gereinigd"],
			["Hygiëne", "Condensbak en afvoer schoon"],
			["Afronding", "Rapportage vastgelegd"],
		],
		categories: ["air_handler"],
	},
	{
		name: "Noodstroomaggregaat",
		norm: null,
		points: [
			["Motor", "Olie- en koelvloeistofpeil gecontroleerd"],
			["Motor", "Startaccu's getest"],
			["Proefdraaien", "Proefgedraaid onder belasting"],
			["Proefdraaien", "Omschakeling net- en noodstroom getest"],
			["Brandstof", "Brandstofvoorraad en leidingen op lekkage gecontroleerd"],
			["Afronding", "Logboek bijgewerkt"],
		],
		categories: ["generator"],
	},
	{
		name: "Lift",
		norm: "NEN-EN 81-20",
		points: [
			["Veiligheid", "Noodstop en alarmering werkend"],
			["Veiligheid", "Vangwerk en snelheidsbegrenzer getest"],
			["Deuren", "Deursloten en deurbeveiliging getest"],
			["Aandrijving", "Kabels, schijven en rem gecontroleerd"],
			["Afronding", "Logboek bijgewerkt"],
		],
		categories: ["elevator"],
	},
];

/** The name of a demo category by its key, as the core seeded it. */
const categoryName = (key: string) =>
	[...seedCategories, ...shltrCategories].find((category) => category.key === key)!.name;

export default defineSeed<TenantDraft["profile"]>({
	// Whose business the tenant is, which says which templates it gets.
	generate: ({ profile }) => profile,

	async run({ tx, tenants, count, log }) {
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const templates: SeedTemplate<string>[] =
				tenant.data === "shltr" ? shltrTemplates : fieldworksTemplates;
			const categories = await tx
				.select({ id: equipmentCategory.id, name: equipmentCategory.name })
				.from(equipmentCategory)
				.where(eq(equipmentCategory.organizationId, organizationId));
			const categoryId = new Map(categories.map((category) => [category.name, category.id]));

			const rows = await tx
				.insert(checklistTemplate)
				.values(
					templates.map(({ name, norm, validityMonths }, position) => ({
						organizationId,
						name,
						norm,
						validityMonths,
						position,
					})),
				)
				.returning({ id: checklistTemplate.id });
			const items = templates.flatMap((template, i) =>
				template.points.map(([group, text], position) => ({
					organizationId,
					templateId: rows[i].id,
					group,
					text,
					position,
				})),
			);
			const links = templates.flatMap((template, i) =>
				template.categories.flatMap((key) => {
					const id = categoryId.get(categoryName(key));
					return id === undefined
						? []
						: [{ organizationId, templateId: rows[i].id, categoryId: id }];
				}),
			);
			await insertRows(tx, checklistTemplateItem, items);
			await insertRows(tx, checklistTemplateCategory, links);
			count("checklistTemplates", rows);
			count("checklistTemplateItems", items);
			await seedChecklists(tx, tenant, tenant.data === "shltr", { count, log });
		}
	},
});
