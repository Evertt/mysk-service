import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import DockDrawing from "#modules/docks/board/dock-drawing.svelte";

const truck = { carrier: "AMEX Transport", plate: "84-BNX-7" };

/** The drawing's parts that show its state. */
function parts(container: HTMLElement) {
	const svg = container.querySelector("svg")!;
	return {
		svg,
		door: svg.querySelector<SVGGElement>(".door")!,
		truck: svg.querySelector<SVGGElement>(".truck")!,
		lit: [...svg.querySelectorAll('[data-lamp][data-on="true"]')].map((lamp) =>
			lamp.getAttribute("data-lamp"),
		),
		text: svg.textContent ?? "",
		blinking: svg.querySelector(".blink"),
	};
}

describe("the dock drawing", () => {
	test("a loading dock: door up, green lamp, the truck at the door with its plate, Wheel-Lok on", async () => {
		const { container } = await render(DockDrawing, {
			label: "DOCK 05: Loading, door open",
			doorOpen: true,
			locked: true,
			beacon: "green",
			truck,
		});
		const drawing = parts(container);
		expect(drawing.svg.getAttribute("aria-label")).toBe("DOCK 05: Loading, door open");
		expect(drawing.svg.dataset).toMatchObject({ door: "open", truck: "in", wheelLok: "on" });
		expect(drawing.door.style.transform).toBe("translateY(-78px)");
		expect(drawing.truck.style.transform).toBe("translateX(0px)");
		expect(drawing.lit).toEqual(["green"]);
		expect(drawing.text).toContain("AMEX");
		expect(drawing.text).toContain("84-BNX-7");
		expect(drawing.text).toContain("SALVO");
		expect(drawing.blinking).not.toBeNull();
	});

	test("a free dock: door down, no lamp lit, no truck", async () => {
		const { container } = await render(DockDrawing, {
			label: "DOCK 07: Free, door closed",
			doorOpen: false,
			locked: false,
			beacon: "off",
			truck: null,
		});
		const drawing = parts(container);
		expect(drawing.door.style.transform).toBe("translateY(0px)");
		expect(drawing.truck.style.transform).toBe("translateX(420px)");
		expect(drawing.lit).toEqual([]);
		expect(drawing.text).not.toContain("AMEX");
		expect(drawing.blinking).toBeNull();
	});

	test("the beacon lights the lamp of the state: red for a fault, orange while unlocked", async () => {
		const fault = await render(DockDrawing, {
			label: "DOCK 08",
			doorOpen: true,
			locked: false,
			beacon: "red",
			truck,
		});
		expect(parts(fault.container).lit).toEqual(["red"]);
		expect(parts(fault.container).blinking).toBeNull();
		await fault.rerender({ beacon: "orange" });
		expect(parts(fault.container).lit).toEqual(["orange"]);
	});

	test("the truck that checks out drives away still showing its plate", async () => {
		const { container, rerender } = await render(DockDrawing, {
			label: "DOCK 06",
			doorOpen: false,
			locked: false,
			beacon: "orange",
			truck,
		});
		await rerender({ truck: null, beacon: "off" });
		const drawing = parts(container);
		expect(drawing.svg.dataset.truck).toBe("away");
		expect(drawing.truck.style.transform).toBe("translateX(420px)");
		expect(drawing.text).toContain("84-BNX-7");
	});
});
