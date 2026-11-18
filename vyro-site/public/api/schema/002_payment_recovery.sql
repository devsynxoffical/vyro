-- A checkout the client walked away from is closed so they can pay again, but
-- it is still watched in case the bank reports later that it did go through.
ALTER TABLE payments ADD COLUMN superseded TINYINT(1) NOT NULL DEFAULT 0;

-- When the billing job last ran, so the site can run it itself if the
-- scheduler is late.
ALTER TABLE app_settings ADD COLUMN last_billing_run_at DATETIME NULL;
