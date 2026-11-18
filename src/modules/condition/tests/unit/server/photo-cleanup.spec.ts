/**
 * The defect photos' files never outlive their rows for long: deleting a unit deletes its photos'
 * files once its transaction has committed (core's `equipment.removing`, also with the module
 * off, whose rows go just the same); removing a component deletes those of the defects that went
 * with it, and keeps those another defect still points to; and the daily sweep deletes the files
 * under `<tenant>/conditions/` that no photo points to and are older than a day, of its own tenant
 * only, also with the module off, and leaves the orders' photos alone.
 */
import { existsSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, test, vi } from "vite-plus/test";

import { deleteEquipment } from "#lib/equipment/equipment.remote.ts";
import { photoKey } from "#lib/server/files/keys.ts";
import { folderStore } from "#lib/server/files/store.ts";
import { runDaily } from "#lib/server/jobs/daily.ts";
import { removeComponent, saveComponent } from "#modules/condition/components.remote.ts";
import { recordCondition } from "#modules/condition/condition.remote.ts";
import { conditionPhotoPrefix, sweepConditionPhotos } from "#modules/condition/server/photos.ts";
import {
	as,
	asSystem,
	organizationId,
	rows,
	shltr,
	signedOut,
	submit,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const settings = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return { photosFolder: fs.mkdtempSync(path.join(os.tmpdir(), "condition-photo-cleanup-")) };
});
vi.mock("#lib/server/files/settings.ts", () => ({ fileSettings: settings }));

afterAll(async () => {
	const { rmSync } = await import("node:fs");
	rmSync(settings.photosFolder, { recursive: true, force: true });
});

const [shltrId, northId] = [organizationId("shltr"), organizationId("north")];

const jpeg = (name = "veer.jpg") =>
	new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array<number>(16).fill(7)])], name, {
		type: "image/jpeg",
	});

const stored = (key: string) => existsSync(join(settings.photosFolder, key));

/** Makes the stored file `key` `hours` old. */
const age = (key: string, hours: number) => {
	const at = new Date(Date.now() - hours * 3600_000);
	utimesSync(join(settings.photosFolder, key), at, at);
};

/** A unit of SHLTR's that no order refers to, so it may be deleted; each call another. */
const taken: number[] = [];
async function spareUnit() {
	const [unit] = await rows<{ id: number; serial_number: string }>(
		`select id, serial_number from equipment e where organization_id = ?
		 and not exists (select 1 from order_unit u where u.equipment_id = e.id)
		 and id not in (select value from json_each(?))
		 order by id limit 1`,
		[shltrId, JSON.stringify(taken)],
	);
	taken.push(unit.id);
	return unit;
}

/** The stored keys of the photos of the defects `where` picks (on `p`, the photo). */
const photoKeys = async (where: string, values: unknown[]) =>
	(
		await rows<{ object_key: string }>(
			`select distinct object_key from condition_defect_photo p where ${where}`,
			values,
		)
	).map((row) => row.object_key);

/** Records a condition of `unit` in SHLTR's office with `defects`, each `[component id, photos]`. */
async function recordWith(unit: { serial_number: string }, defects: [string, File[]][]) {
	const answer = await as(shltr.member, () =>
		submit(recordCondition, {
			serialNumber: unit.serial_number,
			componentId: "",
			defects: defects.map(([componentId, photos], i) => ({
				componentId,
				description: `Gebrek ${i + 1}`,
				severity: "serious",
				extent: "10",
				intensity: "advanced",
				photos,
			})),
			advice: "",
		}),
	);
	expect(answer).toMatchObject({ status: 200 });
}

describe("deleting a unit", () => {
	test.each([
		["with the module on", (work: () => Promise<unknown>) => work()],
		[
			"with the module off",
			(work: () => Promise<unknown>) => withoutModule("shltr", "condition", work),
		],
	])("deletes its defect photos' files, %s", async (_, around) => {
		const unit = await spareUnit();
		await recordWith(unit, [["", [jpeg(), jpeg("tweede.jpg")]]]);
		const keys = await photoKeys("p.equipment_id = ?", [unit.id]);
		expect(keys).toHaveLength(2);
		for (const key of keys) expect(stored(key)).toBe(true);

		await around(async () => {
			const answer = await as(shltr.member, () => submit(deleteEquipment, { id: String(unit.id) }));
			expect(answer).toMatchObject({ status: 303 });
		});
		expect(
			await value(`select count(*) from condition_defect_photo where equipment_id = ?`, [unit.id]),
		).toBe(0);
		for (const key of keys) expect(stored(key)).toBe(false);
	});
});

