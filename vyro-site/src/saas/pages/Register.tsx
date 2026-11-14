import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth, type MeResponse } from '../auth';
import { Button, ErrorNote, Field, Notice, useAction } from '../ui';
import { AuthLayout } from './AuthLayout';

interface InviteInfo {
  email: string;
  company_name: string;
  store_name: string | null;
  website: string | null;
  contact_phone: string | null;
  address: string | null;
}

/** Registration from a one-time invite link sent by VYRO. */
export function Register() {
  const [params] = useSearchParams();
  const token = params.get('invite') ?? '';
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    name: '',
    store_name: '',
    website: '',
    contact_phone: '',
    address: '',
    password: '',
    confirm: '',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    api.post<InviteInfo>('register/lookup', { token })
      .then((info) => {
        setInvite(info);
        setForm((f) => ({
          ...f,
          name: info.company_name ?? '',
          store_name: info.store_name ?? '',
          website: info.website ?? '',
          contact_phone: info.contact_phone ?? '',
          address: info.address ?? '',
        }));
      })
      .catch((err: Error) => setInvalid(err.message));
  }, [token]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (form.password.length < 10) throw new Error('Password must be at least 10 characters.');
      if (form.password !== form.confirm) throw new Error('The two passwords do not match.');
      // Registering also signs the client in.
      const me = await api.post<MeResponse>('register/complete', {
        token,
        password: form.password,
        full_name: form.full_name,
        company: {
          name: form.name,
          store_name: form.store_name,
          website: form.website,
          contact_phone: form.contact_phone,
          address: form.address,
        },
      });
      if (logo) {
        const data = new FormData();
        data.append('file', logo);
        await api.upload('portal/logo', data).catch(() => {}); // a logo problem must not block registration
      }
      await refresh(me);
      navigate('/portal');
    });
  };

  if (invalid) {
    return (
      <AuthLayout>
        <h1>This link cannot be used</h1>
        <Notice tone="bad" title={invalid}>
          Ask VYRO to send you a new registration link.
        </Notice>
      </AuthLayout>
    );
  }
  if (!invite) return <div className="vy vy-fullstate">Checking your invitation…</div>;

  return (
    <AuthLayout wide>
      <h1>Create your account</h1>
      <p>
        You are registering <strong>{invite.company_name}</strong>. You will sign in as <strong>{invite.email}</strong>.
      </p>
      <form className="vy-form" onSubmit={submit}>
        <div className="vy-grid2">
          <Field label="Your name">
            <input value={form.full_name} onChange={set('full_name')} required autoComplete="name" />
          </Field>
          <Field label="Phone">
            <input value={form.contact_phone} onChange={set('contact_phone')} autoComplete="tel" inputMode="tel" />
          </Field>
          <Field label="Company name">
            <input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Store name">
            <input value={form.store_name} onChange={set('store_name')} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={set('website')} placeholder="yourstore.com" inputMode="url" />
          </Field>
          <Field label="Logo" hint="PNG, JPG or WebP, up to 1 MB">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        <Field label="Address">
          <input value={form.address} onChange={set('address')} autoComplete="street-address" />
        </Field>
        <div className="vy-grid2">
          <Field label="Password" hint="At least 10 characters">
            <input type="password" value={form.password} onChange={set('password')} required minLength={10} autoComplete="new-password" />
          </Field>
          <Field label="Repeat password">
            <input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
          </Field>
        </div>
        <ErrorNote message={error} />
        <Button type="submit" variant="primary" busy={busy} block>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
