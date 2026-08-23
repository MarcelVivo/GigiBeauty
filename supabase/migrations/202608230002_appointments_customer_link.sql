-- Links appointments to a CRM contact (public.customers) independently of
-- an auth account. appointments.customer_id only ever points at
-- public.profiles (a logged-in account), so historical/offline customers
-- without a login (e.g. imported Treatwell customers) had no way to show
-- up on their own CRM customer page. This column closes that gap.

alter table public.appointments
  add column if not exists customer_ref_id uuid references public.customers(id) on delete set null;

create index if not exists appointments_customer_ref_idx on public.appointments(customer_ref_id);
