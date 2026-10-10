<!--
	@component
	A chart's text alternative: its numbers as a table, visually hidden, for screen readers (the
	chart itself is `aria-hidden`). `columns` are the headers; each row starts with its label (a
	row header), then a formatted value per column.
-->
<script lang="ts">
	let { caption, columns, rows }: { caption: string; columns: string[]; rows: string[][] } =
		$props();
</script>

<table class="sr-only" data-slot="chart-table">
	<caption>{caption}</caption>
	<thead>
		<tr>
			{#each columns as column (column)}
				<th scope="col">{column}</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each rows as [label, ...values] (label)}
			<tr>
				<th scope="row">{label}</th>
				{#each values as cell, i (i)}
					<td>{cell}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
