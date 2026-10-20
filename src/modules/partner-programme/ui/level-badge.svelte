<!--
	@component
	A partner's level, e.g. PLATINUM, as a badge in its colour: the one chosen for the level (pass
	it as `colour`), else the one its name says (`levelColour()`), else blue; "No level" below the
	first.
-->
<script lang="ts">
	import { type LevelColour, levelColour } from "../model.ts";

	let { level, colour }: { level: string | null; colour?: LevelColour } = $props();

	const shown = $derived(level ? (colour ?? levelColour(level)) : undefined);
</script>

{#if level}
	<Badge variant={shown ?? "info"} data-level data-colour={shown}>{level}</Badge>
{:else}
	<Badge variant="neutral" data-level>{m.partners_no_level()}</Badge>
{/if}
