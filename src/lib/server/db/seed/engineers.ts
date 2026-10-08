import type { Faker } from "@faker-js/faker";

import { engineerSpecialties } from "#lib/models.ts";

import { addDays, now } from "./clock.ts";
import { mobile, slug } from "./places.ts";

const regions = ["North", "East", "South", "West", "Central"];

/** One tenant's engineers, with ids from 1. */
export function generateEngineers(faker: Faker, count: number) {
	const emails = new Set<string>();
	return Array.from({ length: count }, (_, i) => {
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		let email = `${slug(firstName)}.${slug(lastName)}@fieldworks.example`;
		for (let n = 2; emails.has(email); n++)
			email = `${slug(firstName)}.${slug(lastName)}${n}@fieldworks.example`;
		emails.add(email);
		return {
			id: i + 1,
			name: `${firstName} ${lastName}`,
			email,
			phone: mobile(faker, "Netherlands"),
			// Every specialty is covered at least three times.
			specialty: engineerSpecialties[i % engineerSpecialties.length],
			region: faker.helpers.arrayElement(regions),
			hourlyRate: faker.number.int({ min: 55, max: 110 }) * 100,
			// The last two have left.
			active: i < count - 2,
			hiredAt: faker.date.past({ years: 12, refDate: addDays(now, -30) }),
		};
	});
}
