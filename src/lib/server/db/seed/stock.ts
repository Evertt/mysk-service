import { en, Faker, nl } from "@faker-js/faker";

import { holdsStock } from "#lib/models.ts";

import { addDays, now } from "./clock.ts";
import type { TenantData } from "./tenant.ts";

/**
 * The stock ledger that adds up to each generated material's stock: an opening balance before
 * the first order, consumption by the lines of every order that holds stock, and a few recent
 * deliveries (no larger than the stock now, so the stock was never below zero). With a faker of its
 * own, so the rest of the data is the same with or without it.
 */
export function generateStockMovements(
	data: Pick<TenantData, "orders" | "orderLines" | "materials">,
	seed: number,
) {
	const random = new Faker({ locale: [nl, en] });
	random.seed(seed);
	const round = (quantity: number) => Math.round(quantity * 100) / 100;
	const orders = new Map(data.orders.map((o) => [o.id, o]));

	// Only orders that hold stock took it: not quotes, nor cancelled orders (see `holdsStock`).
	const consumption = data.orderLines.flatMap((line) => {
		const o = orders.get(line.orderId)!;
		if (!holdsStock(o.status)) return [];
		return {
			materialId: line.materialId,
			quantity: -line.quantity,
			kind: "consumption" as const,
			orderId: o.id,
			orderNumber: o.number,
			note: null as string | null,
			createdAt: o.createdAt,
		};
	});

	const receipts = random.helpers
		.arrayElements(data.materials, Math.ceil(data.materials.length / 3))
		.filter((m) => m.stock >= 1)
		.map((m) => ({
			materialId: m.id,
			quantity:
				m.unit === "pcs"
					? random.number.int({ min: 1, max: m.stock })
					: random.number.float({ min: 1, max: m.stock, fractionDigits: 1 }),
			kind: "receipt" as const,
			orderId: null,
			orderNumber: null,
			note: `Pakbon ${random.string.numeric(6)}`,
			createdAt: random.date.between({ from: addDays(now, -120), to: addDays(now, -1) }),
		}));

	const opening = data.materials
		.map((m) => {
			const change = [...consumption, ...receipts]
				.filter((movement) => movement.materialId === m.id)
				.reduce((sum, movement) => sum + movement.quantity, 0);
			return {
				materialId: m.id,
				quantity: round(m.stock - change),
				kind: "opening_balance" as const,
				orderId: null,
				orderNumber: null,
				note: null,
				createdAt: addDays(now, -560),
			};
		})
		.filter((movement) => movement.quantity !== 0);

	return [...opening, ...consumption, ...receipts].toSorted(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);
}
