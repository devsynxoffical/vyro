# VYRO platform (SaaS)

Client accounts, subscriptions, invoices, payments through OMPAY TruePay, and
automatic on/off control of VYRO on client websites. It runs on ordinary PHP +
MySQL hosting next to the website; there is no separate server to manage.

```
vyro-site/public/api        the PHP API (deployed with the site at /api)
  schema/NNN_*.sql          database changes, applied automatically at deploy
  lib/billing.php           billing engine      lib/ompay.php   OMPAY client
  lib/auth.php              sessions, permissions, two-step login
  lib/routes.php            every endpoint
vyro-site/public/vyro.js    the script clients install on their websites
vyro-site/public/uploads    logos and product images (created on the server)
vyro-site/src/saas          client portal (/portal) and admin console (/admin)
platform/tests/php          automated tests
.github/workflows           deploy, hourly billing run, create admin
```

Requires **PHP 8.1 or newer** (with the pdo_mysql, curl, gd and fileinfo
extensions, all standard on cPanel) and MySQL 5.7+ / MariaDB 10.3+.

## How it works

1. **Admin creates a client** (`/admin/clients/new`): company, custom setup fee,
   monthly or yearly price, products included, optional first billing date and
   contract. A one-time registration link is produced.
2. **Client registers** with that link (company details, logo, password) and pays
   the setup fee on OMPAY's hosted page. OMPAY saves the card and returns a token;
   VYRO never sees the card number.
3. **Setup fee paid → subscription active → VYRO switches on.**
4. **Every hour the billing run** creates invoices that are due (base price plus
   any one-off extra charges), charges the saved card, retries failed payments
   once a day during the grace period, and suspends clients whose grace period
   ran out. Cancelled subscriptions end when their paid period ends.
5. **The widget** asks `/api/widget-status` whether the client is live and which
   products to show. Admins can also force it on or off per client.

OMPAY has no webhooks, so results are confirmed with their status-inquiry API:
when the client returns from the payment page, and again in every billing run.

## Go live

### 1. Add the secrets (once)

GitHub → repository → Settings → Secrets and variables → Actions.

**Secrets** tab:

| Name | Value |
|---|---|
| `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | your FTP account |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | the MySQL database and its user |
| `CRON_SECRET` | any long random string (40+ characters) |
| `OMPAY_API_KEY`, `OMPAY_API_SECRET` | from OMPAY (add when you have them) |

**Variables** tab:

| Name | Value |
|---|---|
| `APP_URL` | the site address, e.g. `https://vyroes.tech` (no trailing slash) |
| `OMPAY_BASE_URL` | leave unset for the OMPAY sandbox; `https://api.truepay.ompay.om` for live payments |
| `ADMIN_EMAILS` | where admin notifications are emailed (comma separated) |
| `EMAIL_FROM` | e.g. `VYRO <billing@vyroes.tech>` |
| `VITE_INVOICE_FROM` | seller details printed on invoices, lines separated by `\n` |

The database user must have all privileges on the database (cPanel → MySQL
Databases → add user to database → All privileges).

### 2. Deploy

Merging to `main` (or Actions → "Deploy website" → Run workflow) builds the
site, writes the server's settings file from the secrets, uploads everything
over FTPS and creates or updates the database tables. Nothing is done by hand
in phpMyAdmin; you can use it to look at the data.

### 3. Create your admin login

Actions → "Create admin account" → Run workflow → enter your email. The run
log shows a one-time link (valid 24 hours) to choose your password. Sign in at
`/login`, then turn on two-step login under Settings → Security.

### 4. Billing schedule

The "Billing run" workflow calls the billing job every hour once it is on the
`main` branch. If you prefer the server to do it, add a cPanel cron job instead:

```bash
curl -fsS -X POST -H "X-Cron-Secret: YOUR_CRON_SECRET" https://YOUR-DOMAIN/api/cron/billing-run
```

## What to ask OMPAY to enable

On the merchant account (sandbox first, then production):

