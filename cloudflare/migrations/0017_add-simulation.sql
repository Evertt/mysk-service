CREATE TABLE `simulation` (
	`organization_id` text NOT NULL,
	`module_id` text NOT NULL,
	`running` integer DEFAULT true NOT NULL,
	`speed` integer DEFAULT 1 NOT NULL,
	`last_tick_at` integer DEFAULT (unixepoch()) NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`organization_id`, `module_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "simulation_speed" CHECK(speed in (1, 2, 5, 10, 30))
);
