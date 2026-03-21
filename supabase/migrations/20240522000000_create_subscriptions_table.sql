create table if not exists public.subscriptions_ax2024 (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text check (status in ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid')),
  plan_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions_ax2024 enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions_ax2024 for select
  using (auth.uid() = user_id);

create policy "Service role can manage all subscriptions"
  on public.subscriptions_ax2024 for all
  using (auth.role() = 'service_role');
