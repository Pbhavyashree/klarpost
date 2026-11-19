CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letter_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"quote" text NOT NULL,
	"date" date,
	"relative" jsonb,
	"due_date" date,
	"due_date_explanation" jsonb,
	"amount_cents" integer,
	"currency" text,
	"text" text,
	"status" text NOT NULL,
	"issues" jsonb NOT NULL,
	"source_span" jsonb,
	"user_confirmed" boolean,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "letter_pages" (
	"letter_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "letter_pages_letter_id_page_pk" PRIMARY KEY("letter_id","page")
);
--> statement-breakpoint
CREATE TABLE "letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sender" text,
	"letter_type" text,
	"letter_date" date,
	"received_on" date,
	"summary" text NOT NULL,
	"urgency" text NOT NULL,
	"extractor" text NOT NULL,
	"source" text NOT NULL,
	"document" jsonb NOT NULL,
	"sent_to_model" text NOT NULL,
	"redactions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders_sent" (
	"item_id" uuid NOT NULL,
	"days_before" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_sent_item_id_days_before_pk" PRIMARY KEY("item_id","days_before")
);
--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'BE' NOT NULL,
	"reminder_days" integer[] DEFAULT '{7,3,1}'::integer[] NOT NULL,
	"telegram_chat_id" bigint,
	"telegram_username" text,
	"telegram_linked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_letter_id_letters_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."letters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_pages" ADD CONSTRAINT "letter_pages_letter_id_letters_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."letters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_due_idx" ON "items" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "letters_user_idx" ON "letters" USING btree ("user_id","created_at");