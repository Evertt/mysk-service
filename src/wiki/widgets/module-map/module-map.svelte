<!--
	@component
	The optional modules, each with its switch, as a tenant's are: switch one off and the modules
	that require it go off with it (`effectiveModules()`, the app's own rule), marked dropped. A
	drawing of what requires what above, each module's card below.
-->
<script lang="ts">
	import { formatNumber } from "#lib/i18n/format.ts";
	import { type ModuleId, moduleIds } from "#lib/modules/ids.ts";
	import { modules } from "#lib/modules/manifests.ts";

	import ModuleCard from "./module-card.svelte";
	import { moduleStates } from "./module-map.ts";
	import RequiresDiagram from "./requires-diagram.svelte";

	let switchedOn = $state<ModuleId[]>([...moduleIds]);

	const states = $derived(moduleStates(switchedOn));
	const on = $derived(Object.values(states).filter((state) => state === "on").length);

	const labelOf = (id: ModuleId) => modules.find((module) => module.id === id)?.label ?? id;

	function toggle(id: ModuleId, switched: boolean) {
		switchedOn = switched
			? moduleIds.filter((other) => other === id || switchedOn.includes(other))
			: switchedOn.filter((other) => other !== id);
	}
</script>

<figure class="not-prose @container my-6 rounded-xl border bg-card p-3 text-card-foreground sm:p-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-sm" aria-live="polite">
			<span class="font-medium"
				>{m.wiki_modules_of({ on: formatNumber(on), total: formatNumber(moduleIds.length) })}</span
			>
			<span class="text-muted-foreground">{m.wiki_modules_on()}</span>
		</p>
		<Button
			variant="outline"
			size="sm"
			disabled={switchedOn.length === moduleIds.length}
			onclick={() => (switchedOn = [...moduleIds])}
		>
			{m.wiki_modules_switch_all()}
		</Button>
	</div>

	<div class="my-4">
		<RequiresDiagram {states} {labelOf} />
		<ul
			aria-label={m.wiki_modules_key()}
			class="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
		>
			<li class="flex items-center gap-1.5">
				<span class="size-2.5 rounded-full border border-primary bg-primary/10"
				></span>{m.common_on()}
			</li>
			<li class="flex items-center gap-1.5">
				<span class="size-2.5 rounded-full border border-dashed border-muted-foreground bg-muted"
				></span>{m.common_off()}
			</li>
			<li class="flex items-center gap-1.5">
				<span class="size-2.5 rounded-full border border-dashed border-warning bg-warning/10"
				></span>{m.wiki_modules_dropped_key()}
			</li>
		</ul>
	</div>

	<div class="grid gap-2 @xl:grid-cols-2">
		{#each modules as module (module.id)}
			<ModuleCard
				{module}
				{states}
				{labelOf}
				state={states[module.id]}
				switchedOn={switchedOn.includes(module.id)}
				onswitch={(switched) => toggle(module.id, switched)}
			/>
		{/each}
	</div>
</figure>
