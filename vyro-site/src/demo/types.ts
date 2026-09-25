export type ProductType = 'necklace' | 'ring' | 'glasses' | 'watch';

export interface Product {
  id: string;
  name: string;
  shortName?: string;
  type: ProductType;
  image: string;
  price: string;
  description: string;
}

export interface ProductCategory {
  type: ProductType;
  label: string;
  image: string;
  description: string;
}

export const NECKLACE_VARIANTS: Product[] = [
  {
    id: 'necklace-1',
    name: 'Diamond Solitaire Necklace',
    shortName: 'Diamond Solitaire',
    type: 'necklace',
    image: '/products/necklace-diamond.webp',
    price: '$389',
    description: '18k gold chain with a round brilliant diamond solitaire pendant',
  },
  {
    id: 'necklace-2',
    name: 'Classic Pearl Strand',
    shortName: 'Pearl Strand',
    type: 'necklace',
    image: '/products/necklace-pearl.webp',
    price: '$299',
    description: 'Single strand of 7-8mm white Akoya pearls',
  },
  {
    id: 'necklace-3',
    name: 'Emerald Halo Necklace',
    shortName: 'Emerald Halo',
    type: 'necklace',
    image: '/products/necklace-emerald.webp',
    price: '$459',
    description: 'White gold chain with a pear-cut emerald in a diamond halo',
  },
];

export const NECKLACE: Product = NECKLACE_VARIANTS[0];

export const RING_VARIANTS: Product[] = [
  {
    id: 'ring-1',
    name: 'Three-Stone Diamond Ring',
    shortName: 'Three-Stone',
    type: 'ring',
    image: '/products/ring1.png',
    price: '$249',
    description: 'Rose gold three-stone oval diamond ring',
  },
  {
    id: 'ring-2',
    name: 'Ruby Emerald-Cut Ring',
    shortName: 'Ruby Emerald',
    type: 'ring',
    image: '/products/ring2.png',
    price: '$319',
    description: 'Yellow gold band with emerald-cut ruby',
  },
  {
    id: 'ring-3',
    name: 'Rose Gold Solitaire',
    shortName: 'Solitaire',
    type: 'ring',
    image: '/products/ring3.png',
    price: '$279',
    description: 'Rose gold solitaire round diamond ring',
  },
];

export const GLASSES_VARIANTS: Product[] = [
  {
    id: 'glasses-1',
    name: 'Rectangular Matte Frames',
    shortName: 'Matte Black',
    type: 'glasses',
    image: '/products/glasses-frame.png',
    price: '$159',
    description: 'Classic rectangular acetate frames in matte black',
  },
];

export const WATCH_VARIANTS: Product[] = [
  {
    id: 'watch-1',
    name: 'Steel Sunburst Watch',
    shortName: 'Steel',
    type: 'watch',
    image: '/products/watch-steel.png',
    price: '$349',
    description: 'Stainless steel case, black sunburst dial, steel link bracelet',
  },
  {
    id: 'watch-2',
    name: 'Gold Dress Watch',
    shortName: 'Gold & Leather',
    type: 'watch',
    image: '/products/watch-gold.png',
    price: '$429',
    description: 'Gold case, ivory dial, brown leather strap',
  },
  {
    id: 'watch-3',
    name: 'Matte Black Watch',
    shortName: 'Matte Black',
    type: 'watch',
    image: '/products/watch-matte-black.png',
    price: '$329',
    description: 'Matte black steel case and bracelet, minimalist dial',
  },
];

export const WATCH: Product = WATCH_VARIANTS[0];

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    type: 'glasses',
    label: 'Glasses',
    image: GLASSES_VARIANTS[0].image,
    description: 'Face tracking',
  },
  {
    type: 'watch',
    label: 'Watch',
    image: WATCH.image,
    description: 'Wrist tracking',
  },
  {
    type: 'necklace',
    label: 'Necklace',
    image: NECKLACE.image,
    description: 'Face tracking',
  },
  {
    type: 'ring',
    label: 'Ring',
    image: RING_VARIANTS[0].image,
    description: 'Hand tracking',
  },
];

export const PRODUCTS: Product[] = [
  ...GLASSES_VARIANTS,
  ...WATCH_VARIANTS,
  ...NECKLACE_VARIANTS,
  ...RING_VARIANTS,
];

export function getDefaultProduct(type: ProductType): Product {
  switch (type) {
    case 'glasses':
      return GLASSES_VARIANTS[0];
    case 'watch':
      return WATCH;
    case 'necklace':
      return NECKLACE;
    case 'ring':
      return RING_VARIANTS[0];
  }
}

export function getInitialTryOnProduct(): Product {
  return getDefaultProduct('watch');
}
