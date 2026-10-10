// TEMPORARY reproduction, not to be committed: server-renders App.svelte with a failing
// boundary, then hydrates it in Chromium and prints what the browser logs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";
import { compile } from "svelte/compiler";
import { build } from "vite";

const dir = import.meta.dirname;
const out = join(dir, "out");
mkdirSync(out, { recursive: true });
const names = ["App", "Loader", "Child", "Thrower", "Wrap"];
for (const generate of ["server", "client"]) {
	for (const name of names) {
		const file = name === "App" && process.env.APP ? process.env.APP : `${name}.svelte`;
		const source = readFileSync(join(dir, file), "utf8");
		const { js } = compile(source, {
			generate,
			runes: true,
			dev: generate === "client" && process.env.DEV === "1",
			experimental: { async: true },
		});
		writeFileSync(
			join(out, `${name}.${generate}.js`),
			js.code.replace(/\.\/(\w+)\.svelte/g, `./$1.${generate}.js`),
		);
	}
}

const items = (process.env.ITEMS ?? "ok,bad,ok2").split(",");
const { render } = await import("svelte/server");
const { default: App } = await import(join(out, "App.server.js"));
const rendered = await render(App, {
	props: { items },
	transformError: (e) => ({ message: String(e?.message ?? e) }),
});
console.log("SSR body:\n", rendered.body);

writeFileSync(
	join(out, "entry.js"),
	`import { hydrate } from "svelte";
import App from "./App.client.js";
hydrate(App, {
	target: document.getElementById("app"),
	props: { items: ${JSON.stringify(items)} },
	transformError: async (e) => ({ message: String(e?.message ?? e) }),
});
setTimeout(() => console.log("DOM after:", document.getElementById("app").innerHTML), 500);`,
);
await build({
	configFile: false,
	logLevel: "warn",
	root: out,
	define: {
		"process.env.NODE_ENV": JSON.stringify(process.env.DEV === "1" ? "development" : "production"),
	},
	resolve: { conditions: process.env.DEV === "1" ? ["development", "browser"] : ["browser"] },
	build: {
		outDir: join(out, "dist"),
		minify: false,
		lib: { entry: join(out, "entry.js"), formats: ["es"], fileName: () => "bundle.js" },
	},
});
const bundle = readFileSync(join(out, "dist", "bundle.js"), "utf8");
const html = `<!doctype html><html><head>${rendered.head}</head><body><div id="app">${rendered.body}</div><script type="module">${bundle}</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log(`[${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.setContent(html);
await page.waitForTimeout(1000);
await browser.close();
