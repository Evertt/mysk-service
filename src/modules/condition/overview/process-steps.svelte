<!--
	@component
	How Connect works, in the SHLTR mockup's four steps under the page's banner: link, monitor, plan,
	carry out and record. Each a card with its icon, its title and a line.
-->
<script lang="ts">
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import Link2Icon from "@lucide/svelte/icons/link-2";

	const steps = $derived([
		{ icon: Link2Icon, title: m.condition_step_link_title(), text: m.condition_step_link() },
		{ icon: GaugeIcon, title: m.condition_step_monitor_title(), text: m.condition_step_monitor() },
		{
			icon: CalendarClockIcon,
			title: m.condition_step_plan_title(),
			text: m.condition_step_plan(),
		},
		{
			icon: ClipboardCheckIcon,
			title: m.condition_step_record_title(),
			text: m.condition_step_record(),
		},
	]);
</script>

<ol
	class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
	aria-label={m.condition_steps_label()}
	data-steps
>
	{#each steps as step (step.title)}
		<li class="rounded-lg border bg-card p-4 text-card-foreground">
			<div class="grid size-9 place-items-center rounded-md bg-accent text-primary">
				<step.icon class="size-4" />
			</div>
			<div class="mt-3 text-sm font-semibold">{step.title}</div>
			<p class="mt-1 text-sm text-muted-foreground">{step.text}</p>
		</li>
	{/each}
</ol>
