CREATE TABLE `bug_report` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`user_id` text,
	`user_name` text NOT NULL,
	`url` text NOT NULL,
	`route_id` text,
	`note` text DEFAULT '' NOT NULL,
	`user_agent` text NOT NULL,
	`app_version` text NOT NULL,
	`context` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bug_report_created` ON `bug_report` (`created_at`);--> statement-breakpoint
CREATE INDEX `bug_report_organization` ON `bug_report` (`organization_id`);--> statement-breakpoint
CREATE INDEX `bug_report_user` ON `bug_report` (`user_id`);