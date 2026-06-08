CREATE TABLE public.email_dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_content TEXT,
    error_diagnostic TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.email_dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access DLQ" ON public.email_dead_letter_queue
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );
