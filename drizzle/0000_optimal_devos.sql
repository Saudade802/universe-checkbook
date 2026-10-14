CREATE TABLE `check_attempts` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`successful` integer NOT NULL,
	`data` text,
	`errors` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `request_id`)
);
--> statement-breakpoint
CREATE INDEX `attempts_user_created` ON `check_attempts` (`user_id`,`created_at`);