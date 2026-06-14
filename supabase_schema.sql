-- ═══════════════════════════════════════════════════════
-- ORION HUB — Supabase schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- ═══════════════════════════════════════════════════════

-- 1. USER SUBSCRIPTIONS ------------------------------------------------
create table if not exists public.user_subscriptions (
    id           bigint generated always as identity primary key,
    email        text unique not null,
    access_token text,
    status       text not null default 'free',  -- free | weekly | monthly | ultimate | admin
    trials_left  integer not null default 5,
    created_at   timestamptz not null default now()
);

-- 2. API KEYS (pooled provider keys for AI calls) ----------------------
create table if not exists public.api_keys (
    id          bigint generated always as identity primary key,
    provider    text not null,                 -- gemini | groq | openai
    api_key     text not null,
    status      text not null default 'active', -- active | exhausted
    usage_count integer not null default 0,
    created_at  timestamptz not null default now()
);

-- 3. PRICING / APP CONFIG ------------------------------------------------
create table if not exists public.orion_config (
    id               integer primary key default 1,
    weekly_price     integer not null default 350,
    monthly_base     integer not null default 2500,
    monthly_discount integer not null default 30,
    yearly_base      integer not null default 10000,
    yearly_discount  integer not null default 40
);

insert into public.orion_config (id, weekly_price, monthly_base, monthly_discount, yearly_base, yearly_discount)
values (1, 350, 2500, 30, 10000, 40)
on conflict (id) do nothing;

-- 4. FEEDBACK -------------------------------------------------------------
create table if not exists public.user_feedbacks (
    id            bigint generated always as identity primary key,
    email         text not null,
    rating_stars  integer not null,
    feedback_text text default '',
    created_at    timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- The backend uses the SERVICE ROLE key, which bypasses RLS entirely.
-- We still enable RLS on every table so that the anon/public key
-- (used nowhere in this rewrite, but may exist in your project)
-- cannot read or write these tables directly from a browser.
-- ═══════════════════════════════════════════════════════

alter table public.user_subscriptions enable row level security;
alter table public.api_keys           enable row level security;
alter table public.orion_config       enable row level security;
alter table public.user_feedbacks     enable row level security;

-- No policies are created — this means:
--   - anon key: NO access (all requests denied)
--   - service_role key: FULL access (RLS bypassed automatically)
-- This is intentional: all data access happens through the
-- /api/analyze serverless function using the service role key.
