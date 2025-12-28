CREATE TABLE `player_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`sessionId` varchar(64),
	`event` varchar(64) NOT NULL,
	`trackSoundcloudId` varchar(255),
	`trackTitle` text,
	`page` varchar(64),
	`meta` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `player_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pe_user_id_idx` ON `player_events` (`userId`);--> statement-breakpoint
CREATE INDEX `pe_event_idx` ON `player_events` (`event`);--> statement-breakpoint
CREATE INDEX `pe_created_at_idx` ON `player_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `pe_track_soundcloud_id_idx` ON `player_events` (`trackSoundcloudId`);