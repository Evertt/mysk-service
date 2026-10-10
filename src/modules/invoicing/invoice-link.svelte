<!--
	@component
	A link to an invoice's page, for the module's cards on core pages and its tables.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	let { number }: { number: string } = $props();
</script>

<a
	href={resolve("/(app)/(modules)/invoices/[number]", { number })}
	class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
>
	{number}
</a>
