import { useState } from 'react';
import { getInitialTryOnProduct, TryOnViewer } from '../demo/TryOnViewer';
import type { Product } from '../demo/types';

/** Try-on without the site chrome, shown inside the VYRO widget on client websites. */
export function EmbedTryOnPage() {
  const [activeProduct, setActiveProduct] = useState<Product>(getInitialTryOnProduct);
  return (
    <div className="tryon-page tryon-page--embed">
      <TryOnViewer activeProduct={activeProduct} onProductChange={setActiveProduct} />
    </div>
  );
}
