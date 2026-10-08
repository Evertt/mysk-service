import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import { stockLevel, stockLevels } from "#lib/components/materials/display.js";
import MaterialLink from "#lib/components/materials/material-link.svelte";
import { label } from "#lib/i18n/labels.js";
import { m } from "#lib/paraglide/messages.js";

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
		meta: { label: m.materials_material },
	}),
	// Hidden, so the search finds materials by SKU too.
	column.accessor("sku", {
		enableHiding: false,
		meta: { label: m.materials_sku },
	}),
	column.accessor("unit", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => label("materialUnit", getValue()),
		filterFn: "oneOf",
		enableGlobalFilter: false,
		meta: { label: m.materials_unit },
	}),
	column.accessor("unitPrice", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.materials_unit_price, align: "end" },
	}),
	column.accessor("stock", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(StockCell, { stock: row.original.stock, unit: row.original.unit }),
		enableGlobalFilter: false,
		meta: { label: m.materials_stock, align: "end" },
	}),
	// Not shown; the stock level filter filters on it.
	column.accessor((row) => stockLevel(row.stock, row.unit), {
		id: "stockLevel",
		filterFn: "oneOf",
		// From out of stock to in stock rather than alphabetically.
		sortFn: (a, b, id) => stockLevels.indexOf(a.getValue(id)) - stockLevels.indexOf(b.getValue(id)),
		enableHiding: false,
		enableGlobalFilter: false,
		meta: { label: m.materials_stock_level },
	}),
	column.accessor("orderCount", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_orders }),
		enableGlobalFilter: false,
		meta: { label: m.materials_used_on, align: "end" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.sku,
				href: resolve("/(app)/materials/[sku]", { sku: row.original.sku }),
				editHref: resolve("/(app)/materials/[sku]/edit", { sku: row.original.sku }),
				copy: [
					{ label: m.materials_copy_sku(), value: row.original.sku },
					{ label: m.materials_copy_name(), value: row.original.name },
				],
			}),
	}),
]);
