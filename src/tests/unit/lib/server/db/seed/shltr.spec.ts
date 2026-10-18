import { en, Faker, nl } from "@faker-js/faker";
import { describe, expect, test, vi } from "vite-plus/test";

import { shltrCategories, specialtyOf } from "#lib/server/db/seed/categories.ts";
import { now } from "#lib/server/db/seed/clock.ts";
import { generateShltrTenant, shltrSignoffs } from "#lib/server/db/seed/shltr/index.ts";

/** SHLTR's demo data, as the seed makes it (with its seed). */
function generate() {
	const faker = new Faker({ locale: [nl, en] });
	faker.seed(20261016);
	return generateShltrTenant(faker);
}

const { data, placed } = generate();
const { customers, equipments, engineers, orders } = data;
const customer = (name: string) => customers.find((c) => c.name === name)!;
const unitsOf = (name: string) => equipments.filter((e) => e.customerId === customer(name).id);
const isOpen = (status: string) => ["quote", "scheduled", "in_progress"].includes(status);
const dayOf = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

describe("SHLTR's demo data", () => {
	test("is the same every time", () => {
		const again = generate();
		expect(again.data.orders).toEqual(orders);
		expect(again.data.equipments).toEqual(equipments);
		expect(again.placed.sites).toEqual(placed.sites);
	});

	test("has the mockup's customers, with their sites' preferences", () => {
		const names = customers.map((c) => c.name);
		for (const name of [
			"Riedel B.V.",
			"Bouwgroep De Vries",
			"Pakhuis 7",
			"Weggemans Logistiek",
			"Vermeer Logistiek",
			"Van Dijk Koeltechniek",
		]) {
			expect(names).toContain(name);
		}
		expect(new Set(names).size).toBe(names.length);
		expect(customers.length).toBeGreaterThan(30);
		const [ede] = placed.sites.filter((site) => site.customerId === customer("Riedel B.V.").id);
		expect(ede).toMatchObject({
			name: "Ede",
			address: "Frankeneng 12",
			postalCode: "6717 AG",
			contactName: "M. Verhoeven",
			contactEmail: "techniek@riedel.nl",
			contactChannel: "email",
			preferredDay: "tuesday",
			slotStart: "07:00",
			slotEnd: "15:00",
			priority: "high",
			accessNotes: "Werk buiten productietijden; melden bij receptie expeditie noord.",
		});
		// Every customer has a site, and every unit is at one of its customer's.
		const siteOwner = new Map(placed.sites.map((site) => [site.id, site.customerId]));
		for (const c of customers) expect([...siteOwner.values()]).toContain(c.id);
		for (const unit of equipments) {
			expect(siteOwner.get(placed.units.get(unit.id)!.siteId)).toBe(unit.customerId);
		}
	});

	test("has the Apparatuur page's units at Riedel, with as many open orders as it counts", () => {
		const counted = {
			"algeheel onderhoud": 1,
			"Automatische deur kantine": 0,
			"BRD Branddeur 1e verd. TD tbv wasgoed TDTE-13": 2,
			"BRD-Branddeur Aromakluis achterzijde ING-19": 2,
			"BRD-Branddeur Aromakluis voorzijde ING-16": 2,
			"BRD-Brandwerend deur Amoniak ruimte TDTE-01": 3,
			"Sectionaaldeur laaddok 07": 0,
			"Sectionaaldeur laaddok 08": 1,
		};
		const riedel = unitsOf("Riedel B.V.");
		expect(riedel.slice(0, 15).map((unit) => unit.category)).toEqual([
			"other",
			...Array(6).fill("automatic_door"),
			"stairs",
			"stairs",
			...Array(4).fill("fire_door"),
			"sectional_door",
			"sectional_door",
		]);
		for (const [name, open] of Object.entries(counted)) {
			const unit = riedel.find((u) => u.name === name)!;
			expect(
				orders.filter((o) => o.equipmentIds.includes(unit.id) && isOpen(o.status)).length,
				name,
			).toBe(open);
		}
		expect(riedel.find((u) => u.name?.endsWith("TDTE-01"))!.status).toBe("out_of_service");
		expect(riedel.find((u) => u.name === "Sectionaaldeur laaddok 07")!.status).toBe("operational");
	});

	test("Riedel's and Weggemans' inspections and maintenance take many units at once", () => {
		const together = (name: string) =>
			orders.filter(
				(o) =>
					o.customerId === customer(name).id &&
					["inspection", "maintenance"].includes(o.type) &&
					o.equipmentIds.length > 1,
			);
		const riedel = unitsOf("Riedel B.V.");
		// The yearly inspection of all its doors is one order.
		const doors = riedel.filter((unit) =>
			["automatic_door", "fire_door", "high_speed_door", "sectional_door"].includes(unit.category),
		);
		const all = together("Riedel B.V.").find((o) =>
			o.description.startsWith("Jaarlijkse keuring"),
		)!;
		expect(new Set(all.equipmentIds)).toEqual(new Set(doors.map((unit) => unit.id)));
		expect(all.equipmentIds[0]).toBe(
			riedel.find((u) => u.name === "Automatische deur kantine")!.id,
		);
		// Weggemans' docks: doors and levellers, planned.
		const docks = together("Weggemans Logistiek").find((o) => o.type === "inspection")!;
		expect(docks.equipmentIds).toHaveLength(16);
		expect(docks.status).toBe("scheduled");
		expect(together("Weggemans Logistiek").length).toBeGreaterThan(3);
		// Most orders are about one unit.
		const single = orders.filter((o) => o.equipmentIds.length === 1).length;
		expect(single / orders.length).toBeGreaterThan(0.8);
	});

	test("its units are in SHLTR's categories, and its engineers' specialties cover them", () => {
		const keys = shltrCategories.map((category) => category.key) as string[];
		for (const unit of equipments) expect(keys).toContain(unit.category);
		const specialties = new Set(engineers.filter((e) => e.active).map((e) => e.specialty));
		for (const { specialty } of shltrCategories) expect(specialties).toContain(specialty);
		expect(engineers[0].name).toMatch(/^Lev /);
	});

	test("its orders are SHLTR's mix of work", () => {
		const share = (test: (o: (typeof orders)[number]) => boolean) =>
			orders.filter(test).length / orders.length;
		expect(share((o) => o.type === "breakdown")).toBeGreaterThan(0.45);
		expect(share((o) => o.type === "breakdown")).toBeLessThan(0.62);
		expect(share((o) => o.type === "breakdown" && o.priority === "urgent")).toBeGreaterThan(0.04);
		expect(share((o) => o.type === "repair")).toBeGreaterThan(0.2);
		expect(share((o) => o.type === "repair")).toBeLessThan(0.32);
		for (const type of ["installation", "maintenance", "project", "survey", "inspection"]) {
			expect(
				share((o) => o.type === type),
				type,
			).toBeGreaterThan(0);
		}
	});

	test("its orders are consistent: units of their customer, fitting engineers, dates that agree", () => {
		const units = new Map(equipments.map((unit) => [unit.id, unit]));
		const staff = new Map(engineers.map((e) => [e.id, e]));
		let fitting = 0;
		for (const o of orders) {
			const own = o.equipmentIds.map((id) => units.get(id)!);
			for (const unit of own) expect(unit.customerId).toBe(o.customerId);
			expect(new Set(o.equipmentIds).size).toBe(o.equipmentIds.length);
			const [unit] = own;
			expect(o.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
			if (o.status === "quote") {
				expect([o.scheduledFor, o.engineerId]).toEqual([null, null]);
				continue;
			}
			const at = o.scheduledFor!;
			expect(at.getTime()).toBeGreaterThanOrEqual(o.createdAt.getTime());
			expect([1, 2, 3, 4, 5]).toContain(at.getDay());
			expect(at.getHours()).toBeGreaterThanOrEqual(6);
			expect(at.getHours()).toBeLessThan(17);
			expect(o.status === "scheduled").toBe(at > now);
			expect(o.completedAt !== null).toBe(["completed", "invoiced"].includes(o.status));
			if (unit && staff.get(o.engineerId!)!.specialty === specialtyOf(unit.category)) fitting++;
		}
		expect(
			fitting / orders.filter((o) => o.equipmentIds.length && o.engineerId).length,
		).toBeGreaterThan(0.9);
	});

	test("its engineers have one to three jobs a day, now and then four", () => {
		const perDay = Map.groupBy(
			orders.filter((o) => o.engineerId && o.scheduledFor),
			(o) => `${o.engineerId}/${dayOf(o.scheduledFor!)}`,
		);
		const loads = [...perDay.values()].map((jobs) => jobs.length);
		expect(Math.max(...loads)).toBeLessThanOrEqual(5);
		expect(loads.filter((n) => n > 3).length / loads.length).toBeLessThan(0.05);
	});

	test("the coming two weeks are planned, with no breakdowns known beyond the next working day", () => {
		const inDays = (days: number) =>
			new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
		const ahead = orders.filter(
			(o) => o.scheduledFor && o.scheduledFor > now && o.scheduledFor < inDays(14),
		);
		expect(ahead.length).toBeGreaterThan(80);
		let next = 1;
		while ([0, 6].includes(inDays(next).getDay())) next++;
		const later = ahead.filter((o) => o.scheduledFor! >= inDays(next + 1));
		expect(later.filter((o) => o.type === "breakdown")).toEqual([]);
	});

	test("its done work is signed off by the engineer and the customer's contact, when it was done", () => {
		const signoffs = shltrSignoffs(data);
		const done = orders.filter(
			(o) => ["completed", "invoiced"].includes(o.status) && o.engineerId !== null,
		);
		expect(signoffs.map((s) => s.orderId)).toEqual(done.map((o) => o.id));
		for (const signoff of signoffs) {
			const order = orders.find((o) => o.id === signoff.orderId)!;
			expect(signoff.signedAt).toEqual(order.completedAt);
			expect(signoff.signerName).toBe(
				customers.find((c) => c.id === order.customerId)!.contactName,
			);
			expect(signoff.engineerName).toBe(engineers.find((e) => e.id === order.engineerId)!.name);
			expect(signoff.signature).toMatch(/^data:image\/svg\+xml;base64,/);
		}
		// A person signs the same way each time, and differently from someone else.
		const byName = new Map<string, Set<string>>();
		for (const { signerName, signature, engineerName, engineerSignature } of signoffs) {
			byName.set(signerName, (byName.get(signerName) ?? new Set()).add(signature));
			byName.set(engineerName, (byName.get(engineerName) ?? new Set()).add(engineerSignature));
		}
		expect([...byName.values()].every((signatures) => signatures.size === 1)).toBe(true);
		expect(new Set([...byName.values()].map((s) => [...s][0])).size).toBe(byName.size);
		expect(shltrSignoffs(generate().data)).toEqual(signoffs);
	});
});

describe("SHLTR's demo data, whatever the day", () => {
	// A week (its weekend with the clocks going back), months' and a year's ends, a leap day.
	const days = [
		...Array.from({ length: 7 }, (_, i) => `2026-10-${19 + i}`),
		"2026-10-31",
		"2026-11-30",
		"2026-12-31",
		"2027-01-01",
		"2027-03-28",
		"2028-02-29",
	];

	/** SHLTR's demo data as the seed makes it on `day`, at 10:00. */
	async function generateOn(day: string) {
		const { year, month, day: date } = Temporal.PlainDate.from(day);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(year, month - 1, date, 10));
		vi.resetModules();
		try {
			const seed = await import("#lib/server/db/seed/shltr/index.ts");
			const faker = new Faker({ locale: [nl, en] });
			faker.seed(20261016);
			return seed.generateShltrTenant(faker).data;
		} finally {
			vi.useRealTimers();
		}
	}

	/**
	 * How many months an inspection of a unit of `category` stays valid, by the checklists seed's
	 * templates for SHLTR: the general one's six, the others' twelve.
	 */
	const validityOf = (category: string) =>
		["fire_door", "automatic_door", "aerial_platform", "other"].includes(category) ? 6 : 12;

	test.each(days)(
		"has a unit whose last inspection runs out within the month on %s",
		async (day) => {
			const { orders, equipments } = await generateOn(day);
			const today = Temporal.PlainDate.from(day);
			const doneOn = ({ completedAt }: (typeof orders)[number]) =>
				Temporal.PlainDate.from({
					year: completedAt!.getFullYear(),
					month: completedAt!.getMonth() + 1,
					day: completedAt!.getDate(),
				});
			// Each unit's last done inspection, and the day it runs out.
			const last = new Map<number, Temporal.PlainDate>();
			for (const o of orders) {
				if (o.type !== "inspection" || !["completed", "invoiced"].includes(o.status)) continue;
				for (const id of o.equipmentIds) {
					const before = last.get(id);
					if (!before || Temporal.PlainDate.compare(doneOn(o), before) > 0) last.set(id, doneOn(o));
				}
			}
			// The 30 days the checklists count as expiring.
			const expiring = [...last].filter(([id, done]) => {
				const ends = done.add({ months: validityOf(equipments[id - 1].category) });
				return (
					Temporal.PlainDate.compare(ends, today) >= 0 &&
					Temporal.PlainDate.compare(ends, today.add({ days: 30 })) <= 0
				);
			});
			expect(expiring.length).toBeGreaterThan(0);
		},
	);
});
