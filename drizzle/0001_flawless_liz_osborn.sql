CREATE TABLE `listening_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`trackId` int NOT NULL,
	`playedAt` timestamp NOT NULL DEFAULT (now()),
	`playDuration` int,
	CONSTRAINT `listening_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playlistId` int NOT NULL,
	`trackId` int NOT NULL,
	`position` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `playlist_tracks_id` PRIMARY KEY(`id`),
	CONSTRAINT `playlist_track_position_unique` UNIQUE(`playlistId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`isPublic` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playlists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `track_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`trackId` int NOT NULL,
	`preference` enum('like','dislike') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `track_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_track_unique` UNIQUE(`userId`,`trackId`)
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`soundcloudId` varchar(255) NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`artworkUrl` text,
	`duration` int NOT NULL,
	`streamUrl` text,
	`permalinkUrl` text,
	`genre` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tracks_id` PRIMARY KEY(`id`),
	CONSTRAINT `tracks_soundcloudId_unique` UNIQUE(`soundcloudId`)
);
--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `listening_history` (`userId`);--> statement-breakpoint
CREATE INDEX `played_at_idx` ON `listening_history` (`playedAt`);--> statement-breakpoint
CREATE INDEX `playlist_id_idx` ON `playlist_tracks` (`playlistId`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `playlists` (`userId`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `track_preferences` (`userId`);--> statement-breakpoint
CREATE INDEX `track_id_idx` ON `track_preferences` (`trackId`);--> statement-breakpoint
CREATE INDEX `soundcloud_id_idx` ON `tracks` (`soundcloudId`);