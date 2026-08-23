-- Massen-Kampagnen ("Versand einplanen") haben bisher nur marketing_consent
-- geprüft, aber nicht do_not_contact -- eine Kundin, die im Profil auf
-- "Nicht kontaktieren" gesetzt wurde (z. B. nach einer Beschwerde oder
-- einem Widerruf), hätte trotzdem jede Kampagnen-Mail erhalten. Die
-- automatischen Journey-Mails (Bewertung, Wiederbuchung, Geburtstag,
-- Reaktivierung) prüfen do_not_contact bereits korrekt -- Kampagnen ziehen
-- jetzt nach.

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
    and p.email is not null
    and not coalesce(p.do_not_contact, false);
  get diagnostics recipient_count = row_count;

  update public.marketing_campaigns
  set status = case when recipient_count = 0 then 'sent' else 'scheduled' end,
      queued_at = now(),
      sent_at = case when recipient_count = 0 then now() else null end
  where id = campaign.id;
  return recipient_count;
end;
$$;
