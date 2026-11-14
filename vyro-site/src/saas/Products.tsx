import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import { supabase } from './api';
import {
  Button, Dialog, Empty, ErrorNote, Field, Meter, Panel, SkeletonRows, Status, useAction, useAsk,
} from './ui';

type ProductType = 'ring' | 'watch' | 'glasses' | 'necklace';

interface ProductRow {
  id: string;
  type: ProductType;
  name: string;
  sku: string | null;
  price: string | null;
  image_path: string;
  options: Record<string, unknown>;
  active: boolean;
}

const TYPE_LABEL: Record<ProductType, string> = {
  ring: 'Ring',
  watch: 'Watch',
  glasses: 'Glasses',
  necklace: 'Necklace',
};

const IMAGE_HINT: Record<ProductType, string> = {
  ring: 'The ring seen from above with the stone in the centre and the band running left to right.',
  watch: 'The watch laid flat, face up, with the strap running top to bottom.',
  glasses: 'The frames seen straight from the front.',
  necklace: 'The pendant only (the chain is drawn automatically). For pearls, any picture of the strand.',
};

const imageUrl = (path: string) => supabase.storage.from('products').getPublicUrl(path).data.publicUrl;

function friendly(message: string): string {
  if (message.includes('PRODUCT_LIMIT')) {
    return 'Your plan’s product limit is reached. Switch another product off, or ask VYRO to add products to your plan.';
  }
  if (message.includes('products_sku')) return 'Another product already uses this product code.';
  return 'Could not save the product. Please check the details and try again.';
}

