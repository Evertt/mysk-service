<!--
	@component
	A module in the module map: its icon, name, id and what it does, its switch, its state
	(`data-state`: on, off, or dropped when a module it requires is off), and what it requires and
	adds to.
-->
<script lang="ts">
	import { moduleGraph } from "#lib/modules/ids.ts";
	import type { AppModule, ModuleId } from "#lib/modules/manifests.ts";
	import { cn } from "#lib/utils.ts";

	import type { ModuleState } from "./module-map.ts";

	let {
		module,
		state,
		states,
		switchedOn,
		onswitch,
		labelOf,
	}: {
		module: AppModule;
		state: ModuleState;
		states: Record<ModuleId, ModuleState>;
		switchedOn: boolean;
		onswitch: (on: boolean) => void;
		labelOf: (id: ModuleId) => string;
	} = $props();

	const id = $props.id();
	const node = $derived(moduleGraph[module.id]);
	const missing = $derived(node.requires.filter((required) => states[required] !== "on"));
	const names = (ids: readonly ModuleId[]) => ids.map(labelOf).join(", ");
</script>

<div
	data-module={module.id}
	data-state={state}
	class={cn(
		"flex gap-3 rounded-lg border p-3 motion-safe:transition-colors",
		state === "on" && "bg-background",
		state === "off" && "bg-muted/40",
		state === "dropped" && "border-warning/40 bg-warning/5",
	)}
>
	<div
		class={cn(
			"flex size-8 shrink-0 items-center justify-center rounded-md",
			state === "on" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
		)}
	>
		<module.icon class="size-4" />
	</div>
	<div class="min-w-0 flex-1">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<Label for={id} class="font-medium">{module.label}</Label>
				<p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
					<code class="font-mono">{module.id}</code>
					{#if state === "on"}
						<Badge variant="success">{m.common_on()}</Badge>
					{:else if state === "off"}
						<Badge variant="neutral">{m.common_off()}</Badge>
					{:else}
						<Badge variant="warning">{m.wiki_modules_needs({ names: names(missing) })}</Badge>
					{/if}
				</p>
			</div>
			<Switch
				{id}
				checked={switchedOn || node.alwaysOn}
				disabled={node.alwaysOn}
				onCheckedChange={onswitch}
				class="mt-0.5"
			/>
		</div>
		<p class="mt-1.5 text-sm text-muted-foreground">{module.description}</p>
		{#if node.requires.length || node.enhances.length}
			<dl class="mt-2 grid gap-0.5 text-xs">
				{#if node.requires.length}
					<div class="flex gap-1.5">
						<dt class="text-muted-foreground">{m.wiki_modules_requires()}</dt>
						<dd class="font-medium">{names(node.requires)}</dd>
					</div>
				{/if}
				{#if node.enhances.length}
					<div class="flex gap-1.5">
						<dt class="text-muted-foreground">{m.wiki_modules_adds_to()}</dt>
						<dd>{names(node.enhances)}</dd>
					</div>
				{/if}
			</dl>
		{/if}
	</div>
</div>
