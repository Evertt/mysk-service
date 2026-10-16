import { en, Faker, nl } from "@faker-js/faker";
import { describe, expect, test } from "vite-plus/test";

import { shltrCategories, specialtyOf } from "#lib/server/db/seed/categories.ts";
import { now } from "#lib/server/db/seed/clock.ts";
import { generateShltrTenant } from "#lib/server/db/seed/shltr/index.ts";

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
			expect(orders.filter((o) => o.equipmentId === unit.id && isOpen(o.status)).length, name).toBe(
				open,
			);
		}
		expect(riedel.find((u) => u.name?.endsWith("TDTE-01"))!.status).toBe("out_of_service");
		expect(riedel.find((u) => u.name === "Sectionaaldeur laaddok 07")!.status).toBe("operational");
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
			const unit = o.equipmentId ? units.get(o.equipmentId)! : undefined;
			if (unit) expect(unit.customerId).toBe(o.customerId);
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
		expect(fitting / orders.filter((o) => o.equipmentId && o.engineerId).length).toBeGreaterThan(
			0.9,
		);
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
});
