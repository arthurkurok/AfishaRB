CREATE TABLE "assistant_trace" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"channel" varchar(16) NOT NULL,
	"prompt_version" varchar(32) NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"latency_ms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text_masked" text NOT NULL,
	"slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision" varchar(16) NOT NULL,
	"candidate_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"picked_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verifier" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mode" varchar(16) NOT NULL,
	"feedback" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(16),
	"entity_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" uuid NOT NULL,
	"event_id" uuid,
	"kind" varchar(32) NOT NULL,
	"field" varchar(48),
	"old_value" jsonb,
	"new_value" jsonb,
	"source_id" varchar(48),
	"actor" text,
	"reason" text,
	"notified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"organization_id" uuid,
	"title" jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category_codes" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source_genres" text[] DEFAULT '{}' NOT NULL,
	"age_rating" smallint,
	"is_free" boolean DEFAULT false NOT NULL,
	"price_min" numeric(10, 2),
	"price_max" numeric(10, 2),
	"pushkin_card" boolean DEFAULT false NOT NULL,
	"accessibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"languages" text[] DEFAULT '{ru}' NOT NULL,
	"duration_min" integer,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ticket_url" text,
	"source_url" text,
	"is_permanent" boolean DEFAULT false NOT NULL,
	"moderation_status" varchar(16) DEFAULT 'published' NOT NULL,
	"trust_level" varchar(16) DEFAULT 'official' NOT NULL,
	"quality_score" double precision,
	"popularity" double precision DEFAULT 0 NOT NULL,
	"title_norm" text DEFAULT '' NOT NULL,
	"search_tsv" tsvector,
	"embedding" halfvec(2560),
	"cluster_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"remind" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_provenance" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" varchar(48) NOT NULL,
	"source_id" varchar(48) NOT NULL,
	"source_record_id" integer,
	"value_hash" varchar(40) NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_winning" boolean DEFAULT true NOT NULL,
	"rule" text
);
--> statement-breakpoint
CREATE TABLE "moderation_task" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"state" varchar(16) DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"entity_type" varchar(16),
	"entity_id" uuid,
	"related_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution" text,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipality" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"name" jsonb NOT NULL,
	"synonyms" text[] DEFAULT '{}' NOT NULL,
	"center" geography(Point,4326),
	"population" integer,
	"culture_locale_ids" integer[] DEFAULT '{}' NOT NULL,
	"sort" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"event_id" uuid,
	"change_id" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "occurrence" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"event_id" uuid NOT NULL,
	"venue_id" uuid,
	"municipality_id" varchar(64),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"is_range" boolean DEFAULT false NOT NULL,
	"schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'scheduled' NOT NULL,
	"status_reason" text,
	"rescheduled_to" uuid,
	"previous_starts_at" timestamp with time zone,
	"availability" varchar(16) DEFAULT 'unknown' NOT NULL,
	"price_min" numeric(10, 2),
	"price_max" numeric(10, 2),
	"ticket_url" text,
	"last_verified_at" timestamp with time zone,
	"freshness" varchar(16) DEFAULT 'fresh' NOT NULL,
	"source_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"name" jsonb NOT NULL,
	"short_name" text,
	"municipality_id" varchar(64),
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"website" text,
	"phone" text,
	"email" text,
	"quality_score" double precision,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"region_id" varchar(16) DEFAULT 'ba' NOT NULL,
	"channel" varchar(16) NOT NULL,
	"external_id" text NOT NULL,
	"lang" varchar(8) DEFAULT 'ru' NOT NULL,
	"municipality_id" varchar(64),
	"kids_ages" integer[] DEFAULT '{}' NOT NULL,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"pushkin_card" boolean DEFAULT false NOT NULL,
	"personalization" boolean DEFAULT true NOT NULL,
	"notify_changes" boolean DEFAULT true NOT NULL,
	"notify_digest" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"push_tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"languages" text[] NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid,
	"occurrence_id" uuid,
	"reason" varchar(32) NOT NULL,
	"comment" text,
	"channel" varchar(16) NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_search" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"query" jsonb NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"region_id" varchar(16) DEFAULT 'ba' NOT NULL,
	"channel" varchar(16) NOT NULL,
	"query_text" text,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"municipality_id" varchar(64),
	"results" integer NOT NULL,
	"via_assistant" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" varchar(48) PRIMARY KEY NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"trust_level" varchar(16) NOT NULL,
	"url" text,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_record" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" varchar(48) NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(40) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_run" integer,
	"parse_status" varchar(16) DEFAULT 'ok' NOT NULL,
	"parse_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapped_event_id" uuid,
	"seen_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" varchar(48) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(32) NOT NULL,
	"organization_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venue" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"region_id" varchar(16) NOT NULL,
	"organization_id" uuid,
	"name" jsonb NOT NULL,
	"address" text,
	"geo" geography(Point,4326),
	"municipality_id" varchar(64),
	"accessibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"phone" text,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "municipality" ADD CONSTRAINT "municipality_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_municipality_id_municipality_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_municipality_id_municipality_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search" ADD CONSTRAINT "saved_search_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_record" ADD CONSTRAINT "source_record_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_run" ADD CONSTRAINT "source_run_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue" ADD CONSTRAINT "venue_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue" ADD CONSTRAINT "venue_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue" ADD CONSTRAINT "venue_municipality_id_municipality_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipality"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_assistant_trace_created" ON "assistant_trace" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_assistant_trace_conv" ON "assistant_trace" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ix_change_log_entity" ON "change_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ix_change_log_event" ON "change_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ix_change_log_notified" ON "change_log" USING btree ("notified");--> statement-breakpoint
