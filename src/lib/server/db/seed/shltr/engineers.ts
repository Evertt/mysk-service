import type { Faker } from "@faker-js/faker";

import type { EngineerSpecialty } from "#lib/models.ts";

import { addDays, now } from "../clock.ts";

/**
 * SHLTR's engineers: Lev first, the mockup's `monteur`, whom the demo engineer's account is linked
 * to (the organization's first engineer, see `linkDemoEngineer`); mechanics for the doors, docks
 * and stairs, controls engineers for the automatic and high-speed doors, an F-gas certified airco
 * engineer and an electrician for the Salvo docks and aerial platforms. The last has left.
 */
const team: [name: string, specialty: EngineerSpecialty, region: string][] = [
	["Lev Hoekstra", "mechanical", "Central"],
	["Bram Kok", "mechanical", "East"],
	["Tom Willems", "mechanical", "Central"],
	["Niels Bakker", "mechanical", "North"],
	["Daan Veenstra", "controls", "East"],
	["Ruben Smit", "controls", "Central"],
	["Kevin de Boer", "hvac", "North"],
	["Sander Brouwer", "electrical", "East"],
	["Jeroen Mulder", "mechanical", "Central"],
];

/** When the engineer who left last worked: the seed gives them no work after it. */
export const LEFT_DAYS_AGO = 120;

/** SHLTR's engineers, with ids from 1 (like `generateEngineers`). */
export function generateShltrEngineers(faker: Faker) {
	return team.map(([name, specialty, region], i) => {
		const [first, ...rest] = name.split(" ");
		return {
			id: i + 1,
			name,
			email: `${first.toLowerCase()}.${rest.join("").toLowerCase()}@shltr.example`,
			phone: `06 ${faker.string.numeric(8)}`,
			specialty,
			region,
			hourlyRate: faker.number.int({ min: 62, max: 89 }) * 100,
			active: i < team.length - 1,
			hiredAt: faker.date.between({ from: addDays(now, -10 * 365), to: addDays(now, -400) }),
		};
	});
}
