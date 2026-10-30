/** What `/wiki/[...slug]` loads: a page of the registry with its component, or a 404. */
import { describe, expect, test } from "vite-plus/test";

import { load as loadIndex } from "#routes/(wiki)/wiki/+page.ts";
import { load } from "#routes/(wiki)/wiki/[...slug]/+page.ts";

const loadSlug = (slug: string) => load({ params: { slug } } as Parameters<typeof load>[0]);

describe("/wiki/[...slug]", () => {
	test("loads a known slug", async () => {
		const loaded = await loadSlug("start/what-fieldworks-is");
		expect(loaded.page.title).toBe("What Fieldworks is");
		expect(loaded.component).toBeTypeOf("function");
	});

	test("404s an unknown slug", async () => {
		await expect(loadSlug("nope")).rejects.toMatchObject({ status: 404 });
	});
});

describe("/wiki", () => {
	test("redirects to the first page", () => {
		expect(() => loadIndex({} as Parameters<typeof loadIndex>[0])).toThrow(
			expect.objectContaining({ status: 307, location: "/wiki/start/what-fieldworks-is" }),
		);
	});
});