describe("removing a component", () => {
	test("deletes the files of its defects' photos, and keeps the unit's own", async () => {
		const unit = await spareUnit();
		const added = await as(shltr.member, () =>
			submit(saveComponent, {
				serialNumber: unit.serial_number,
				id: "",
				name: "Veerpakket",
				materialId: "",
				checkpointIds: [],
			}),
		);
		expect(added).toMatchObject({ status: 200 });
		const componentId = await value<number>(
			`select id from component where equipment_id = ? order by id desc limit 1`,
			[unit.id],
		);
		await recordWith(unit, [
			[String(componentId), [jpeg("veer.jpg")]],
			["", [jpeg("paneel.jpg")]],
		]);
		const onComponent = await photoKeys(
			"p.defect_id in (select id from condition_defect where component_id = ?)",
			[componentId],
		);
		const onUnit = await photoKeys(
			"p.equipment_id = ? and p.defect_id in (select id from condition_defect where component_id is null)",
			[unit.id],
		);
		expect(onComponent).toHaveLength(1);
		expect(onUnit).toHaveLength(1);

		const answer = await as(shltr.member, () =>
			submit(removeComponent, { id: String(componentId) }),
		);
		expect(answer.status).toBe(200);
		expect(stored(onComponent[0])).toBe(false);
		expect(stored(onUnit[0])).toBe(true);
		expect(await photoKeys("p.equipment_id = ?", [unit.id])).toEqual(onUnit);
	});
});

describe("the sweep", () => {
	test("deletes the tenant's day-old defect photo files no row points to, not the orders'", async () => {
		const store = folderStore(settings.photosFolder);
		const unit = await spareUnit();
		await recordWith(unit, [["", [jpeg()]]]);
		const [kept] = await photoKeys("p.equipment_id = ?", [unit.id]);
		const orphan = `${conditionPhotoPrefix(shltrId)}${crypto.randomUUID()}.jpg`;
		const young = `${conditionPhotoPrefix(shltrId)}${crypto.randomUUID()}.jpg`;
		const northOrphan = `${conditionPhotoPrefix(northId)}${crypto.randomUUID()}.jpg`;
		const orderPhoto = photoKey(shltrId, "jpg");
		for (const key of [orphan, young, northOrphan, orderPhoto]) {
			await store.put(key, new Uint8Array([1]), "image/jpeg");
		}
		for (const [key, hours] of [
			[kept, 48],
			[orphan, 25],
			[young, 23],
			[northOrphan, 48],
			[orderPhoto, 48],
		] as const) {
			age(key, hours);
		}

		const now = Temporal.Now.instant();
		expect(await asSystem("shltr", () => sweepConditionPhotos({ now }))).toEqual({
			"condition.photos_swept": 1,
		});
		expect(stored(orphan)).toBe(false);
		// Pointed to, too young (a form may still be recording it), another tenant's, an order's.
		for (const key of [kept, young, northOrphan, orderPhoto]) expect(stored(key)).toBe(true);
		// Nothing left to do.
		expect(await asSystem("shltr", () => sweepConditionPhotos({ now }))).toEqual({});
	});

	test("the daily run sweeps them, also with the module off, and says how many", async () => {
		const store = folderStore(settings.photosFolder);
		const orphan = `${conditionPhotoPrefix(shltrId)}${crypto.randomUUID()}.jpg`;
		await store.put(orphan, new Uint8Array([1]), "image/jpeg");
		age(orphan, 30);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const results = await withoutModule("shltr", "condition", () => signedOut(() => runDaily()));
		error.mockRestore();
		const shltrRun = results.find((result) => result.organization.id === shltrId);
		expect(shltrRun?.report).toMatchObject({ "condition.photos_swept": 1 });
		expect(stored(orphan)).toBe(false);
	});
});
