import { describe, expect, test } from "vite-plus/test";

import { formatCode, sequenceStart } from "#lib/numbering.ts";
import {
	balanceAfter,
	type CatalogueProduct,
	cartTotal,
	checkoutProblems,
	creditOrderVat,
	isOpenShopOrder,
	isOrderable,
	mergeLines,
	productStock,
	shopOrderNumberFormat,
	statusAfter,
	stepsFrom,
} from "#modules/parts-shop/model.ts";

const euros = (amount: number) => amount * 100;

/** SHLTR's SD-001 (in stock), SD-005 (low), SD-007 (on request) and one not payable with credit. */
const products: CatalogueProduct[] = [
	{ id: 1, price: euros(145), stock: 20, onRequest: false, creditEligible: true },
	{ id: 5, price: euros(120), stock: 3, onRequest: false, creditEligible: true },
	{ id: 7, price: euros(320), stock: 0, onRequest: true, creditEligible: false },
	{ id: 9, price: euros(50), stock: 10, onRequest: false, creditEligible: false },
];

describe("the checkout", () => {
	test("adds up the cart excluding VAT, and charges no VAT on credit", () => {
		expect(
			cartTotal(
				[
					{ productId: 1, quantity: 2 },
					{ productId: 5, quantity: 1 },
				],
				products,
			),
		).toBe(euros(410));
		expect(creditOrderVat(euros(410))).toBe(0);
	});

	test("lets a cart be paid that the credit covers, down to nothing left", () => {
		const cart = [{ productId: 1, quantity: 2 }];
		expect(checkoutProblems(cart, products, euros(290))).toEqual([]);
		expect(balanceAfter(euros(290), euros(290))).toBe(0);
		expect(balanceAfter(euros(2_275), euros(290))).toBe(euros(1_985));
	});

	test("refuses a total above the credit available: the balance never goes below zero", () => {
		expect(checkoutProblems([{ productId: 1, quantity: 2 }], products, euros(289))).toEqual([
			{ kind: "balance", total: euros(290), available: euros(289) },
		]);
		expect(checkoutProblems([{ productId: 1, quantity: 1 }], products, 0)).toEqual([
			{ kind: "balance", total: euros(145), available: 0 },
		]);
	});

	test("refuses an empty cart, what's on request or not payable with credit, and unknown products", () => {
		expect(checkoutProblems([], products, euros(1_000))).toEqual([{ kind: "empty" }]);
		expect(checkoutProblems([{ productId: 7, quantity: 1 }], products, euros(1_000))).toEqual([
			{ kind: "on_request", productId: 7 },
		]);
		expect(checkoutProblems([{ productId: 9, quantity: 1 }], products, euros(1_000))).toEqual([
			{ kind: "not_eligible", productId: 9 },
		]);
		// Another tenant's product (or one taken out of the shop) isn't in the catalogue.
		expect(checkoutProblems([{ productId: 42, quantity: 1 }], products, euros(1_000))).toEqual([
			{ kind: "unknown", productId: 42 },
		]);
	});

	test("refuses more than is in stock, the same product's lines added up", () => {
		const cart = [
			{ productId: 5, quantity: 2 },
			{ productId: 5, quantity: 2 },
		];
		expect(checkoutProblems(cart, products, euros(1_000))).toEqual([
			{ kind: "stock", productId: 5, stock: 3 },
		]);
		expect(mergeLines(cart)).toEqual([{ productId: 5, quantity: 4 }]);
	});

	test("refuses quantities that aren't a whole number from 1 to 99", () => {
		for (const quantity of [0, -1, 1.5, 100]) {
			expect(checkoutProblems([{ productId: 1, quantity }], products, euros(100_000))).toEqual([
				{ kind: "quantity", productId: 1 },
			]);
		}
	});

	test("offers what's priced and payable with credit only", () => {
		expect(isOrderable(products[0])).toBe(true);
		expect(isOrderable(products[2])).toBe(false);
		expect(isOrderable(products[3])).toBe(false);
	});
});

describe("a product's stock", () => {
	const low = (stock: number) => stock < 10;

	test("is on request when it's ordered so, or out; low below the threshold; else in stock", () => {
		expect(productStock({ onRequest: false, stock: 20 }, low)).toBe("in_stock");
		expect(productStock({ onRequest: false, stock: 3 }, low)).toBe("low");
		expect(productStock({ onRequest: false, stock: 0 }, low)).toBe("on_request");
		expect(productStock({ onRequest: true, stock: 20 }, low)).toBe("on_request");
	});
});

describe("a shop order", () => {
	test("is numbered SH-YYYY-NNN, the sequence running on across years", () => {
		expect(formatCode(shopOrderNumberFormat, 12, 2026)).toBe("SH-2026-012");
		expect(formatCode(shopOrderNumberFormat, 1_000, 2027)).toBe("SH-2027-1000");
		// Where `nextNumber()` reads the sequence from: after `SH-2026-`.
		expect(sequenceStart(shopOrderNumberFormat)).toBe("SH-2026-".length + 1);
	});

	test("goes from placed through confirmed and shipped to delivered", () => {
		expect(stepsFrom("placed")).toEqual(["confirm", "cancel"]);
		expect(statusAfter("placed", "confirm")).toBe("confirmed");
		expect(stepsFrom("confirmed")).toEqual(["ship", "cancel"]);
		expect(statusAfter("confirmed", "ship")).toBe("shipped");
		expect(stepsFrom("shipped")).toEqual(["deliver"]);
		expect(statusAfter("shipped", "deliver")).toBe("delivered");
		expect(stepsFrom("delivered")).toEqual([]);
	});

	test("is cancelled only before it's shipped, and once", () => {
		expect(statusAfter("placed", "cancel")).toBe("cancelled");
		expect(statusAfter("confirmed", "cancel")).toBe("cancelled");
		expect(statusAfter("shipped", "cancel")).toBeNull();
		expect(statusAfter("cancelled", "cancel")).toBeNull();
		expect(statusAfter("placed", "deliver")).toBeNull();
	});

	test("is open until it's delivered or cancelled", () => {
		expect(isOpenShopOrder("placed")).toBe(true);
		expect(isOpenShopOrder("shipped")).toBe(true);
		expect(isOpenShopOrder("delivered")).toBe(false);
		expect(isOpenShopOrder("cancelled")).toBe(false);
	});
});
