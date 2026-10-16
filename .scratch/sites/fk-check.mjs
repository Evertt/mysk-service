import { createClient } from "@libsql/client";

const client = createClient({ url: `file:${process.argv[2]}` });
await client.executeMultiple(`
	create table p (id integer primary key);
	create table c (id integer primary key, pid integer references p(id));
	insert into p values (1); insert into c values (1, 1);
`);
console.log("foreign_keys:", (await client.execute("pragma foreign_keys")).rows);
try {
	await client.batch(["delete from p"], "write");
	console.log("batch delete: allowed");
} catch (error) {
	console.log("batch delete: refused", error.message);
}
client.close();
