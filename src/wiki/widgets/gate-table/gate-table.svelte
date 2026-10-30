<!--
	@component
	The gated sets of remote functions (`gates`) and whom each admits. Pick who is calling (an owner,
	a planner, a field engineer, a customer's contact, someone signed in without an organization or
	not signed in) and every gate shows whether it lets the call through or refuses it, and with
	which status (`outcome()`).
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import XIcon from "@lucide/svelte/icons/x";

	import FilterChips from "#lib/components/filter-chips.svelte";
	import { cn } from "#lib/utils.ts";

	import { type CallerId, callers, gates, outcome } from "./gates.ts";

	let caller = $state<CallerId>("planner");
	const label = $derived(callers.find((candidate) => candidate.id === caller)?.label ?? "");
</script>

<figure class="not-prose @container my-6 rounded-xl border bg-card p-3 text-card-foreground sm:p-4">
	<div class="grid gap-1.5">
		<span class="text-xs font-medium text-muted-foreground">Who is calling</span>
		<FilterChips
			label="Who is calling"
			options={callers.map(({ id, label: text }) => ({ value: id, label: text }))}
			value={caller}
			onchange={(chosen) => {
				const picked = callers.find((candidate) => candidate.id === chosen);
				if (picked) caller = picked.id;
			}}
		/>
	</div>

	<ul
		class="mt-4 divide-y rounded-lg border"
		aria-label="The gates, and what each does with a call by: {label}"
	>
		{#each gates as gate (gate.name)}
			{@const result = outcome(gate.name, caller)}
			<li
				data-gate={gate.name}
				data-admitted={result.admitted}
				class={cn(
					"grid gap-x-4 gap-y-1 p-3 @xl:grid-cols-[11rem_minmax(0,1fr)_7rem] @xl:items-center",
					result.admitted ? "bg-success/5" : "bg-background",
				)}
			>
				<code class="font-mono text-sm font-semibold break-all">{gate.name}</code>
				<div class="min-w-0 text-sm">
					<p>{gate.admits}</p>
					<p class="text-xs text-muted-foreground">
						{gate.forWhat}
						<span class="font-mono">{gate.check}</span>
					</p>
					{#if gate.name === "forDevelopers" && caller !== "anonymous"}
						<p class="text-xs text-muted-foreground">
							Unless the caller's email is in the list: then it is admitted.
						</p>
					{/if}
				</div>
				<div class="@xl:justify-self-end">
					{#if result.admitted}
						<Badge variant="success"><CheckIcon /> Admitted</Badge>
					{:else}
						<Badge variant="neutral"><XIcon /> Refused, {result.status}</Badge>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	<figcaption class="mt-2 text-xs text-muted-foreground">
		A module's own set, <code class="font-mono">moduleRemote(id)</code>, adds the module check to
		one of these.
	</figcaption>
</figure>
