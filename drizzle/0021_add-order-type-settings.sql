CREATE TABLE `order_type_setting` (
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`names` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`organization_id`, `type`),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
