/**
 * The parts shop's demo data, SHLTR's only (`docs/plans/shltr-domain.md`, §2.8): its two categories,
 * Sectionaaldeuren and Levellers, its fourteen products on the materials of the same SKUs (the two
 * on request "Op aanvraag", three popular), each linked to the checklist points it fixes, and
 * Riedel's two orders, SH-…-007 delivered and SH-…-011 confirmed, which are the partner programme's
 * seeded spends of its credit (`orderSpends`: this sets what they come to and their notes) and whose
 * stock was set aside (the materials' draft takes the reservations into its ledger, so the stock
 * stays as it is). No faker: it's all fixed.
 */
import { and, eq, sql } from "drizzle-orm";

import { DAY } from "#lib/server/db/seed/clock.ts";
import { defineSeed } from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";
import type { MaterialsDraft } from "#modules/materials/api/seed.ts";
import { material } from "#modules/materials/api/tables.server.ts";
import type { PartnersDraft } from "#modules/partner-programme/api/seed.ts";
import { walletEntry } from "#modules/partner-programme/api/tables.server.ts";

import type { ProductUnit, ShopOrderStatus } from "../model.ts";
import {
	shopCategory,
	shopOrder,
	shopOrderLine,
	shopProduct,
	shopProductCheckpoint,
} from "./schema.ts";

const doors = "Sectionaaldeuren";
const levellers = "Levellers";

/** A product: its SKU, category, description, how it's sold, its flags and the points it fixes. */
interface SeedProduct {
	sku: string;
	category: string;
	description: string;
	unit: ProductUnit;
	popular?: boolean;
	onRequest?: boolean;
	/** The checklist points' texts (SHLTR's templates', `checklists/server/seed.ts`). */
	checkpoints: string[];
}

const products: SeedProduct[] = [
	{
		sku: "SD-001",
		category: doors,
		description: "Paar torsieveren op maat, met veerbreukbeveiliging.",
		unit: "set",
		popular: true,
		checkpoints: [
			"Torsieveren op spanning en breuk gecontroleerd",
			"Veerbreukbeveiliging en kabelbreukbeveiliging getest",
		],
	},
	{
		sku: "SD-002",
		category: doors,
		description: "Twee staaldraadkabels met kabeltrommels en klemmen.",
		unit: "set",
		checkpoints: [
			"Staaldraadkabels vrij van rafels en corrosie",
			"Veerbreukbeveiliging en kabelbreukbeveiliging getest",
		],
	},
	{
		sku: "SD-003",
		category: doors,
		description: "Tien looprollen met lagers voor de geleiderails.",
		unit: "set",
		checkpoints: ["Rollen, scharnieren en geleiderails gesmeerd"],
	},
	{
		sku: "SD-004",
		category: doors,
		description: "Rubber bodemafdichting, 3 meter, op maat te snijden.",
		unit: "piece",
		checkpoints: ["Bodem-, zij- en bovenafdichting intact"],
	},
	{
		sku: "SD-005",
		category: doors,
		description: "Fotocel en sluitkantbeveiliging, met aansluitset.",
		unit: "piece",
		popular: true,
		checkpoints: [
			"Fotocel / lichtscherm stopt en keert deur",
			"Onderloopbeveiliging (sluitkantbeveiliging) getest",
		],
	},
	{
		sku: "SD-006",
		category: doors,
		description: "Zijscharnieren voor de panelen, links en rechts.",
		unit: "pair",
		checkpoints: ["Rollen, scharnieren en geleiderails gesmeerd"],
	},
	{
		sku: "SD-007",
		category: doors,
		description: "Geïsoleerd deurpaneel in de kleur van de deur, op maat gemaakt.",
		unit: "piece",
		onRequest: true,
		checkpoints: [],
	},
	{
		sku: "SD-008",
		category: doors,
		description: "Aandrijving 24V met eindschakelaars, voor deuren tot 25 m².",
		unit: "piece",
		checkpoints: ["Aandrijving, eindschakelaars en noodstop werkend"],
	},
	{
		sku: "LV-001",
		category: levellers,
		description: "Hoofdcilinder voor het plateau, met veiligheidsventiel.",
		unit: "piece",
		popular: true,
		checkpoints: ["Cilinders en veiligheidsventiel getest"],
	},
	{
		sku: "LV-002",
		category: levellers,
		description: "Scharnier van de klaplip met pennen en bussen.",
		unit: "set",
		checkpoints: ["Lip, scharnieren en plateau zonder scheuren"],
	},
	{
		sku: "LV-003",
		category: levellers,
		description: "Hogedrukslangen met koppelingen voor plateau en lip.",
		unit: "set",
		checkpoints: ["Oliepeil en slangen zonder lekkage"],
	},
	{
		sku: "LV-004",
		category: levellers,
		description: "Noodstop voor het bedienpaneel, met sleutelschakelaar.",
		unit: "piece",
		checkpoints: ["SCP-paneel, sleutel en beacon functioneren"],
	},
	{
		sku: "LV-005",
		category: levellers,
		description: "Onderhoudssteun die het plateau veilig omhoog houdt.",
		unit: "piece",
		checkpoints: ["Cilinders en veiligheidsventiel getest"],
	},
	{
		sku: "LV-006",
		category: levellers,
		description: "Rubber stootbuffer voor de zijkant van de dock.",
		unit: "piece",
		onRequest: true,
		checkpoints: ["Voetbeschermingsplaten en waarschuwingsstrepen aanwezig"],
	},
];