CREATE INDEX "ix_change_log_created" ON "change_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_event_moderation" ON "event" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "ix_event_search_tsv" ON "event" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "ix_event_title_trgm" ON "event" USING gin ("title_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ix_event_categories" ON "event" USING gin ("category_codes");--> statement-breakpoint
CREATE INDEX "ix_event_tags" ON "event" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "ix_event_cluster" ON "event" USING btree ("cluster_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_favorite_profile_event" ON "favorite" USING btree ("profile_id","event_id");--> statement-breakpoint
CREATE INDEX "ix_favorite_event" ON "favorite" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_provenance_field_source" ON "field_provenance" USING btree ("entity_type","entity_id","field","source_id");--> statement-breakpoint
CREATE INDEX "ix_provenance_entity" ON "field_provenance" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ix_moderation_kind_state" ON "moderation_task" USING btree ("kind","state");--> statement-breakpoint
CREATE INDEX "ix_municipality_center" ON "municipality" USING gist ("center");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_profile_change" ON "notification" USING btree ("profile_id","change_id");--> statement-breakpoint
CREATE INDEX "ix_notification_status" ON "notification" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_occurrence_source_key" ON "occurrence" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "ix_occurrence_region_starts" ON "occurrence" USING btree ("region_id","starts_at");--> statement-breakpoint
CREATE INDEX "ix_occurrence_event" ON "occurrence" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ix_occurrence_venue" ON "occurrence" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "ix_occurrence_municipality" ON "occurrence" USING btree ("municipality_id");--> statement-breakpoint
CREATE INDEX "ix_occurrence_status" ON "occurrence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_occurrence_ends" ON "occurrence" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "ix_organization_ext" ON "organization" USING gin ("external_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_profile_channel_ext" ON "profile" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "ix_search_log_created" ON "search_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_search_log_muni" ON "search_log" USING btree ("municipality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_record_ext" ON "source_record" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "ix_source_record_event" ON "source_record" USING btree ("mapped_event_id");--> statement-breakpoint
CREATE INDEX "ix_venue_geo" ON "venue" USING gist ("geo");--> statement-breakpoint
CREATE INDEX "ix_venue_municipality" ON "venue" USING btree ("municipality_id");--> statement-breakpoint
CREATE INDEX "ix_venue_ext" ON "venue" USING gin ("external_ids");