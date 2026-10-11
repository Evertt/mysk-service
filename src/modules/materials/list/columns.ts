import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";

import { stockLevel, stockLevels } from "../display.ts";
import { materialLabels } from "../labels.ts";
import { materialUnits } from "../model.ts";
import MaterialLink from "../ui/material-link.svelte";
import type { getMaterials } from "./material-list.remote.ts";
import StockCell from "./stock-cell.svelte";

/** A row of the materials list, a page of which comes from the server (see `materialsList`). */
export type MaterialRow = Awaited<ReturnType<typeof getMaterials>>["rows"][number];

const column = createAppColumnHelper<MaterialRow>();

export const columns = column.columns([
	column.select(),
	column.accessor("name", {
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
		cell: ({ getValue }) => materialLabels.label("materialUnit", getValue()),
		filterFn: "oneOf",
		enableGrouping: true,
		enableGlobalFilter: false,
		meta: { label: m.materials_unit, filterValues: materialUnits },
	}),
	column.accessor("unitPrice", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.materials_unit_price, align: "end", param: "price" },
	}),
	column.accessor("stock", {
		cell: ({ row }) =>
			renderComponent(StockCell, { stock: row.original.stock, unit: row.original.unit }),
		enableGlobalFilter: false,
		meta: { label: m.materials_stock, align: "end", param: "quantity" },
	}),
	// Not shown; the stock level filter filters on it, and the rows can be grouped by it.
	column.accessor((row) => stockLevel(row.stock, row.unit), {
		id: "stockLevel",
		cell: ({ getValue }) => materialLabels.label("stockLevel", getValue()),
		filterFn: "oneOf",
		enableGrouping: true,
		// From out of stock to in stock rather than alphabetically.
		sortFn: (a, b, id) => stockLevels.indexOf(a.getValue(id)) - stockLevels.indexOf(b.getValue(id)),
		enableHiding: false,
		enableGlobalFilter: false,
		// `?stock=out,low`, e.g. from the dashboard.
		meta: { label: m.materials_stock_level, param: "stock", filterValues: stockLevels },
	}),
	column.accessor("orderCount", {
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_orders }),
		enableGlobalFilter: false,
		meta: { label: m.materials_used_on, align: "end", param: "used" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.sku,
				href: resolve("/(app)/(modules)/materials/[sku]", { sku: row.original.sku }),
				editHref: resolve("/(app)/(modules)/materials/[sku]/edit", { sku: row.original.sku }),
				copy: [
					{ label: m.materials_copy_sku(), value: row.original.sku },
					{ label: m.materials_copy_name(), value: row.original.name },
				],
			}),
	}),
]);
