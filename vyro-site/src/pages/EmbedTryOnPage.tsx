import { useEffect, useState } from 'react';
import { TryOnViewer } from '../demo/TryOnViewer';
import type { NecklaceOptions, Product, ProductType } from '../demo/types';

interface CatalogItem {
  id: string;
  type: ProductType;
  name: string;
  sku: string | null;
  price: string | null;
  description: string | null;
  image: string;
  options: Partial<NecklaceOptions> | null;
}

const TYPES: ProductType[] = ['ring', 'watch', 'glasses', 'necklace'];

/** Validates what the loader sent; anything malformed is dropped. */
function toProducts(list: unknown): { products: Product[]; skus: Map<string, string> } {
  const products: Product[] = [];
  const skus = new Map<string, string>();
  for (const raw of Array.isArray(list) ? (list as CatalogItem[]) : []) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') continue;
    if (!TYPES.includes(raw.type) || typeof raw.image !== 'string' || !/^https:\/\//.test(raw.image)) continue;
    const o = raw.options ?? {};
    products.push({
      id: raw.id,
      name: raw.name,
      type: raw.type,
      image: raw.image,
      price: typeof raw.price === 'string' ? raw.price : '',
      description: typeof raw.description === 'string' ? raw.description : '',
      necklace:
        raw.type === 'necklace'
          ? {
              kind: o.kind === 'pearls' ? 'pearls' : 'chain',
              chainColor: o.chainColor === 'silver' ? 'silver' : 'gold',
              lengthCm: Number(o.lengthCm) || undefined,
              pearlMm: Number(o.pearlMm) || undefined,
              pendantMm: Number(o.pendantMm) || undefined,
            }
          : undefined,
    });
    if (typeof raw.sku === 'string') skus.set(raw.sku, raw.id);
  }
  return { products, skus };
}

/**
 * The try-on shown inside the VYRO widget on a client's website. It has no
 * catalogue of its own: the loader on the client's page (which passed the
 * licence and domain check) hands it that client's products.
 */
export function EmbedTryOnPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [active, setActive] = useState<Product | null>(null);

  useEffect(() => {
    if (window.parent === window) return; // opened directly, not inside a widget
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== 'vyro:catalog') return;
      const { products: list, skus } = toProducts(e.data.products);
      setProducts(list);
      const wanted = typeof e.data.select === 'string' ? skus.get(e.data.select) : undefined;
      setActive(list.find((p) => p.id === wanted) ?? list[0] ?? null);
    };
    window.addEventListener('message', onMessage);
    // The catalogue holds nothing secret, and the parent's address is unknown here.
    window.parent.postMessage({ type: 'vyro:embed-ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!products || !active) {
    return (
      <div className="tryon-page tryon-page--embed" style={{ display: 'grid', placeItems: 'center', color: '#a3a1b8', padding: 24, textAlign: 'center' }}>
        {window.parent === window
          ? 'This page is part of the VYRO widget and opens from a store that uses VYRO.'
          : products
            ? 'No products are available to try on yet.'
            : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="tryon-page tryon-page--embed">
      <TryOnViewer activeProduct={active} onProductChange={setActive} products={products} />
    </div>
  );
}
