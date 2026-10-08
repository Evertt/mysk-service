<!--
	@component
	A link to a contract's detail page, for other sections that show contracts.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	let { number }: { number: string } = $props();
</script>

<a
	href={resolve("/(app)/contracts/[number]", { number })}
	class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
>
	{number}
</a>
