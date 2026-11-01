<!--
	@component
	The SHLTR demo's three roles side by side: for each, the shell it lands in (`roles.ts`, whose
	`home` is read from `shells`), where that starts and what the role can and can't do there, and a
	button to try it as that role (`TryIt`, only where the demo's sign-in is on). Needs no props.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import XIcon from "@lucide/svelte/icons/x";

	import { demoRoleLabels } from "#routes/demo-roles.ts";
	import TryIt from "#wiki/parts/try-it.svelte";

	import { roleCards, shellTitles } from "./roles.ts";
</script>

<div class="not-prose @container my-6" data-testid="role-switcher">
	<div class="grid gap-3 @3xl:grid-cols-3">
		{#each roleCards as card (card.role)}
			<section
				class="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground"
				data-role={card.role}
				data-shell={card.shell}
				aria-labelledby="role-{card.role}"
			>
				<div class="grid gap-1">
					<h3 id="role-{card.role}" class="text-base font-semibold first-letter:uppercase">
						{demoRoleLabels[card.role]()}
					</h3>
					<p class="text-sm text-muted-foreground">
						{m.wiki_roles_starts_at({ shell: shellTitles[card.shell]() })}
						<code class="font-mono text-foreground">{card.home}</code>
					</p>
				</div>
				<ul class="grid gap-2 text-sm">
					{#each card.can as line (line)}
						<li class="flex gap-2">
							<CheckIcon class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
							<span><span class="sr-only">{m.wiki_roles_can()}</span> {line()}</span>
						</li>
					{/each}
					{#each card.cannot as line (line)}
						<li class="flex gap-2 text-muted-foreground">
							<XIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span><span class="sr-only">{m.wiki_roles_cannot()}</span> {line()}</span>
						</li>
					{/each}
				</ul>
				<div class="mt-auto">
					<TryIt as={card.role} />
				</div>
			</section>
		{/each}
	</div>
</div>