/** A client's try-on catalogue. Used on the client portal and on the admin client page. */
export function ProductsPanel({
  companyId,
  limit,
  onChange,
}: {
  companyId: string;
  limit: number;
  onChange?: () => void;
}) {
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useAction();
  const ask = useAsk();

  const reload = useCallback(() => {
    void supabase
      .from('products')
      .select('id, type, name, sku, price, image_path, options, active')
      .eq('company_id', companyId)
      .order('sort')
      .order('created_at')
      .then(({ data }) => setRows((data ?? []) as ProductRow[]));
  }, [companyId]);
  useEffect(reload, [reload]);

  const changed = () => {
    reload();
    onChange?.();
  };
  const live = (rows ?? []).filter((r) => r.active).length;
  const sample = rows?.find((r) => r.sku)?.sku;

  const toggle = (row: ProductRow) =>
    void run(
      async () => {
        const { error: err } = await supabase.from('products').update({ active: !row.active }).eq('id', row.id);
        if (err) throw new Error(friendly(err.message));
        changed();
      },
      row.active ? 'Product switched off' : 'Product is live',
    );

  const remove = async (row: ProductRow) => {
    const ok = await ask({
      title: `Delete “${row.name}”?`,
      body: 'It disappears from the try-on on your website straight away. This cannot be undone.',
      confirmLabel: 'Delete product',
      danger: true,
    });
    if (!ok) return;
    void run(async () => {
      const { error: err } = await supabase.from('products').delete().eq('id', row.id);
      if (err) throw new Error('Could not delete the product.');
      await supabase.storage.from('products').remove([row.image_path]);
      changed();
    }, 'Product deleted');
  };

  return (
    <>
      <Panel
        flush
        title="Catalogue"
        description={
          <span className="vy-num">
            {live} of {limit} live
          </span>
        }
        action={
          <div className="vy-actions">
            <div style={{ width: 96 }}>
              <Meter value={live} max={limit} />
            </div>
            <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setAdding(true)}>
              Add product
            </Button>
          </div>
        }
        foot={
          sample ? (
            <p className="vy-small vy-muted">
              Open one product from its own page by giving any button its product code:{' '}
              <code>&lt;button data-vyro-open="{sample}"&gt;Try it on&lt;/button&gt;</code>
            </p>
          ) : undefined
        }
      >
        {error && (
          <div style={{ padding: 16 }}>
            <ErrorNote message={error} />
          </div>
        )}
        {rows === null ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <Empty
            icon={<Package />}
            title="No products yet"
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
                Add your first product
              </Button>
            }
          >
            Add the rings, watches, glasses and necklaces your customers can try on.
          </Empty>
        ) : (
          <div className="vy-table-wrap">
            <table className="vy-table vy-table--stack vy-table--hover">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Code</th>
                  <th>Price</th>
                  <th>Website</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="is-primary">
                      <div className="vy-cell">
                        <img className="vy-thumb" src={imageUrl(r.image_path)} alt="" loading="lazy" />
                        <strong>{r.name}</strong>
                      </div>
                    </td>
                    <td data-label="Type">{TYPE_LABEL[r.type]}</td>
                    <td data-label="Code" className="vy-mono">
                      {r.sku ?? '—'}
                    </td>
                    <td data-label="Price">{r.price ?? '—'}</td>
                    <td className="is-aside">
                      <Status tone={r.active ? 'ok' : 'idle'}>{r.active ? 'Live' : 'Off'}</Status>
                    </td>
                    <td className="is-actions">
                      <Button size="sm" disabled={busy} onClick={() => toggle(r)}>
                        {r.active ? 'Switch off' : 'Switch on'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} aria-label={`Delete ${r.name}`} icon={<Trash2 />} onClick={() => void remove(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog drawer open={adding} onClose={() => setAdding(false)} title="Add product">
        <ProductForm
          companyId={companyId}
          full={live >= limit}
          onDone={(saved) => {
            setAdding(false);
            if (saved) changed();
          }}
        />
      </Dialog>
    </>
  );
}

function ProductForm({
  companyId,
  full,
  onDone,
}: {
  companyId: string;
  full: boolean;
  onDone: (saved: boolean) => void;
}) {
  const [type, setType] = useState<ProductType>('ring');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<'chain' | 'pearls'>('chain');
  const [chainColor, setChainColor] = useState<'gold' | 'silver'>('gold');
  const [lengthCm, setLengthCm] = useState('45');
  const [pendantMm, setPendantMm] = useState('15');
  const { busy, error, run } = useAction();

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!file) throw new Error('Choose a product image.');
      if (!['image/png', 'image/webp'].includes(file.type)) {
        throw new Error('Use a PNG or WebP image with a transparent background.');
      }
      if (file.size > 2 * 1024 * 1024) throw new Error('The image must be smaller than 2 MB.');
      const ext = file.type === 'image/webp' ? 'webp' : 'png';
      const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('products').upload(path, file, { contentType: file.type });
      if (upErr) throw new Error('Could not upload the image. Please try again.');
      const { error: err } = await supabase.from('products').insert({
        company_id: companyId,
        type,
        name: name.trim(),
        sku: sku.trim() || null,
        price: price.trim() || null,
        image_path: path,
        active: !full,
        options:
          type === 'necklace'
            ? { kind, chainColor, lengthCm: Number(lengthCm) || 45, pendantMm: Number(pendantMm) || 15 }
            : {},
      });
      if (err) {
        await supabase.storage.from('products').remove([path]);
        throw new Error(friendly(err.message));
      }
      onDone(true);
    }, 'Product added');
  };

  return (
    <form onSubmit={save} className="vy-form">
      <div className="vy-grid2">
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as ProductType)}>
            {(Object.keys(TYPE_LABEL) as ProductType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </Field>
        <Field label="Product code (SKU)" hint="Optional. Lets a button on the product page open this product.">
          <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Price" hint="Optional, shown as typed (e.g. 120 OMR)">
          <input value={price} onChange={(e) => setPrice(e.target.value)} maxLength={40} />
        </Field>
      </div>
      {type === 'necklace' && (
        <div className="vy-grid2">
          <Field label="Necklace style">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'chain' | 'pearls')}>
              <option value="chain">Chain with pendant</option>
              <option value="pearls">Pearl strand</option>
            </select>
          </Field>
          <Field label="Length (cm)">
            <input type="number" min="35" max="90" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
          </Field>
          {kind === 'chain' && (
            <>
              <Field label="Chain colour">
                <select value={chainColor} onChange={(e) => setChainColor(e.target.value as 'gold' | 'silver')}>
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                </select>
              </Field>
              <Field label="Pendant height (mm)" hint="Real size, so it appears true to scale">
                <input type="number" min="4" max="80" value={pendantMm} onChange={(e) => setPendantMm(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      )}
      <Field label="Image" hint={`PNG or WebP with a transparent background, up to 2 MB. ${IMAGE_HINT[type]}`}>
        <input type="file" accept="image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </Field>
      {full && <p className="vy-small vy-muted">Your plan’s live products are all used, so this one is saved switched off.</p>}
      <ErrorNote message={error} />
      <div className="vy-actions vy-actions--end">
        <Button onClick={() => onDone(false)}>Cancel</Button>
        <Button type="submit" variant="primary" busy={busy}>
          Save product
        </Button>
      </div>
    </form>
  );
}
