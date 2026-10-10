import { GENERATED, type ModuleFolder } from "./shared.ts";

const camel = (id: string) => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

const registryHeader = (what: string) => `// ${GENERATED} from ${what}. Don't edit.\n`;

/** The generated registries, by path relative to the project root. */
export function renderRegistries(modules: ModuleFolder[]): Record<string, string> {
	const withServer = modules.filter((module) => module.server.index);
	const withSchema = modules.filter((module) => module.server.schema);
	const withSeed = modules.filter((module) => module.server.seed);
	const list = (names: string[]) => `[${names.join(", ")}]`;

	return {
		"src/lib/modules/ids.gen.ts": [
			registryHeader("src/modules/*/module.ts"),
			`/** The ids of the modules in \`src/modules\`, in dependency order, for code that can't import their manifests. */`,
			`export const generatedModuleIds = ${list(modules.map((m) => JSON.stringify(m.id)))} as const;`,
			"",
			`/** What each module's \`module.ts\` says about the others: \`requires\`, \`enhances\`, \`alwaysOn\` and \`nav.after\`. */`,
			`export const generatedModuleGraph: Record<`,
			`\t(typeof generatedModuleIds)[number],`,
			`\t{ requires: readonly string[]; enhances: readonly string[]; alwaysOn: boolean; navAfter: string | null }`,
			`> = ${
				modules.length
					? `{\n${modules
							.map(
								(m) =>
									`\t${JSON.stringify(m.id)}: { requires: ${list(m.requires.map((id) => JSON.stringify(id)))}, enhances: ${list(m.enhances.map((id) => JSON.stringify(id)))}, alwaysOn: ${m.alwaysOn}, navAfter: ${JSON.stringify(m.navAfter)} },`,
							)
							.join("\n")}\n} as const`
					: "{}"
			};`,
			"",
		].join("\n"),

		"src/lib/modules/manifests.gen.ts": [
			registryHeader("src/modules/*/module.ts"),
			...modules.map((m) => `import ${camel(m.id)}Module from "#modules/${m.id}/module.ts";`),
			...(modules.length ? [""] : []),
			`export const manifests = ${list(modules.map((m) => `${camel(m.id)}Module`))} as const;`,
			"",
		].join("\n"),

		"src/lib/server/modules/hooks.gen.ts": [
			registryHeader("src/modules/*/server/index.ts"),
			...withServer.map(
				(m) => `import ${camel(m.id)}Server from "#modules/${m.id}/server/index.ts";`,
			),
			...(withServer.length ? [""] : []),
			`/**`,
			` * A function, not a constant: the modules import \`defineServerModule()\` from`,
			` * \`#lib/server/extensions.ts\`, which imports this, so one of them is always evaluated first.`,
			` */`,
			`export function generatedServerModules() {`,
			`\treturn ${list(withServer.map((m) => `${camel(m.id)}Server`))} as const;`,
			`}`,
			"",
		].join("\n"),

		"src/lib/server/db/modules.gen.ts": [
			registryHeader("src/modules/*/server/schema.ts"),
			...(withSchema.length
				? withSchema.map((m) => `export * from "#modules/${m.id}/server/schema.ts";`)
				: ["export {};"]),
			"",
		].join("\n"),

		"src/lib/server/db/module-schemas.gen.ts": [
			registryHeader("src/modules/*/server/schema.ts"),
			...withSchema.map(
				(m) => `import * as ${camel(m.id)}Schema from "#modules/${m.id}/server/schema.ts";`,
			),
			...(withSchema.length ? [""] : []),
			`/** Each module's tables by module id, for the check that they reference only what they may. */`,
			`export const moduleSchemas = ${
				withSchema.length
					? `{\n${withSchema.map((m) => `\t${JSON.stringify(m.id)}: ${camel(m.id)}Schema,`).join("\n")}\n}`
					: "{}"
			};`,
			"",
		].join("\n"),

		"src/lib/server/db/module-seeds.gen.ts": [
			registryHeader("src/modules/*/server/seed.ts"),
			`import type { ModuleSeed } from "./seed/module-seed.ts";`,
			...withSeed.map((m) => `import ${camel(m.id)}Seed from "#modules/${m.id}/server/seed.ts";`),
			"",
			`export const moduleSeeds: { id: string; seed: ModuleSeed }[] = ${
				withSeed.length
					? `[\n${withSeed.map((m) => `\t{ id: ${JSON.stringify(m.id)}, seed: ${camel(m.id)}Seed },`).join("\n")}\n]`
					: "[]"
			};`,
			"",
		].join("\n"),
	};
}
