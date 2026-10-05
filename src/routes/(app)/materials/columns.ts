import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import { stockLevel, stockLevels, unitLabels } from "#lib/components/materials/display.js";
import MaterialLink from "#lib/components/materials/material-link.svelte";

import type { getMaterials } from "./materials.remote.js";
import StockCell from "./stock-cell.svelte";

export type MaterialRow = Awaited<ReturnType<typeof getMaterials>>[number];

const column = createAppColumnHelper<MaterialRow>();

export const columns = column.columns([
	column.accessor("name", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(MaterialLink, { sku: row.original.sku, name: row.original.name }),
		enableHiding: false,
		meta: { label: "Material" },
	}),
	// Hidden, so the search finds materials by SKU too.
	column.accessor("sku", {
		enableHiding: false,
		meta: { label: "SKU" },
	}),
	column.accessor("unit", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => unitLabels[getValue()],
		filterFn: "oneOf",
		enableGlobalFilter: false,
		meta: { label: "Unit" },
	}),
	column.accessor("unitPrice", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: "Unit price", align: "end" },
	}),
	column.accessor("stock", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(StockCell, { stock: row.original.stock, unit: row.original.unit }),
		enableGlobalFilter: false,
		meta: { label: "Stock", align: "end" },
	}),
	// Not shown; the stock level filter filters on it.
	column.accessor((row) => stockLevel(row.stock, row.unit), {
		id: "stockLevel",
		filterFn: "oneOf",
		// From out of stock to in stock rather than alphabetically.
		sortFn: (a, b, id) => stockLevels.indexOf(a.getValue(id)) - stockLevels.indexOf(b.getValue(id)),
		enableHiding: false,
		enableGlobalFilter: false,
		meta: { label: "Stock level" },
	}),
	column.accessor("orderCount", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell, { unit: "order" }),
		enableGlobalFilter: false,
		meta: { label: "Used on", align: "end" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.sku,
				href: resolve("/(app)/materials/[sku]", { sku: row.original.sku }),
				editHref: resolve("/(app)/materials/[sku]/edit", { sku: row.original.sku }),
				copy: [
					{ label: "Copy SKU", value: row.original.sku },
					{ label: "Copy name", value: row.original.name },
				],
			}),
	}),
]);
