# Vyro Marketing Website

Official marketing site for **Vyro** — virtual try-on for fashion & lifestyle brands.

## Pages

| Route | Page |
|-------|------|
| `/` | Home (hero + overview) |
| `/about` | About Vyro |
| `/categories` | Supported categories |
| `/why` | Why Vyro / try-on matters |
| `/demo` | Book a demo |

**Try On** links to: http://vyro.devsynx.com/

## Run locally

```bash
cd vyro-site
npm install
npm run dev
```

## Build

```bash
npm run build
```

Deploy the `dist/` folder (Vercel / Netlify recommended for HTTPS + free SSL).

## Brand assets

- `public/brand/vyro-logo.PNG`
- `public/brand/icon-dark.PNG`
- `public/brand/icon-light.PNG`
- `public/brand/hero.png`

Update email / Instagram in `Footer.tsx` and `DemoPage.tsx` when final.
