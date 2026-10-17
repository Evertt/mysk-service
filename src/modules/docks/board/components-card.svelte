<!--
	@component
	The Salvo Safety System's parts at a dock, as the mockup explains them: the Salvo Control Panel,
	the Key Storage unit and the beacon, and that the process stays as it is.
-->
<script lang="ts">
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
</script>

<Card.Root data-dock-components>
	<Card.Header>
		<Card.Title>{m.docks_components_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="rounded-md border bg-muted/40 p-4">
				<div
					class="grid h-10 w-8 place-items-center rounded-[3px] bg-slate-900 text-[8px] font-bold text-amber-300 italic"
					aria-hidden="true"
				>
					SCP
				</div>
				<h3 class="mt-2 text-sm font-semibold">{m.docks_component_scp_title()}</h3>
				<p class="mt-1 text-xs text-muted-foreground">{m.docks_component_scp()}</p>
			</div>
			<div class="rounded-md border bg-muted/40 p-4">
				<div class="grid h-10 w-8 place-items-center rounded-[3px] bg-slate-900" aria-hidden="true">
					<KeyRoundIcon class="size-4 text-amber-300" />
				</div>
				<h3 class="mt-2 text-sm font-semibold">{m.docks_component_storage_title()}</h3>
				<p class="mt-1 text-xs text-muted-foreground">{m.docks_component_storage()}</p>
			</div>
			<div class="rounded-md border bg-muted/40 p-4">
				<div class="grid h-10 w-8 place-items-center rounded-[3px] bg-slate-900" aria-hidden="true">
					<span class="size-4 rounded-full bg-amber-500"></span>
				</div>
				<h3 class="mt-2 text-sm font-semibold">{m.docks_component_beacon_title()}</h3>
				<p class="mt-1 text-xs text-muted-foreground">{m.docks_component_beacon()}</p>
			</div>
		</div>
		<p class="text-xs text-muted-foreground">{m.docks_components_note()}</p>
	</Card.Content>
</Card.Root>
