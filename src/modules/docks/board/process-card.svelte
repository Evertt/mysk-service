<!--
	@component
	How a dock session goes (§2.4's process: check in, lock, door open, check out) and what the
	door-open signals mean.
-->
<script lang="ts">
	const steps = $derived([
		{ title: m.docks_process_check_in_title(), text: m.docks_process_check_in() },
		{ title: m.docks_process_lock_title(), text: m.docks_process_lock() },
		{ title: m.docks_process_door_title(), text: m.docks_process_door() },
		{ title: m.docks_process_check_out_title(), text: m.docks_process_check_out() },
	]);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.docks_process_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4 text-sm">
		<ol class="grid gap-3 sm:grid-cols-2">
			{#each steps as step (step.title)}
				<li class="flex flex-col gap-0.5">
					<span class="font-medium">{step.title}</span>
					<span class="text-muted-foreground">{step.text}</span>
				</li>
			{/each}
		</ol>
		<section class="flex flex-col gap-1">
			<h3 class="font-medium">{m.docks_signals_title()}</h3>
			<p>{m.docks_signal_normal()}</p>
			<p class="text-amber-700 dark:text-amber-300">{m.docks_signal_amber()}</p>
			<p class="text-rose-600 dark:text-rose-400">{m.docks_signal_red()}</p>
		</section>
	</Card.Content>
</Card.Root>