/** What Riedel's orders held, by the number's sequence: € 1.000 and € 475. */
const orderLines: Record<string, { sku: string; quantity: number }[]> = {
	"007": [
		{ sku: "SD-001", quantity: 5 },
		{ sku: "SD-006", quantity: 5 },
	],
	"011": [
		{ sku: "SD-001", quantity: 1 },
		{ sku: "LV-002", quantity: 1 },
		{ sku: "SD-003", quantity: 1 },
	],
};

/** How far Riedel's orders got: the older one delivered, the newer one confirmed. */
const orderStatus: Record<string, ShopOrderStatus> = { "007": "delivered", "011": "confirmed" };

interface SeedShopOrder {
	customerId: number;
	number: string;
	status: ShopOrderStatus;
	total: number;
	/** The spend's note, to find its wallet entry by. */
	note: string;
	createdAt: Date;
	updatedAt: Date;
	lines: { sku: string; quantity: number; unitPrice: number }[];
}

interface ShopSeed {
	orders: SeedShopOrder[];
}

export default defineSeed<ShopSeed>({
	generate(draft) {
		const materials = draft.modules.materials as MaterialsDraft | undefined;
		const partners = draft.modules["partner-programme"] as PartnersDraft | undefined;
		if (draft.profile !== "shltr" || !materials || !partners) return { orders: [] };
		const bySku = new Map(materials.materials.map((each) => [each.sku, each]));
		const orders = partners.orderSpends.flatMap(({ customerId, spend }) => {
			const sequence = spend.order!.slice(-3);
			const wanted = orderLines[sequence];
			if (!wanted) return [];
			const lines = wanted.map((line) => ({
				...line,
				unitPrice: bySku.get(line.sku)!.unitPrice,
			}));
			const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
			// The spend is this order's: what it comes to, and its note as the shop writes it.
			spend.amount = total;
			spend.note = `Bestelling ${spend.order}`;
			for (const line of lines) {
				materials.movements.push({
					materialId: bySku.get(line.sku)!.id,
					quantity: -line.quantity,
					kind: "reservation",
					note: spend.order!,
					createdAt: spend.on,
				});
			}
			return {
				customerId,
				number: spend.order!,
				status: orderStatus[sequence] ?? "placed",
				total,
				note: spend.note,
				createdAt: spend.on,
				updatedAt: new Date(spend.on.getTime() + 2 * DAY),
				lines,
			};
		});
		return { orders };
	},

	async run({ tx, tenants, count }) {
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const categories = await tx
				.insert(shopCategory)
				.values([doors, levellers].map((name, position) => ({ organizationId, name, position })))
				.returning({ id: shopCategory.id, name: shopCategory.name });
			count("shopCategories", categories);
			const categoryId = new Map(categories.map((row) => [row.name, row.id]));

			const materials = await tx
				.select({ id: material.id, sku: material.sku, name: material.name })
				.from(material)
				.where(eq(material.organizationId, organizationId));
			const materialId = new Map(materials.map((row) => [row.sku, row.id]));
			const offered = products.filter((product) => materialId.has(product.sku));
			if (!offered.length) continue;
			const inserted = await tx
				.insert(shopProduct)
				.values(
					offered.map((product) => ({
						organizationId,
						materialId: materialId.get(product.sku)!,
						categoryId: categoryId.get(product.category)!,
						description: product.description,
						unit: product.unit,
						popular: product.popular ?? false,
						onRequest: product.onRequest ?? false,
						creditEligible: !product.onRequest,
					})),
				)
				.returning({ id: shopProduct.id, materialId: shopProduct.materialId });
			count("shopProducts", inserted);

			// The checklist points, by their text in the tenant's templates (the checklists module's,
			// read as plain SQL: the shop only enhances it).
			const points = await tx.all<{ id: number; text: string }>(
				sql`select id, text from checklist_template_item where organization_id = ${organizationId}`,
			);
			const pointIds = (text: string) =>
				points.filter((point) => point.text === text).map((point) => point.id);
			const links = offered.flatMap((product, i) =>
				product.checkpoints.flatMap((text) =>
					pointIds(text).map((templateItemId) => ({
						organizationId,
						productId: inserted[i].id,
						templateItemId,
					})),
				),
			);
			if (links.length) await tx.insert(shopProductCheckpoint).values(links);
			count("shopProductCheckpoints", links);

			for (const order of tenant.data.orders) {
				const customerId = tenant.customerId(order.customerId);
				const [spend] = await tx
					.select({ id: walletEntry.id })
					.from(walletEntry)
					.where(
						and(
							eq(walletEntry.organizationId, organizationId),
							eq(walletEntry.customerId, customerId),
							eq(walletEntry.note, order.note),
						),
					);
				const [placed] = await tx
					.insert(shopOrder)
					.values({
						organizationId,
						number: order.number,
						customerId,
						status: order.status,
						total: order.total,
						walletEntryId: spend?.id ?? null,
						createdAt: toMoment(order.createdAt),
						updatedAt: toMoment(order.updatedAt),
					})
					.returning({ id: shopOrder.id });
				await tx.insert(shopOrderLine).values(
					order.lines.map((line) => ({
						organizationId,
						orderId: placed.id,
						materialId: materialId.get(line.sku)!,
						sku: line.sku,
						name: materials.find((row) => row.sku === line.sku)!.name,
						quantity: line.quantity,
						unitPrice: line.unitPrice,
					})),
				);
			}
			count("shopOrders", tenant.data.orders);
		}
	},
});
