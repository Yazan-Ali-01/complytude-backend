BEGIN;

-- =========================
-- Migration 048: credit reversals for refunded and disputed purchases
-- =========================
-- Description: a credit purchase whose payment is refunded or disputed in Stripe has its credits
--              taken back by a 'reversal' row (negative; positive when a dispute is won and they
--              are returned). Unlike 'refund' (credits given back to the tenant for a failed
--              operation), a reversal follows the money. The balance may go below zero, which
--              blocks spending until it is positive again.
-- =========================

ALTER TYPE public.credit_transaction_type ADD VALUE IF NOT EXISTS 'reversal';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
-- Postgres can't drop an enum value. With no 'reversal' rows left, recreate the type without it:
BEGIN;
ALTER TYPE public.credit_transaction_type RENAME TO credit_transaction_type_old;
CREATE TYPE public.credit_transaction_type AS ENUM ('purchase', 'grant', 'deduction', 'expiry', 'refund');
ALTER TABLE public.credit_ledger
    ALTER COLUMN transaction_type TYPE public.credit_transaction_type
    USING transaction_type::text::public.credit_transaction_type;
DROP TYPE public.credit_transaction_type_old;
COMMIT;
*/
