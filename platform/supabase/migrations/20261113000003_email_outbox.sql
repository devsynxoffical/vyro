-- Notifications double as an email outbox: billing-run emails every
-- notification that has not been emailed yet.
alter table public.notifications add column emailed_at timestamptz;
create index notifications_unsent on public.notifications (created_at) where emailed_at is null;
