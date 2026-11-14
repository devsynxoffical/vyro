-- VYRO platform schema (MySQL / MariaDB, InnoDB, utf8mb4).
-- Applied automatically by the migration runner; never edit an applied file,
-- add a new numbered one instead. Times are stored in UTC.

CREATE TABLE companies (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  store_name    VARCHAR(150) NULL,
  website       VARCHAR(200) NULL,
  logo_path     VARCHAR(255) NULL,
  contact_name  VARCHAR(150) NULL,
  contact_email VARCHAR(200) NULL,
  contact_phone VARCHAR(40) NULL,
  address       VARCHAR(400) NULL,
  notes         TEXT NULL,
  created_at    DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  email         VARCHAR(200) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10) NOT NULL,
  company_id    CHAR(36) NULL,
  full_name     VARCHAR(150) NULL,
  totp_secret   VARCHAR(64) NULL,
  totp_enabled  TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL,
  UNIQUE KEY users_email (email),
  KEY users_company (company_id),
  CONSTRAINT users_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login sessions. Only a hash of the cookie value is stored.
CREATE TABLE sessions (
  id_hash    CHAR(64) NOT NULL PRIMARY KEY,
  user_id    CHAR(36) NOT NULL,
  csrf       CHAR(64) NOT NULL,
  mfa_ok     TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY sessions_user (user_id),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id    CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  CONSTRAINT resets_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fixed-window counters for login and reset throttling.
CREATE TABLE rate_limits (
  bucket       VARCHAR(120) NOT NULL PRIMARY KEY,
  hits         INT NOT NULL,
  window_start DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plans (
  id                 CHAR(36) NOT NULL PRIMARY KEY,
  company_id         CHAR(36) NOT NULL,
  name               VARCHAR(80) NOT NULL DEFAULT 'VYRO',
  currency           VARCHAR(3) NOT NULL DEFAULT 'OMR',
  setup_fee          DECIMAL(12,3) NOT NULL DEFAULT 0,
  recurring_fee      DECIMAL(12,3) NOT NULL,
  billing_interval   VARCHAR(10) NOT NULL DEFAULT 'monthly',
  product_limit      INT NOT NULL DEFAULT 0,
  billing_start_date DATE NULL,
  contract_months    INT NULL,
  cancellation_terms TEXT NULL,
  created_at         DATETIME NOT NULL,
  UNIQUE KEY plans_company (company_id),
  CONSTRAINT plans_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
  id                   CHAR(36) NOT NULL PRIMARY KEY,
  company_id           CHAR(36) NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending_setup',
  setup_paid_at        DATETIME NULL,
  current_period_start DATE NULL,
  current_period_end   DATE NULL,
  next_billing_date    DATE NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  cancelled_at         DATETIME NULL,
  grace_until          DATETIME NULL,
  contract_end         DATE NULL,
  widget_override      VARCHAR(10) NULL,
  updated_at           DATETIME NOT NULL,
  UNIQUE KEY subscriptions_company (company_id),
  KEY subscriptions_due (status, next_billing_date),
  CONSTRAINT subscriptions_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_methods (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  company_id  CHAR(36) NOT NULL,
  ompay_token VARCHAR(200) NOT NULL,
  brand       VARCHAR(40) NULL,
  masked_pan  VARCHAR(40) NULL,
  is_default  TINYINT(1) NOT NULL DEFAULT 1,
  revoked_at  DATETIME NULL,
  created_at  DATETIME NOT NULL,
  KEY payment_methods_company (company_id, is_default),
  CONSTRAINT payment_methods_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE counters (
  name  VARCHAR(40) NOT NULL PRIMARY KEY,
  value BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO counters (name, value) VALUES ('invoice', 1000);

CREATE TABLE invoices (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  number          VARCHAR(30) NOT NULL,
  company_id      CHAR(36) NOT NULL,
  kind            VARCHAR(15) NOT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'open',
  currency        VARCHAR(3) NOT NULL DEFAULT 'OMR',
  total           DECIMAL(12,3) NOT NULL DEFAULT 0,
  period_start    DATE NULL,
  period_end      DATE NULL,
  -- Set only on subscription invoices: the unique key below then makes it
  -- impossible to bill the same period twice.
  period_key      DATE NULL,
  due_date        DATE NOT NULL,
  paid_at         DATETIME NULL,
  attempts        INT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  created_at      DATETIME NOT NULL,
  UNIQUE KEY invoices_number (number),
  UNIQUE KEY invoices_one_per_period (company_id, period_key),
  KEY invoices_company (company_id, created_at),
  KEY invoices_status (status),
  CONSTRAINT invoices_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_items (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  invoice_id  CHAR(36) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount      DECIMAL(12,3) NOT NULL,
  created_at  DATETIME NOT NULL,
  KEY invoice_items_invoice (invoice_id),
  CONSTRAINT invoice_items_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE extra_charges (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  company_id  CHAR(36) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount      DECIMAL(12,3) NOT NULL,
  bill_on     DATE NOT NULL,
  invoice_id  CHAR(36) NULL,
  created_by  CHAR(36) NULL,
  created_at  DATETIME NOT NULL,
  KEY extra_charges_company (company_id, invoice_id),
  CONSTRAINT extra_charges_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT extra_charges_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id                   CHAR(36) NOT NULL PRIMARY KEY,
  company_id           CHAR(36) NOT NULL,
  invoice_id           CHAR(36) NULL,
  flow                 VARCHAR(15) NOT NULL,
  amount               DECIMAL(12,3) NOT NULL,
  currency             VARCHAR(3) NOT NULL DEFAULT 'OMR',
  status               VARCHAR(12) NOT NULL DEFAULT 'processing',
  ompay_transaction_id VARCHAR(100) NULL,
  error_message        VARCHAR(500) NULL,
  outcome_unconfirmed  TINYINT(1) NOT NULL DEFAULT 0,
  card_brand           VARCHAR(40) NULL,
  card_masked          VARCHAR(40) NULL,
  created_at           DATETIME NOT NULL,
  updated_at           DATETIME NOT NULL,
  UNIQUE KEY payments_tx (ompay_transaction_id),
  KEY payments_invoice (invoice_id),
  KEY payments_status (status, created_at),
  CONSTRAINT payments_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT payments_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE widget_keys (
  company_id      CHAR(36) NOT NULL PRIMARY KEY,
  public_key      CHAR(40) NOT NULL,
  allowed_domains TEXT NOT NULL,
  created_at      DATETIME NOT NULL,
  UNIQUE KEY widget_keys_key (public_key),
  CONSTRAINT widget_keys_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time registration links. Only the hash of the link token is stored.
CREATE TABLE invites (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  email      VARCHAR(200) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY invites_token (token_hash),
  CONSTRAINT invites_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  audience   VARCHAR(10) NOT NULL,
  company_id CHAR(36) NULL,
  kind       VARCHAR(40) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       VARCHAR(600) NULL,
  read_at    DATETIME NULL,
  emailed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY notifications_feed (audience, created_at),
  KEY notifications_unsent (emailed_at, created_at),
  CONSTRAINT notifications_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_settings (
  id                TINYINT NOT NULL PRIMARY KEY,
  grace_days        INT NOT NULL DEFAULT 5,
  max_auto_attempts INT NOT NULL DEFAULT 3,
  card_check_amount DECIMAL(12,3) NOT NULL DEFAULT 0.100,
  reminder_days     INT NOT NULL DEFAULT 3
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO app_settings (id) VALUES (1);

CREATE TABLE products (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  company_id  CHAR(36) NOT NULL,
  type        VARCHAR(10) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  sku         VARCHAR(80) NULL,
  price       VARCHAR(40) NULL,
  description VARCHAR(500) NULL,
  image_path  VARCHAR(255) NOT NULL,
  options     TEXT NOT NULL,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  sort        INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL,
  UNIQUE KEY products_sku (company_id, sku),
  KEY products_company (company_id, sort, created_at),
  CONSTRAINT products_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
