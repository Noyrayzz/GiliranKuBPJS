-- GiliranKu schema (PostgreSQL 16). Idempotent: aman dijalankan berulang.
-- Sumber kebenaran: PRD §10. Tambahan implementasi diberi komentar "(impl)".

create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_units (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id),
  name text not null,
  type text not null check (type in ('registration','clinic','pharmacy')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists service_units_name_uq on service_units (hospital_id, lower(name));

create table if not exists service_stages (
  id uuid primary key default gen_random_uuid(),
  service_unit_id uuid not null references service_units(id),
  name text not null,
  sequence integer not null check (sequence > 0),
  -- null hanya untuk data lama/langsung; API selalu mewajibkan > 0 (FR-009 AC2 ditangani di perhitungan)
  estimated_service_minutes integer check (estimated_service_minutes is null or estimated_service_minutes > 0),
  near_turn_threshold integer not null default 2 check (near_turn_threshold >= 0),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_unit_id, sequence)
);

create table if not exists staff_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  role text not null check (role in ('staff_registration','staff_clinic','staff_pharmacy','admin')),
  service_unit_id uuid references service_units(id),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role = 'admin' or service_unit_id is not null)
);
create unique index if not exists staff_users_username_uq on staff_users (lower(username));

-- (impl) sesi staf: token acak di cookie HttpOnly, hanya hash yang disimpan; idle timeout dicek di aplikasi
create table if not exists staff_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  staff_user_id uuid not null references staff_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  national_identity_number text not null,
  family_card_number text,
  medical_record_number text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (national_identity_number, medical_record_number)
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  hospital_id uuid not null references hospitals(id),
  clinic_unit_id uuid not null references service_units(id), -- (impl) poli yang dipilih; dipakai menyusun alur tahap
  visit_date date not null,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  access_token_hash text not null,
  -- (impl) PRD §14: tahap berikutnya belum dikonfigurasi -> alur ditandai butuh admin, tidak ada tahap fiktif.
  -- Nilai: null atau 'needs_admin:<registration|clinic|pharmacy>'
  needs_admin_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Satu tiket aktif per pasien/rumah sakit/tanggal; juga menahan pendaftaran ganda yang bersamaan (§14)
create unique index if not exists visits_one_active_uq on visits (patient_id, hospital_id, visit_date) where status = 'active';

-- (impl) counter atomik: nomor tiket per rumah sakit/tanggal dan queue_sequence per tahap/tanggal.
-- INSERT .. ON CONFLICT DO UPDATE mengunci baris counter sehingga dua transaksi tidak pernah mendapat nomor sama.
create table if not exists daily_counters (
  scope text not null,
  scope_date date not null,
  last_value integer not null default 0,
  primary key (scope, scope_date)
);

-- (impl) beberapa token aktif per kunjungan: pasien yang kehilangan tautan memperoleh tautan tambahan tanpa
-- mematikan tautan lama (menghindari race pada pendaftaran ganda). refresh-token mencabut semuanya.
create table if not exists visit_tokens (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists visit_tokens_visit_idx on visit_tokens (visit_id, created_at desc);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references visits(id),
  hospital_id uuid not null references hospitals(id), -- (impl) konteks antrean untuk keunikan nomor
  ticket_date date not null,                           -- (impl)
  ticket_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, ticket_date, ticket_number)
);

create table if not exists ticket_stages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id),
  service_stage_id uuid not null references service_stages(id),
  queue_date date not null,                            -- (impl) "unik pada tahap/tanggal"
  status text not null default 'menunggu' check (status in
    ('menunggu','dipanggil','sedang_dilayani','selesai','dilewati','dibatalkan','siap_diambil','diserahkan')),
  queue_sequence integer not null,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  unique (ticket_id, service_stage_id),
  unique (service_stage_id, queue_date, queue_sequence)
);
create index if not exists ticket_stages_queue_idx on ticket_stages (service_stage_id, queue_date, status, queue_sequence);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_staff_user_id uuid references staff_users(id),
  ticket_id uuid references tickets(id),
  ticket_stage_id uuid references ticket_stages(id),
  action text not null,
  previous_status text,
  new_status text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_ticket_idx on audit_logs (ticket_id, created_at);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

-- NFR-012: audit log append-only (tidak bisa UPDATE/DELETE dari antarmuka maupun query biasa)
create or replace function audit_logs_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs bersifat append-only';
end $$;
drop trigger if exists audit_logs_no_change on audit_logs;
create trigger audit_logs_no_change before update or delete on audit_logs
  for each row execute function audit_logs_append_only();

-- TRUNCATE tidak memicu trigger baris; blokir kecuali reset demo menyalakan flag lokal transaksi.
create or replace function audit_logs_no_truncate() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('giliranku.allow_reset', true), '') <> 'on' then
    raise exception 'audit_logs bersifat append-only';
  end if;
  return null;
end $$;
drop trigger if exists audit_logs_no_truncate on audit_logs;
create trigger audit_logs_no_truncate before truncate on audit_logs
  for each statement execute function audit_logs_no_truncate();

create table if not exists location_qr_codes (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id),
  service_unit_id uuid references service_units(id),
  code text not null unique,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
