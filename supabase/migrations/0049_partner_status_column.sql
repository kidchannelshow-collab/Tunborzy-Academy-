-- ============================================================================
-- MIGRATION 0049 — Add status column to partners table if not exists
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'partners' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE public.partners 
        ADD COLUMN status TEXT DEFAULT 'active' NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status);
