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

export const NECKLACE: Product = {
  id: 'necklace-1',
  name: 'Pear Amethyst Necklace',
  shortName: 'Pear Amethyst',
  type: 'necklace',
  image: '/products/necklace.png',
  price: '$189',
  description: 'Gold chain with pear-cut amethyst and diamond accents',
};

export const NECKLACE_VARIANTS: Product[] = [
  NECKLACE,
  {
    id: 'necklace-2',
    name: 'Cascading Diamond Necklace',
    shortName: 'Cascading Diamond',
    type: 'necklace',
    image: '/products/necklace1.png',
    price: '$459',
    description: 'Brilliant-cut cascading diamond fringe necklace',
  },
];

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

export const WATCH: Product = {
  id: 'watch-1',
  name: 'Matte Black Watch',
  shortName: 'Matte Black',
  type: 'watch',
  image: '/products/watch-black.png',
  price: '$349',
  description: 'All-black minimalist watch with metal bracelet',
};

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
  WATCH,
  NECKLACE,
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
