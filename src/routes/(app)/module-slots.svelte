<!--
	@component
	What the current tenant's modules add to a core page at `name` (see `slots` in
	`#lib/modules.ts`), with `props` passed on. Wrapped in a `div` with `class` (by default
	`contents`, so the components lay out as the page's own), or nothing if no module adds anything.
-->
<script lang="ts" generics="Name extends SlotName">
	import { type SlotName, type SlotProps, slotLoaders } from "#lib/modules.ts";

	import { getCurrentTenant } from "./session.remote.ts";

	let {
		name,
		props,
		class: className = "contents",
	}: { name: Name; props: SlotProps[Name]; class?: string } = $props();

	const tenant = $derived(await getCurrentTenant());
	const components = $derived(
		await Promise.all(
			slotLoaders(name, tenant.modules).map(async (load) => (await load()).default),
		),
	);
</script>

{#if components.length}
	<div class={className}>
		{#each components as Slot, i (i)}
			<Slot {...props} />
		{/each}
	</div>
{/if}
