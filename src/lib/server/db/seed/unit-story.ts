/**
 * The day of one unit the demo's timeline tells (the client's slide, "Wat gebeurt er met deze
 * deur?"): SHLTR's Sectionaaldeur D-07 at Riedel ("Sectionaaldeur laaddok 07"). At 08:12 it stands
 * open for 14 minutes (the energy module's seed, which reads `storyMoment()`); at 10:40 Riedel's
 * contact reports a fault through the QR code on it; at 11:05 a planner accepts it and plans an
 * engineer; the engineer sets out, starts and at 14:30 completes it, with two photos. The day is
 * today once 14:30 is past, else yesterday, so the whole story has happened whenever the seed runs.
 * Made after everything else (with the demo users, whom it names), so the rest of the demo data
 * stays as it was.
 */
import { crc32, deflateSync } from "node:zlib";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { formatCode, sequenceStart } from "#lib/numbering.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { photoPrefix } from "#lib/server/files/keys.ts";

import * as schema from "../schema.ts";
import { now } from "./clock.ts";
import { toMoment } from "./temporal.ts";

const { activity, engineer, equipment, order, orderPhoto, orderRequest, orderUnit } = schema;

/** The unit, by its name at Riedel. */
export const STORY_UNIT = "Sectionaaldeur laaddok 07";

/** When the story's last step is, `HH:MM` on its day. */
const LAST_STEP = "14:30";

/** The story's day: today once its last step is past, else yesterday (in the seed's time zone). */
function storyDay(at: Temporal.Instant = toMoment(now)) {
	const local = at.toZonedDateTimeISO(Temporal.Now.timeZoneId());
	const last = Temporal.PlainTime.from(LAST_STEP);
	const today = local.toPlainDate();
	return Temporal.PlainTime.compare(local.toPlainTime(), last) > 0
		? today
		: today.subtract({ days: 1 });
}

/** `HH:MM` on the story's day, as a moment. */
export const storyMoment = (time: string, day = storyDay()) =>
	day
		.toZonedDateTime({
			timeZone: Temporal.Now.timeZoneId(),
			plainTime: Temporal.PlainTime.from(time),
		})
		.toInstant();

/** A small PNG of one colour, `width` × `height`: a stand-in for a photo the engineer took. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]) {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const check = Buffer.alloc(4);
		check.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, check]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill([r, g, b]).flat())]);
	const pixels = Buffer.concat(Array.from({ length: height }, () => row));
	return new Uint8Array(
		Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			chunk("IHDR", header),
			chunk("IDAT", deflateSync(pixels)),
			chunk("IEND", Buffer.alloc(0)),
		]),
	);
}

/** A demo user's id and name, by email. */
async function userBy(tx: Transaction, email: string) {
	const [found] = await tx
		.select({ id: schema.user.id, name: schema.user.name })
		.from(schema.user)
		.where(eq(schema.user.email, email));
	return found;
}

/**
 * Enters the story's order and its log, in `organizationId` (SHLTR's), and answers the photos'
 * files to store once the seed has committed. Nothing when the tenant hasn't the unit.
 */
