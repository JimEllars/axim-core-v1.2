INSERT INTO public.crm_sequences (name, description, steps) VALUES
(
  'AXiM Intro & Audit',
  'High-value intro sequence offering a free AI workflow audit.',
  '[
    {"delay_days": 0, "subject": "AXiM Intro & Audit", "body": "Introduce AXiM Core, mention we noticed their infrastructure setup (OSINT tie-in), and offer a free workflow audit."},
    {"delay_days": 3, "subject": "Following up on the AI workflow audit", "body": "Follow-up asking if they saw the previous note, providing a 1-sentence case study on automation ROI."},
    {"delay_days": 4, "subject": "Right point of contact?", "body": "Break-up email. Asking to route to the correct point of contact."}
  ]'::jsonb
),
(
  'AI Automation Nurture',
  'Slower nurture for medium-score leads.',
  '[
    {"delay_days": 0, "subject": "AI agent deployment resources", "body": "Send a high-value resource or link regarding AI agent deployment."},
    {"delay_days": 7, "subject": "Thoughts on the AI resources?", "body": "Check in to see if they found the resource valuable and offer a brief discovery call."}
  ]'::jsonb
);
