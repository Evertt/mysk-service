import { expect, test } from "vite-plus/test";

import { customerSubject, equipmentSubject, orderSubject } from "#lib/activity/page-subjects.ts";
import { coreSubjectTypes } from "#lib/activity/subjects.ts";

test("links the subjects of orders, customers and units, as their builders make them, to their pages", () => {
	const linked = (subject: {
		type: "order" | "customer" | "equipment";
		id: number;
		label: string;
	}) => coreSubjectTypes[subject.type].href?.({ id: String(subject.id), label: subject.label });
	expect(linked(orderSubject({ id: 1, number: "ORD-2026-00001" }))).toBe("/orders/ORD-2026-00001");
	expect(linked(customerSubject({ id: 2, code: "C-0042" }))).toBe("/customers/C-0042");
	expect(linked(equipmentSubject({ id: 3, serialNumber: "SN-12" }))).toBe("/equipment/SN-12");
});
