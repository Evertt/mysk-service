import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import { withListColumns } from "#lib/components/data-table/list-definition.ts";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import { CustomerLink } from "#lib/customers/components.ts";
import { formatCents } from "#lib/i18n/index.ts";

import { invoiceStateDisplay } from "../display.ts";
import { invoiceStates } from "../invoice.ts";
import type { getInvoices } from "../invoices.remote.ts";
import InvoiceLink from "../ui/invoice-link.svelte";
import CreditedCell from "./credited-cell.svelte";
import { invoicesList } from "./invoices-list.ts";

export type InvoiceRow = Awaited<ReturnType<typeof getInvoices>>[number];

const column = createAppColumnHelper<InvoiceRow>();

export const columns = withListColumns(invoicesList, {
	select: column.select(),
	number: column.accessor("number", {
		cell: ({ getValue }) => renderComponent(InvoiceLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.invoices_column_invoice },
	}),
	customer: column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				code: row.original.customer.code,
				name: row.original.customer.name,
				withCode: true,
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.invoices_column_customer },
	}),
	// The status, with sent invoices past their due date as overdue.
	status: column.enum("state", {
		id: "status",
		values: invoiceStates,
		display: invoiceStateDisplay,
		// In the order an invoice goes through them rather than alphabetically.
		sortByOrder: true,
		meta: { label: m.invoices_column_status },
	}),
	// Drafts have no dates yet; `undefined` sorts them last.
	issuedOn: column.accessor((row) => row.issuedOn ?? undefined, {
		id: "issuedOn",
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_issued },
	}),
	dueOn: column.accessor((row) => row.dueOn ?? undefined, {
		id: "dueOn",
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		// `?due=before-today`: due before today; `none` the drafts.
		meta: { label: m.invoices_column_due, none: m.invoices_enum_invoice_state_draft },
	}),
	total: column.accessor("total", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_total, align: "end", groupSum: (sum) => formatCents(sum) },
	}),
	// What its issued credit notes took off; the total stays what the invoice billed.
	credited: column.accessor("credited", {
		cell: ({ getValue }) => renderComponent(CreditedCell, { value: getValue() }),
		enableGlobalFilter: false,
		meta: {
			label: m.invoices_column_credited,
			align: "end",
			groupSum: (sum) => formatCents(sum),
		},
	}),
	createdAt: column.accessor("createdAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.invoices_column_created },
	}),
	actions: column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.number,
				href: resolve("/(app)/(modules)/invoices/[number]", { number: row.original.number }),
				copy: [
					{ label: m.invoices_copy_number(), value: row.original.number },
					{ label: m.invoices_copy_customer_code(), value: row.original.customer.code },
				],
			}),
	}),
});
