<!--
	@component
	How Salvo secures a dock, as the mockup explains it (§2.4's process): check in, lock, door open,
	check out.
-->
<script lang="ts">
	const steps = $derived([
		{ title: m.docks_process_check_in_title(), text: m.docks_process_check_in() },
		{ title: m.docks_process_lock_title(), text: m.docks_process_lock() },
		{ title: m.docks_process_door_title(), text: m.docks_process_door() },
		{ title: m.docks_process_check_out_title(), text: m.docks_process_check_out() },
	]);
</script>

<Card.Root data-dock-process>
	<Card.Header>
		<Card.Title>{m.docks_process_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<ol class="flex flex-col gap-2 text-sm text-muted-foreground">
			{#each steps as step (step.title)}
				<li>
					<strong class="font-medium text-foreground">{step.title}</strong> — {step.text}
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>
