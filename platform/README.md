# VYRO platform (SaaS)

Client accounts, subscriptions, invoices, payments through OMPAY TruePay, and
automatic on/off control of VYRO on client websites.

```
platform/supabase/migrations   database: tables, security rules, billing engine
platform/supabase/functions    server code that talks to OMPAY
platform/tests                 automated tests
vyro-site/src/saas             client portal (/portal) and admin dashboard (/admin)
vyro-site/src/widget/loader.js the script clients install (/vyro.js)
```

## How it works

1. **Admin creates a client** (`/admin/new`): company, custom setup fee, monthly or
   yearly price, products included, optional first billing date and contract.
   A one-time registration link is produced.
2. **Client registers** with that link (company details, logo, password) and pays
   the setup fee on OMPAY's hosted page. OMPAY saves the card and returns a token;
   VYRO never sees the card number.
3. **Setup fee paid → subscription active → VYRO switches on.**
4. **Every day the billing run** creates invoices that are due (base price plus
   any one-off extra charges), charges the saved card, retries failed payments
   once a day during the grace period, and suspends clients whose grace period
   ran out. Cancelled subscriptions end when their paid period ends.
5. **The widget** asks `widget-status` whether the client is live. Admins can
   also force it on or off per client.

OMPAY has no webhooks, so results are confirmed with their status-inquiry API:
when the client returns from the payment page, and again in every billing run.

## What to ask OMPAY to enable

On the merchant account (sandbox first, then production):

- **Bank-hosted payments – Forced Saved Cards** (the hosted page saves the card)
- **Card tokenization**
- **Merchant-hosted token payments without CVV and without OTP** (the unattended
  monthly charge). If the bank still asks for OTP on a charge, VYRO marks the
  invoice failed and the client pays it from their dashboard.
- **Refund / reverse** (used to give back the small card-check charge)

Ask them to confirm: which card types can be charged by token without OTP
(Visa/Mastercard credit and debit, local OmanNet debit), and whether Apple Pay
is offered on the hosted page.

## Deploy

1. Create a Supabase project. In **Authentication → Sign In / Providers** turn
   **off** "Allow new users to sign up" (accounts are created only through
   invites) and turn **on** TOTP under multi-factor.
2. Apply the database and deploy the functions:

   ```bash
   cd platform
   supabase link --project-ref YOUR_REF
   supabase db push
   supabase functions deploy
   ```

3. Set the function secrets:

   ```bash
   supabase secrets set \
     OMPAY_BASE_URL=https://api.sandbox.truepay.ompay.om \
     OMPAY_API_KEY=... OMPAY_API_SECRET=... \
     APP_URL=https://your-vyro-site \
     CRON_SECRET="$(openssl rand -hex 32)" \
     RESEND_API_KEY=... EMAIL_FROM="VYRO <billing@your-domain>" ADMIN_EMAILS=you@your-domain
   ```

   `RESEND_API_KEY`/`EMAIL_FROM` are optional; without them notifications appear
   in the dashboards only. For production switch `OMPAY_BASE_URL` to
   `https://api.truepay.ompay.om` with the production key and secret.

4. Schedule the billing run (SQL editor; enable the `pg_cron` and `pg_net`
   extensions first). Hourly keeps payment results and suspensions prompt:

   ```sql
   select cron.schedule('vyro-billing', '5 * * * *', $$
     select net.http_post(
       url := 'https://YOUR_REF.supabase.co/functions/v1/billing-run',
       headers := '{"x-cron-secret": "YOUR_CRON_SECRET"}'::jsonb
     );
   $$);
   ```

5. Create the first admin: add a user in **Authentication → Users**, then

   ```sql
   insert into public.profiles (id, role) values ('THE_USER_ID', 'admin');
   ```

   Sign in at `/login` and set up two-step login under **Settings**.

6. Build the site with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set
   (see `vyro-site/.env.example`) and deploy it as before. `/login`,
   `/register`, `/portal`, `/admin` and `/embed` need the same
   "serve index.html" rewrite the other pages use.

## Security

- Row-level security on every table: a client can only read their own company's
  rows; only admins can change plans, prices, extras and the widget switch.
- Payments, invoice and subscription status are written only by server
  functions. A browser cannot mark an invoice paid.
- Card tokens are not readable from the browser at all; card numbers never
  reach VYRO.
- Registration is by one-time invite link (stored hashed, expires in 7 days).
- The OMPAY secret and the service key exist only in function secrets.
- Each invoice is claimed atomically before a charge, so overlapping billing
  runs cannot charge twice; a charge whose result is unknown is never retried
  until OMPAY confirms what happened.

## Tests

```bash
PGHOST=... PGPORT=... PGUSER=postgres platform/tests/run_db_tests.sh    # security + billing rules
PGHOST=... PGPORT=... PGUSER=postgres platform/tests/run_flow_tests.sh  # full flow with a fake OMPAY (needs deno)
```

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

`/portal/invoices/:id` is a printable invoice (browser "Save as PDF"). Set
`VITE_INVOICE_FROM` to the seller details to print (legal name, CR, address).
VAT is not calculated: if VYRO is VAT-registered, prices entered are treated as
final amounts and the invoice shows no tax line. Add this before invoicing
VAT-registered clients.

## Not built yet

- VAT lines on invoices (see above).
- Apple Pay / Samsung Pay buttons on VYRO's own pages (OMPAY's hosted page may
  offer them; to be confirmed with OMPAY).
- Per-product fit adjustment (size/position fine-tuning for an unusual image).
  Client rings and glasses use the default fit; watches are measured from the
  image automatically.
