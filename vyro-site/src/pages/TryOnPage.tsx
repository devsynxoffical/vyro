import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookDemoButton, RequestPricingButton } from '../components/site/SiteCta';
import { getInitialTryOnProduct, TryOnViewer } from '../demo/TryOnViewer';
import type { Product } from '../demo/types';

export function TryOnPage() {
  const [activeProduct, setActiveProduct] = useState<Product>(getInitialTryOnProduct);

  return (
    <div className="tryon-page">
      <div className="tryon-page__bar">
        <Link to="/" className="tryon-page__back">
          ← Back to site
        </Link>
        <span className="tryon-page__title">Live try-on</span>
        <div className="tryon-page__actions">
          <RequestPricingButton className="tryon-page__link" />
          <BookDemoButton className="tryon-page__link tryon-page__link--solid">
            <span>Book a Demo</span>
          </BookDemoButton>
        </div>
      </div>
      <TryOnViewer activeProduct={activeProduct} onProductChange={setActiveProduct} />
    </div>
  );
}
