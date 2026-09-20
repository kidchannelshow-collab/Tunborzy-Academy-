-- ============================================================================
-- MIGRATION 0050 — Fix Partners Schema, Indexes, RLS, and PostgREST Schema Cache
-- ============================================================================

-- 1. Ensure partners table exists with all required columns
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    referral_code TEXT NOT NULL UNIQUE,
    commission_percentage NUMERIC(5,2) DEFAULT 20.00 NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'pending', 'suspended', 'rejected', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Ensure profiles table has referred_by_partner_id foreign key
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'referred_by_partner_id'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN referred_by_partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Ensure partner_commission_ledger exists
CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
    referred_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    referral_code TEXT NOT NULL,
    payment_reference TEXT NOT NULL UNIQUE,
    payment_amount NUMERIC(12,2) NOT NULL,
    commission_rate NUMERIC(5,2) DEFAULT 0.20 NOT NULL,
    commission_amount NUMERIC(12,2) NOT NULL,
    currency TEXT DEFAULT 'NGN' NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Ensure partner_payouts exists
CREATE TABLE IF NOT EXISTS public.partner_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT DEFAULT 'NGN' NOT NULL,
    status TEXT DEFAULT 'paid' NOT NULL CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    payout_reference TEXT NOT NULL UNIQUE,
    requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON public.partners(referral_code);
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by_partner ON public.profiles(referred_by_partner_id);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_partner_id ON public.partner_commission_ledger(partner_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_referred_user ON public.partner_commission_ledger(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_payment_ref ON public.partner_commission_ledger(payment_reference);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON public.partner_commission_ledger(status);

-- 6. Enable RLS
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for partners
DROP POLICY IF EXISTS "Admins have full access to partners" ON public.partners;
CREATE POLICY "Admins have full access to partners" ON public.partners
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
    );

DROP POLICY IF EXISTS "Public and authenticated can read partner referral codes" ON public.partners;
CREATE POLICY "Public and authenticated can read partner referral codes" ON public.partners
    FOR SELECT USING (true);

-- 8. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