export async function seedUnitStory(tx: Transaction, organizationId: string) {
	const [unit] = await tx
		.select({ id: equipment.id, customerId: equipment.customerId, serial: equipment.serialNumber })
		.from(equipment)
		.where(and(eq(equipment.organizationId, organizationId), eq(equipment.name, STORY_UNIT)));
	const [contact, planner] = await Promise.all([
		userBy(tx, "facilitair@riedel.example"),
		userBy(tx, "jan@shltr.example"),
	]);
	// An engineer of the office's, not the demo engineer (whose portal keeps its own work).
	const [fitter] = await tx
		.select({ id: engineer.id, name: engineer.name })
		.from(engineer)
		.where(
			and(
				eq(engineer.organizationId, organizationId),
				eq(engineer.active, true),
				isNull(engineer.userId),
			),
		)
		.orderBy(asc(engineer.id))
		.limit(1);
	if (!unit || !contact || !planner || !fitter) return [];

	const at = (time: string) => storyMoment(time);
	const start = sequenceStart("order");
	const [{ last }] = await tx
		.select({
			last: sql<number>`coalesce(max(cast(substr(${order.number}, ${start}) as integer)), 0)`,
		})
		.from(order)
		.where(eq(order.organizationId, organizationId));
	const number = formatCode("order", Number(last) + 1);
	const scheduledFor = at("13:30");
	const [created] = await tx
		.insert(order)
		.values({
			organizationId,
			number,
			customerId: unit.customerId,
			engineerId: fitter.id,
			type: "breakdown",
			status: "completed",
			priority: "high",
			description:
				"Deur blijft na het sluiten een stukje openstaan, de onderrubber sluit niet aan.",
			scheduledFor,
			completedAt: at(LAST_STEP),
			laborHours: 1,
			createdAt: at("10:40"),
		})
		.returning({ id: order.id });
	await tx.insert(orderUnit).values({
		organizationId,
		orderId: created.id,
		customerId: unit.customerId,
		equipmentId: unit.id,
		position: 0,
	});
	await tx.insert(orderRequest).values({
		orderId: created.id,
		organizationId,
		userId: contact.id,
		reporterName: contact.name,
		reporterLocale: "nl",
		decidedAt: at("11:05"),
		decidedBy: planner.id,
		fault: "door_wont_close",
		via: "qr",
	});

	const files: { objectKey: string; bytes: Uint8Array }[] = [];
	const taken = [
		{ colour: [64, 92, 120] as [number, number, number], time: "14:26" },
		{ colour: [150, 128, 96] as [number, number, number], time: "14:28" },
	];
	const photos = taken.map(({ colour, time }, position) => {
		const bytes = solidPng(160, 120, colour);
		const objectKey = `${photoPrefix(organizationId)}seed-story-${position + 1}.png`;
		files.push({ objectKey, bytes });
		return {
			organizationId,
			orderId: created.id,
			position,
			objectKey,
			contentType: "image/png",
			size: bytes.byteLength,
			createdAt: at(time),
		};
	});
	const added = await tx.insert(orderPhoto).values(photos).returning({ id: orderPhoto.id });

	const subject = { subjectType: "order", subjectId: String(created.id), subjectLabel: number };
	const byFitter = { organizationId, userName: fitter.name };
	await tx.insert(activity).values([
		{
			organizationId,
			userId: contact.id,
			userName: contact.name,
			action: "created",
			...subject,
			createdAt: at("10:40"),
		},
		{
			organizationId,
			userId: planner.id,
			userName: planner.name,
			action: "accepted",
			...subject,
			changes: { status: ["awaiting_acceptance", "quote"] },
			createdAt: at("11:05"),
		},
		{
			organizationId,
			userId: planner.id,
			userName: planner.name,
			action: "scheduled",
			...subject,
			changes: {
				status: ["quote", "scheduled"],
				engineerId: [null, fitter.id],
				scheduledFor: [null, scheduledFor.toString()],
			},
			createdAt: at("11:05"),
		},
		{
			...byFitter,
			action: "departed",
			...subject,
			changes: { status: ["scheduled", "on_the_way"] },
			createdAt: at("13:10"),
		},
		{
			...byFitter,
			action: "work_started",
			...subject,
			changes: { status: ["on_the_way", "in_progress"] },
			createdAt: at("13:35"),
		},
		...added.map((photo, position) => ({
			...byFitter,
			action: "created" as const,
			subjectType: "order_photo",
			subjectId: String(photo.id),
			subjectLabel: `#${position + 1}`,
			parentType: "order",
			parentId: String(created.id),
			parentLabel: number,
			createdAt: photos[position].createdAt,
		})),
		{
			...byFitter,
			action: "completed",
			...subject,
			changes: { status: ["in_progress", "completed"] },
			createdAt: at(LAST_STEP),
		},
	]);
	return files;
}
