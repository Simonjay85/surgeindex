CREATE TABLE "boost_payment_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_environment" "stripe_environment" NOT NULL,
	"checkout_session_id" text,
	"payment_intent_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_payment_attempt_environment_session_unique" UNIQUE("stripe_environment","checkout_session_id")
);
--> statement-breakpoint
ALTER TABLE "boost_payment_attempt" ADD CONSTRAINT "boost_payment_attempt_order_id_boost_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."boost_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boost_payment_attempt_order_idx" ON "boost_payment_attempt" USING btree ("order_id","created_at");