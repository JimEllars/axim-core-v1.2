CREATE TYPE course_visibility AS ENUM ('public', 'unlisted', 'archived');
CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'revoked');
CREATE TYPE credential_status AS ENUM ('not_applicable', 'pending', 'minted', 'failed');

CREATE TABLE IF NOT EXISTS public.academy_promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    discount_percentage NUMERIC(5, 2) NOT NULL CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    max_uses INTEGER DEFAULT NULL,
    uses INTEGER DEFAULT 0,
    linked_affiliate_id UUID,
    is_internal_grant BOOLEAN DEFAULT false,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academy_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'Foundation',
    visibility course_visibility DEFAULT 'unlisted',
    price_usd NUMERIC(10, 2) DEFAULT 0.00,
    sbt_contract_address TEXT,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academy_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.academy_courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academy_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID REFERENCES public.academy_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('video', 'article', 'interactive_quiz')),
    memory_bank_ref UUID,
    content_payload JSONB,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academy_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    course_id UUID REFERENCES public.academy_courses(id) ON DELETE CASCADE,
    status enrollment_status DEFAULT 'active',
    applied_promo_code TEXT REFERENCES public.academy_promo_codes(code) ON DELETE SET NULL,
    revenue_split_status TEXT DEFAULT 'pending',
    stripe_payment_intent TEXT,
    web3_wallet_address TEXT,
    sbt_mint_status credential_status DEFAULT 'not_applicable',
    pdf_certificate_url TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.academy_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT false,
    quiz_score NUMERIC(5, 2),
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enrollment_id, lesson_id)
);

CREATE OR REPLACE FUNCTION check_course_completion()
RETURNS TRIGGER AS $$ DECLARE total_lessons INT; completed_lessons INT; BEGIN IF NEW.is_completed = true THEN SELECT COUNT(*) INTO total_lessons FROM public.academy_lessons al JOIN public.academy_modules am ON al.module_id = am.id JOIN public.academy_enrollments ae ON am.course_id = ae.course_id WHERE ae.id = NEW.enrollment_id;             SELECT COUNT(*) INTO completed_lessons FROM public.academy_progress WHERE enrollment_id = NEW.enrollment_id AND is_completed = true;             IF total_lessons > 0 AND total_lessons = completed_lessons THEN UPDATE public.academy_enrollments SET status = 'completed', completed_at = NOW(), sbt_mint_status = CASE WHEN web3_wallet_address IS NOT NULL THEN 'pending'::credential_status ELSE 'not_applicable'::credential_status END WHERE id = NEW.enrollment_id; END IF; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER evaluate_course_completion
AFTER INSERT OR UPDATE OF is_completed ON public.academy_progress
FOR EACH ROW EXECUTE FUNCTION check_course_completion();

ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public courses are visible to everyone"
ON public.academy_courses FOR SELECT
USING (visibility = 'public');

CREATE POLICY "Users can view their own enrollments"
ON public.academy_enrollments FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own progress"
ON public.academy_progress FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.academy_enrollments
    WHERE id = enrollment_id AND user_id = auth.uid()
  )
);
