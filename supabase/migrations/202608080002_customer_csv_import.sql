-- Erweitert das CRM für den historischen Treatwell-Kundenexport.
alter table public.customers
  alter column email drop not null;

alter table public.customers
  add column if not exists external_reference text unique,
  add column if not exists legacy_booking_count integer not null default 0
    check (legacy_booking_count >= 0);

-- Kundinnen ohne E-Mail dürfen im CRM gespeichert werden, werden aber nicht
-- als Empfängerinnen einer E-Mail-Kampagne eingeplant.
create or replace function public.queue_marketing_campaign(requested_campaign_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  campaign public.marketing_campaigns;
  recipient_count integer;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  select * into campaign from public.marketing_campaigns where id = requested_campaign_id for update;
  if campaign.id is null then raise exception 'Kampagne nicht gefunden.'; end if;
  if campaign.status = 'sent' then raise exception 'Diese Kampagne wurde bereits versendet.'; end if;
  if campaign.queued_at is not null then raise exception 'Diese Kampagne wurde bereits eingeplant.'; end if;

  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
  select 'campaign', p.email, p.full_name, campaign.subject,
    jsonb_build_object('campaign_id', campaign.id, 'content', campaign.content),
    coalesce(campaign.scheduled_at, now())
  from public.customers p
  where p.marketing_consent = true
    and p.email is not null;
  get diagnostics recipient_count = row_count;

  update public.marketing_campaigns
  set status = case when recipient_count = 0 then 'sent' else 'scheduled' end,
      queued_at = now(),
      sent_at = case when recipient_count = 0 then now() else null end
  where id = campaign.id;
  return recipient_count;
end;
$$;
