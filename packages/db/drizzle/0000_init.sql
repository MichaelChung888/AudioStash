CREATE TABLE "applied_mutations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"download_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"input" jsonb NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"worker_id" text,
	"claimed_at" timestamp with time zone,
	"pending_song_id" uuid,
	"song_id" uuid,
	"playlist_position" text collate "C",
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "download_items_status_check" CHECK ("download_items"."status" in ('queued', 'active', 'completed', 'skipped', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_url" text,
	"options" jsonb NOT NULL,
	"playlist_id" uuid,
	"name_playlist_from_source" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "downloads_status_check" CHECK ("downloads"."status" in ('queued', 'resolving', 'active', 'completed', 'partial', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "library_changes" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_changes_entity_check" CHECK ("library_changes"."entity" in ('song', 'playlist', 'entry')),
	CONSTRAINT "library_changes_op_check" CHECK ("library_changes"."op" in ('upsert', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"payload" jsonb NOT NULL,
	"message_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "playlist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"playlist_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"position" text collate "C" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"album_artist" text,
	"year" integer,
	"genre" text,
	"track_number" integer,
	"disc_number" integer,
	"isrc" text,
	"duration_ms" integer NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text,
	"audio_key" text NOT NULL,
	"audio_codec" text NOT NULL,
	"audio_bitrate_kbps" integer,
	"audio_size_bytes" bigint NOT NULL,
	"audio_sha256" text NOT NULL,
	"cover_key" text,
	"cover_color" text,
	"lyrics_plain" text,
	"lyrics_synced" text,
	"loudness_lufs" real,
	"gain_db" real,
	"path" text NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_source_check" CHECK ("songs"."source" in ('youtube', 'soundcloud', 'bandcamp', 'upload', 'other')),
	CONSTRAINT "songs_audio_codec_check" CHECK ("songs"."audio_codec" in ('opus', 'aac', 'mp3'))
);
--> statement-breakpoint
ALTER TABLE "download_items" ADD CONSTRAINT "download_items_download_id_downloads_id_fk" FOREIGN KEY ("download_id") REFERENCES "public"."downloads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_items" ADD CONSTRAINT "download_items_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_entries" ADD CONSTRAINT "playlist_entries_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_entries" ADD CONSTRAINT "playlist_entries_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "download_items_position_unique" ON "download_items" USING btree ("download_id","position");--> statement-breakpoint
CREATE INDEX "download_items_status_idx" ON "download_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "downloads_created_idx" ON "downloads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox" USING btree ("id") WHERE "outbox"."published_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "playlist_entries_song_unique" ON "playlist_entries" USING btree ("playlist_id","song_id");--> statement-breakpoint
CREATE INDEX "playlist_entries_order_idx" ON "playlist_entries" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "songs_source_unique" ON "songs" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "songs_path_unique" ON "songs" USING btree (lower("path"));--> statement-breakpoint
CREATE INDEX "songs_isrc_idx" ON "songs" USING btree ("isrc");