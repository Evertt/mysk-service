/**
 * The sign-offs of SHLTR's done work: every completed (or since invoiced) order with an engineer
 * has the work order signed by the engineer and the customer's contact when it was finished, so
 * the office's work report and the customer portal's signed work order show in the demo.
 *
 * Made without the seed's `faker`, so the rest of the demo data stays as it was: each signature is
 * a scribble drawn from its signer's name, the same each time (as a person's signature is).
 */

/** An order's sign-off, its id as generated (from 1). */
interface SeedSignoff {
	orderId: number;
	signerName: string;
	signature: string;
	engineerName: string;
	engineerSignature: string;
	signedAt: Date;
}

/** A small, fast generator of numbers in [0, 1) from a seed (mulberry32). */
function numbers(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A string's hash (FNV-1a), as a seed. */
function hash(text: string) {
	let h = 0x811c9dc5;
	for (const char of text) h = Math.imul(h ^ char.codePointAt(0)!, 0x01000193);
	return h >>> 0;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A handwritten-looking signature for `name`: a looping stroke across the pad, a loop or a peak
 * per letter of the first word's initial and the last name, and a stroke under it, as an SVG data
 * URL (the pad's are PNGs; an image either way).
 */
function signatureOf(name: string) {
	const next = numbers(hash(name));
	const letters = Math.min(9, Math.max(4, name.replace(/[^\p{L}]/gu, "").length - 2));
	const step = 220 / letters;
	let x = 30;
	let path = `M${x} ${round(70 + next() * 10)}`;
	for (let i = 0; i < letters; i++) {
		const top = 15 + next() * 30;
		const bottom = 60 + next() * 20;
		const loop = next() < 0.5;
		const nextX = x + step * (0.8 + next() * 0.4);
		// Up to the letter's top and down again; a loop leans back on its way up.
		path +=
			` C${round(x + (loop ? -step * 0.4 : step * 0.2))} ${round(top)}` +
			` ${round(x + step * 0.6)} ${round(top - 5)}` +
			` ${round(x + step * 0.5)} ${round((top + bottom) / 2)}` +
			` S${round(nextX - step * 0.2)} ${round(bottom + 5)} ${round(nextX)} ${round(bottom - 10 * next())}`;
		x = nextX;
	}
	const flourish = `M${round(25 + next() * 15)} ${round(88 + next() * 4)} Q150 ${round(80 + next() * 10)} ${round(x + 10)} ${round(84 + next() * 6)}`;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="300" height="100">` +
		`<g fill="none" stroke="#1e293b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
		`<path d="${path}"/><path d="${flourish}" stroke-width="1.6"/></g></svg>`;
	return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * The sign-offs of `orders` that are done and had an engineer: signed by the engineer and the
 * customer's contact at the moment the order was completed.
 */
export function generateShltrSignoffs(
	orders: {
		id: number;
		customerId: number;
		engineerId: number | null;
		status: string;
		completedAt: Date | null;
	}[],
	customers: { id: number; contactName: string }[],
	engineers: { id: number; name: string }[],
): SeedSignoff[] {
	const contactOf = new Map(customers.map((customer) => [customer.id, customer.contactName]));
	const engineerOf = new Map(engineers.map((engineer) => [engineer.id, engineer.name]));
	const signatures = new Map<string, string>();
	const signed = (name: string) => {
		if (!signatures.has(name)) signatures.set(name, signatureOf(name));
		return signatures.get(name)!;
	};
	return orders.flatMap((order) => {
		const engineerName = order.engineerId && engineerOf.get(order.engineerId);
		const signerName = contactOf.get(order.customerId);
		const done = order.status === "completed" || order.status === "invoiced";
		if (!done || !order.completedAt || !engineerName || !signerName) return [];
		return [
			{
				orderId: order.id,
				signerName,
				signature: signed(signerName),
				engineerName,
				engineerSignature: signed(engineerName),
				signedAt: order.completedAt,
			},
		];
	});
}
