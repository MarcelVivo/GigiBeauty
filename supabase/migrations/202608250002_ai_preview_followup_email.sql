-- 24h "did you want to book that look?" follow-up email.
--
-- Fires once a logged-in customer's generated Beauty Konfigurator look gets
-- auto-saved into her account (assets/js/booking.js -> window.gigiSaveAiLook
-- inserts into customer_media with category='chat', sender='customer', and a
-- message starting with "✦ KI-Vorschau:") -- independent of the separate
-- admin-consent flow (ai_preview_requests), which has no reliable e-mail
-- address to use since it also covers anonymous/logged-out visitors.
--
-- Actual sending still goes through the existing email_outbox +
-- process-booking-emails pipeline (Supabase Cron, every 5 min, unchanged).
-- The Edge Function additionally re-checks at send time whether she has
-- since booked an appointment, and skips the send if so.

-- 1) New automation rule -- shows up with a working on/off toggle and
--    editable subject/content in the dashboard's existing "Marketing"
--    automation cards (assets/js/dashboard.js), no dashboard code needed.
insert into public.automation_rules (rule_key, name, description, active, delay_hours, channel, requires_marketing_consent, subject_template, content_template)
values (
  'ai_preview_followup',
  'KI-Vorschau Follow-up',
  'Erinnerung 24 Std. nach einer KI-Look-Vorschau, falls noch kein Termin gebucht wurde.',
  true,
  24,
  'email',
  true,
  'Dein neuer Look wartet noch auf dich ✦',
  'Vor Kurzem hast du dir mit unserem Beauty Konfigurator angesehen, wie {{look}} dir stehen könnte – und wir finden, das Ergebnis kann sich sehen lassen. ✦ Dein Vorschau-Foto haben wir für dich aufbewahrt, du findest es jederzeit in deinem Kundenkonto wieder. Lust, aus der Vorschau Wirklichkeit werden zu lassen?'
)
on conflict (rule_key) do nothing;

-- 2) Widen the email_outbox kind constraint (same drop/re-add pattern as
--    every previous new email kind).
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation','reminder','cancellation','rescheduled','invoice','campaign','aftercare','review',
  'rebooking','winback','birthday','waitlist','registration_invite','newsletter_welcome','ai_preview_followup'
));

-- 3) Queue the follow-up the moment the look is saved to her account.
create or replace function public.queue_ai_preview_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  cust record;
  look_label text;
  content_text text;
begin
  if new.category <> 'chat' or new.sender <> 'customer' or new.message is null
     or new.message not like '✦ KI-Vorschau:%' or new.customer_id is null then
    return new;
  end if;

  select * into rule from public.automation_rules where rule_key = 'ai_preview_followup';
  if not coalesce(rule.active, false) then
    return new;
  end if;

  select * into cust from public.customers where id = new.customer_id;
  if cust.email is null
     or not coalesce(cust.marketing_consent, false)
     or coalesce(cust.do_not_contact, false) then
    return new;
  end if;

  -- Idempotent: never queue a second follow-up for the same generated look.
  if exists (
    select 1 from public.email_outbox
    where kind = 'ai_preview_followup' and payload ->> 'customer_media_id' = new.id::text
  ) then
    return new;
  end if;

  look_label := trim(substring(new.message from 'KI-Vorschau:\s*([^—]+)'));
  content_text := replace(
    coalesce(rule.content_template, 'Vor Kurzem hast du dir mit unserem Beauty Konfigurator angesehen, wie {{look}} dir stehen könnte.'),
    '{{look}}',
    coalesce(nullif(look_label, ''), 'dein neuer Look')
  );

  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, scheduled_for, payload)
  values (
    'ai_preview_followup',
    cust.email,
    cust.full_name,
    coalesce(rule.subject_template, 'Dein neuer Look wartet noch auf dich ✦'),
    now() + interval '24 hours',
    jsonb_build_object(
      'customer_id', cust.id,
      'customer_media_id', new.id,
      'queued_at', new.created_at,
      'content', content_text,
      'booking_url', 'https://www.gigibeauty.ch/pages/booking.html'
    )
  );

  return new;
end;
$$;

drop trigger if exists customer_media_ai_preview_followup on public.customer_media;
create trigger customer_media_ai_preview_followup
after insert on public.customer_media
for each row execute function public.queue_ai_preview_followup();
