#!/bin/zsh
# Applies the Durable Object's 0002 migration to a copy of a seeded database, with foreign keys on
# (as a Durable Object has them), and checks nothing was lost.
set -e
cd "${0:A:h}"
cp before.db do.db
sed 's/--> statement-breakpoint//' ../../cloudflare/migrations/0002_add-customer-sites.sql > do.sql
q='select (select count(*) from contract_equipment), (select count(*) from maintenance_plan), (select count(*) from equipment), (select count(*) from "order" where equipment_id is not null);'
echo "before: $(sqlite3 do.db "$q")"
{ echo "pragma foreign_keys=on; begin;"; cat do.sql; echo "; commit;"; } > run.sql
sqlite3 -bail do.db < run.sql
echo "after:  $(sqlite3 do.db "$q")"
echo "fk check: $(sqlite3 do.db 'pragma foreign_key_check;')"
echo "sites: $(sqlite3 do.db 'select count(*) from customer_site; select count(*) from customer;')"
echo "unsited: $(sqlite3 do.db 'select count(*) from equipment where site_id is null;')"
echo "leftovers: $(sqlite3 do.db "select name from sqlite_master where name like '__old%';")"
