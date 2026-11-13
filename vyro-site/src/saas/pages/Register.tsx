import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callFn, supabase } from '../api';
import { ErrorNote, Field, useAction } from '../ui';

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
    callFn<InviteInfo>('register', { action: 'lookup', token })
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
      const { email } = await callFn<{ email: string }>('register', {
        action: 'complete',
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
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: form.password });
      if (signInError || !data.user) {
        navigate('/login');
        return;
      }
      if (logo) {
        const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', data.user.id).single();
        const ext = (logo.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${profile?.company_id}/logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('logos').upload(path, logo, { upsert: true });
        if (!upErr) await supabase.from('companies').update({ logo_path: path }).eq('id', profile?.company_id);
      }
      navigate('/portal');
    });
  };

  if (invalid) {
    return (
      <div className="sa sa-auth">
        <div className="sa-card sa-auth__card">
          <h1>VYRO</h1>
          <p className="sa-error">{invalid}</p>
          <p className="sa-muted">Ask VYRO to send you a new registration link.</p>
        </div>
      </div>
    );
  }
  if (!invite) return <div className="sa sa-center">Loading…</div>;

  return (
    <div className="sa sa-auth">
      <form className="sa-card sa-auth__card sa-auth__card--wide" onSubmit={submit}>
        <h1>Create your VYRO account</h1>
        <p className="sa-muted">
          You are registering <strong>{invite.company_name}</strong>. Your sign-in email is{' '}
          <strong>{invite.email}</strong>.
        </p>
        <div className="sa-grid2">
          <Field label="Your name">
            <input value={form.full_name} onChange={set('full_name')} required autoComplete="name" />
          </Field>
          <Field label="Phone">
            <input value={form.contact_phone} onChange={set('contact_phone')} autoComplete="tel" />
          </Field>
          <Field label="Company name">
            <input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Store name">
            <input value={form.store_name} onChange={set('store_name')} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={set('website')} placeholder="yourstore.com" />
          </Field>
          <Field label="Logo" hint="PNG, JPG or WebP, up to 1 MB">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <Field label="Address">
          <input value={form.address} onChange={set('address')} autoComplete="street-address" />
        </Field>
        <div className="sa-grid2">
          <Field label="Password" hint="At least 10 characters">
            <input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" />
          </Field>
          <Field label="Repeat password">
            <input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
          </Field>
        </div>
        <ErrorNote message={error} />
        <button className="sa-btn" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
