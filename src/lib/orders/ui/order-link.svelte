<script lang="ts">
	import { resolve } from "$app/paths";

	let { number }: { number: string } = $props();
</script>

<a
	href={resolve("/(app)/orders/[number]", { number })}
	class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
>
	{number}
</a>
