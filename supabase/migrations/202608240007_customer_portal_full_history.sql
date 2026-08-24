-- Kundinnen sollen im Kundenportal (pages/booking.html, "Mein Konto") ihre
-- komplette Terminhistorie sehen -- auch Termine, die Liliane manuell im
-- Dashboard für sie eingetragen hat (dort wird appointments.customer_id nie
-- gesetzt, nur customer_email). Die bisherige Policy erlaubte nur den
-- Zugriff über customer_id = auth.uid(), also ausschliesslich selbst online
-- gebuchte Termine.

drop policy if exists "appointments own or admin read" on public.appointments;
create policy "appointments own or admin read" on public.appointments for select using (
  customer_id = auth.uid()
  or public.is_admin()
  or (
    customer_email is not null
    and lower(customer_email) = lower((select email from public.profiles where id = auth.uid()))
  )
);
