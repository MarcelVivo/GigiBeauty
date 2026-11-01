-- 1) Antwortet Liliane im Chat (Dashboard), erhält die Kundin eine kurze
--    E-Mail mit Link ins Kundenkonto -- höchstens eine pro Stunde, damit
--    mehrere Nachrichten am Stück nicht mehrere Mails auslösen.
-- 2) Foto-Speicher: höchstens 10 MB, nur Bildformate.

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation','reminder','cancellation','rescheduled','invoice','campaign','aftercare','review',
  'rebooking','winback','birthday','waitlist','registration_invite','newsletter_welcome','ai_preview_followup',
  'owner_notice','newsletter_confirm','chat_reply'
));

create or replace function public.notify_customer_chat_reply()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  c public.customers;
begin
  if new.sender <> 'admin' then return new; end if;
  select * into c from public.customers where id = new.customer_id;
  if c.id is null or c.email is null or c.do_not_contact then return new; end if;
  if exists (select 1 from public.email_outbox where kind = 'chat_reply' and lower(recipient_email) = lower(c.email) and created_at > now() - interval '1 hour') then
    return new;
  end if;
  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
  values ('chat_reply', c.email, c.full_name, 'Neue Nachricht von Liliane',
    jsonb_build_object('customer_id', c.id, 'preview', left(coalesce(new.message, ''), 220), 'has_photo', new.photo_path is not null,
      'category', new.category, 'account_url', 'https://www.gigibeauty.ch/pages/booking.html?auth=1'),
    -- 2 Minuten Puffer: weitere Nachrichten gleich danach fallen in dieselbe Mail-Stunde.
    now() + interval '2 minutes');
  return new;
end;
$$;

drop trigger if exists customer_media_notify_customer on public.customer_media;
create trigger customer_media_notify_customer after insert on public.customer_media
for each row execute function public.notify_customer_chat_reply();

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
where id in ('customer-photos', 'ai-preview-photos');
