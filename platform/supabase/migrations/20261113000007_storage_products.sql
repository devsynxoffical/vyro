-- Product images. Publicly readable (they are shown on client websites),
-- writable only inside the uploader's own company folder: products/<company_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 2097152, array['image/png', 'image/webp'])
on conflict (id) do nothing;

create policy products_img_write on storage.objects for insert to authenticated
  with check (bucket_id = 'products'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));
create policy products_img_update on storage.objects for update to authenticated
  using (bucket_id = 'products'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));
create policy products_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'products'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_company_id()::text));
