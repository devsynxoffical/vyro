-- Company logos. Publicly readable (they are shown on dashboards), writable
-- only inside the uploader's own company folder: logos/<company_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy logos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'logos'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));
