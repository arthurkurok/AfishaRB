CREATE TABLE "match_decision" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_a" uuid NOT NULL,
	"event_b" uuid NOT NULL,
	"decision" varchar(16) NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_match_decision_pair" ON "match_decision" USING btree ("event_a","event_b");