- **Bank-hosted payments – Forced Saved Cards** (the hosted page saves the card)
- **Card tokenization**
- **Merchant-hosted token payments without CVV and without OTP** (the unattended
  monthly charge). If the bank still asks for OTP on a charge, VYRO marks the
  invoice failed and the client pays it from their dashboard.
- **Refund / reverse** (used to give back the small card-check charge)

Ask them to confirm which card types can be charged by token without OTP
(Visa/Mastercard credit and debit, local OmanNet debit), and whether Apple Pay
is offered on the hosted page.

## Security

MySQL has no built-in per-client data isolation, so it is enforced in the API:

- Every endpoint first checks who is signed in, and every query for client
  data is limited to that client's company. Asking for another company's
  invoice, payment or product answers "not found".
- Only admins can change plans, prices, extras, invoice status or the widget
  switch. A client cannot mark an invoice paid.
- Sign-in uses an HttpOnly, SameSite session cookie; every change must also
  carry the session's CSRF token. Passwords are stored hashed (bcrypt).
- Password guessing is throttled; admins can add authenticator two-step login.
- Registration is by one-time invite link (stored hashed, expires in 7 days).
- Card tokens never leave the server; card numbers never reach VYRO.
- Uploaded images are checked by their real content, renamed randomly, and the
  uploads folder refuses to serve anything executable.
- Database password, OMPAY keys and the cron secret live only in GitHub
  secrets and in `api/config.php` on the server (never in git, and not
  readable over the web).
- Each invoice is claimed atomically before a charge, so overlapping requests
  or billing runs cannot charge twice; a charge whose result is unknown is
  never retried until OMPAY confirms what happened.

## Tests

Need PHP 8.1+ and a local MySQL/MariaDB with an empty database
(`VYRO_TEST_DB_HOST/NAME/USER/PASSWORD`, default `vyro_test` / `vyro` / `testpass`).

```bash
php platform/tests/php/billing_test.php
```

```bash
php platform/tests/php/http_test.php
```

The first covers the billing rules; the second drives the real API over HTTP
(logins, permissions between clients, payments against a fake OMPAY server,
uploads, throttling).

## Local development

```bash
VYRO_CONFIG=/path/to/config.php php -S 127.0.0.1:8791 platform/tests/php/router.php
```

```bash
cd vyro-site && npm run dev
```

Vite forwards `/api` and `/uploads` to the PHP server. Copy
`vyro-site/public/api/config.sample.php` for the config file.

## Client products

Each client manages their own try-on catalogue in the portal (admins can do it
for them on the client page): type, name, product code, price and a
transparent PNG/WebP cut-out. The number of live products is capped by the
plan's "products included"; the widget serves only that client's live
products, only on their allowed websites, only while the subscription is live.

- Floating button (default): opens the try-on with all products.
- Product page button: `<button data-vyro-open="SKU">Try it on</button>` opens
  that product. `data-button="off"` on the script tag hides the floating button.
- `window.VYRO.open(sku)`, `VYRO.close()`, `VYRO.ready(fn)` for custom code.
- Elements marked `data-vyro-show hidden` are revealed only while VYRO is live.

Images: ring from above with the band left to right; watch flat with the strap
top to bottom; glasses from the front; for a necklace upload the pendant only
(the chain or pearl strand is drawn in 3D from the chosen style and length).

## Invoices

`/portal/invoices/:id` is a printable invoice (browser "Save as PDF"). VAT is
not calculated: prices entered are treated as final amounts and the invoice
shows no tax line. Add this before invoicing VAT-registered clients.

## Console design system

The portal and admin console share one design system in `vyro-site/src/saas`:
`styles/tokens.css` (colours, type, spacing; the website's dark theme and brand
gradient), `styles/console.css` (components), `ui.tsx` and `shell.tsx`. Fonts
are the website's Google Fonts (Sora, Inter, IBM Plex Mono).

## Not built yet

- VAT lines on invoices.
- Apple Pay / Samsung Pay buttons on VYRO's own pages (OMPAY's hosted page may
  offer them; to be confirmed with OMPAY).
- Per-product fit adjustment (size/position fine-tuning for an unusual image).
