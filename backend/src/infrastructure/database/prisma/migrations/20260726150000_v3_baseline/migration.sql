-- ============================================================================
-- DONG DA SYSTEM v3.0 - DATABASE DRAFT FOR REVIEW
-- PostgreSQL 15+
--
-- Purpose:
--   1. Separate employees from users.
--   2. Link each employee to one working branch.
--   3. Require open shift only for customer-facing transactions.
--   4. Allow fund transfer, bank movement, cash movement without shift.
--   5. Use ledger as financial source of truth.
--
-- This is a review draft, not a migration script.
-- ============================================================================


CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE branch_type AS ENUM ('HEAD_OFFICE', 'BRANCH');
CREATE TYPE record_status AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');
CREATE TYPE employee_status AS ENUM ('ACTIVE', 'INACTIVE', 'LEFT', 'SUSPENDED');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED');

CREATE TYPE shift_status AS ENUM (
    'OPEN',
    'ACTIVE',
    'CLOSING',
    'CLOSED',
    'REVIEW',
    'APPROVED',
    'CANCELLED'
);

CREATE TYPE operation_code AS ENUM (
    'WU',
    'MG',
    'FX',
    'DOMESTIC_TRANSFER',
    'FUND_TRANSFER',
    'BANK_DEPOSIT',
    'BANK_WITHDRAW',
    'CASH_IN',
    'CASH_OUT',
    'DEBT_MOVEMENT',
    'CASH_COUNT'
);

CREATE TYPE service_provider AS ENUM ('WU', 'MG', 'BANK', 'INTERNAL');
CREATE TYPE journal_scope AS ENUM ('COMPANY', 'BRANCH');
CREATE TYPE import_status AS ENUM ('UPLOADED', 'PARSED', 'MATCHED', 'PENDING_REVIEW', 'APPROVED', 'POSTED', 'REJECTED', 'FAILED');
CREATE TYPE reconciliation_status AS ENUM ('DRAFT', 'MATCHED', 'PENDING_REVIEW', 'APPROVED', 'POSTED', 'REJECTED');
CREATE TYPE reconciliation_item_status AS ENUM ('MATCHED', 'MISSING_IN_SYSTEM', 'MISSING_IN_JOURNAL', 'AMOUNT_VARIANCE', 'BRANCH_VARIANCE', 'MANUAL_MATCHED', 'IGNORED');
CREATE TYPE debt_movement_type AS ENUM ('EXPECTED_DEBT', 'ACTUAL_DEBT', 'ADJUSTMENT', 'SETTLEMENT', 'REVERSAL');
CREATE TYPE exchange_rate_type AS ENUM ('PAID_BUY', 'PAID_SELL', 'WU_SYSTEM', 'WU_PROVIDER', 'MG_SYSTEM', 'FX_BUY', 'FX_SELL');
CREATE TYPE rate_status AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'REJECTED');
CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE approval_action AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'CANCEL');
CREATE TYPE business_day_status AS ENUM ('OPEN', 'PENDING_CLOSE', 'CLOSED', 'REOPENED');
CREATE TYPE customer_status AS ENUM ('ACTIVE', 'WATCHLIST', 'BLOCKED', 'INACTIVE');
CREATE TYPE identification_type AS ENUM ('CCCD', 'PASSPORT', 'DRIVER_LICENSE', 'OTHER');

CREATE TYPE transaction_status AS ENUM (
    'DRAFT',
    'COMPLETED',
    'VOIDED',
    'CANCELLED'
);

CREATE TYPE workflow_status AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'POSTED',
    'REJECTED',
    'CANCELLED',
    'REVERSED'
);

CREATE TYPE currency_code AS ENUM (
    'VND',
    'USD',
    'EUR',
    'AUD',
    'JPY',
    'GBP',
    'SGD',
    'THB',
    'CNY',
    'HKD',
    'KRW'
);

CREATE TYPE fund_account_type AS ENUM (
    'CASH',
    'BANK',
    'FUND_A',
    'DEBT'
);

CREATE TYPE ledger_source_type AS ENUM (
    'CUSTOMER_TRANSACTION',
    'FUND_TRANSFER',
    'BANK_MOVEMENT',
    'CASH_MOVEMENT',
    'DEBT_MOVEMENT',
    'CASH_COUNT',
    'JOURNAL_RECONCILIATION',
    'DAY_CLOSING'
);

CREATE TYPE ledger_entry_status AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE ledger_direction AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE bank_movement_type AS ENUM ('DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT', 'RECONCILIATION');
CREATE TYPE cash_movement_type AS ENUM ('CASH_IN', 'CASH_OUT', 'INTERNAL_EXPENSE', 'ADJUSTMENT');
CREATE TYPE fund_transfer_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'CONFIRMED', 'POSTED', 'REJECTED', 'CANCELLED');

-- ============================================================================
-- COMMON
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- ORGANIZATION
-- ============================================================================

CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    type            branch_type NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    address         TEXT,
    phone           VARCHAR(30),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_branches_company_code UNIQUE (company_id, code)
);

CREATE INDEX idx_branches_company_id ON branches(company_id);
CREATE INDEX idx_branches_type ON branches(type);

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON branches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_code   VARCHAR(50) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    phone           VARCHAR(30),
    email           VARCHAR(255),
    status          employee_status NOT NULL DEFAULT 'ACTIVE',
    hired_at        DATE,
    left_at         DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_employees_email UNIQUE NULLS NOT DISTINCT (email),
    CONSTRAINT chk_employee_left_at CHECK (
        (status <> 'LEFT' AND left_at IS NULL)
        OR
        (status = 'LEFT' AND left_at IS NOT NULL)
    )
);

CREATE INDEX idx_employees_branch_id ON employees(branch_id);
CREATE INDEX idx_employees_status ON employees(status);

CREATE TRIGGER trg_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Optional: keep history when employee moves branch.
CREATE TABLE employee_branch_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    started_at      DATE NOT NULL,
    ended_at        DATE,
    is_primary      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_assignment_dates CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX uq_employee_active_primary_branch
ON employee_branch_assignments(employee_id)
WHERE ended_at IS NULL AND is_primary = TRUE;

-- ============================================================================
-- AUTHORIZATION
-- ============================================================================

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    status      record_status NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL
);

CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id             UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE RESTRICT,
    username                VARCHAR(100) NOT NULL UNIQUE,
    password_hash           TEXT NOT NULL,
    status                  user_status NOT NULL DEFAULT 'ACTIVE',
    two_factor_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    must_change_password    BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_count      INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until            TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_status ON users(status);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_id)
);

-- ============================================================================
-- OPERATION RULES
-- ============================================================================

CREATE TABLE operation_types (
    code            operation_code PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    requires_shift  BOOLEAN NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE'
);

INSERT INTO operation_types(code, name, requires_shift) VALUES
('WU', 'Western Union', TRUE),
('MG', 'MoneyGram', TRUE),
('FX', 'Mua/Ban Ngoai Te', TRUE),
('DOMESTIC_TRANSFER', 'Chuyen Tien', TRUE),
('FUND_TRANSFER', 'Tiep Quy', FALSE),
('BANK_DEPOSIT', 'Nap Tien Ngan Hang', FALSE),
('BANK_WITHDRAW', 'Chi Tien Ngan Hang', FALSE),
('CASH_IN', 'Thu Tien Mat Noi Bo', FALSE),
('CASH_OUT', 'Chi Tien Mat Noi Bo', FALSE),
('DEBT_MOVEMENT', 'Bien Dong Cong No', FALSE),
('CASH_COUNT', 'Kiem Quy', FALSE);

-- ============================================================================
-- CUSTOMERS AND KYC
-- ============================================================================

CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code       VARCHAR(100) NOT NULL UNIQUE,
    full_name           VARCHAR(255) NOT NULL,
    phone               VARCHAR(30),
    email               VARCHAR(255),
    date_of_birth       DATE,
    address             TEXT,
    status              customer_status NOT NULL DEFAULT 'ACTIVE',
    risk_note           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_status ON customers(status);

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE customer_identifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    identification_type identification_type NOT NULL,
    identification_no   VARCHAR(100) NOT NULL,
    issued_at           DATE,
    issued_by           VARCHAR(255),
    expired_at          DATE,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_customer_identification_no UNIQUE (identification_type, identification_no)
);

CREATE UNIQUE INDEX uq_customer_primary_identification
ON customer_identifications(customer_id)
WHERE is_primary = TRUE;

CREATE TABLE customer_risk_flags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    flag_code           VARCHAR(100) NOT NULL,
    severity            VARCHAR(30) NOT NULL,
    note                TEXT,
    created_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_risk_flags_customer
ON customer_risk_flags(customer_id, resolved_at);

-- ============================================================================
-- EXCHANGE RATES
-- ============================================================================

CREATE TABLE exchange_rates (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_type               exchange_rate_type NOT NULL,
    provider                service_provider,
    from_currency           currency_code NOT NULL,
    to_currency             currency_code NOT NULL DEFAULT 'VND',
    buy_rate                NUMERIC(20, 6),
    sell_rate               NUMERIC(20, 6),
    rate                    NUMERIC(20, 6) NOT NULL CHECK (rate > 0),
    effective_from          TIMESTAMPTZ NOT NULL,
    effective_to            TIMESTAMPTZ,
    status                  rate_status NOT NULL DEFAULT 'DRAFT',
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_exchange_rate_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_exchange_rates_lookup
ON exchange_rates(rate_type, provider, from_currency, to_currency, status, effective_from DESC);

CREATE TRIGGER trg_exchange_rates_updated_at
BEFORE UPDATE ON exchange_rates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SHIFTS
-- ============================================================================

CREATE TABLE shifts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    shift_code              VARCHAR(50) NOT NULL UNIQUE,
    business_date           DATE NOT NULL,
    status                  shift_status NOT NULL DEFAULT 'OPEN',
    opened_by_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opened_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by_user_id       UUID REFERENCES users(id) ON DELETE RESTRICT,
    closed_at               TIMESTAMPTZ,
    reviewed_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at             TIMESTAMPTZ,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at             TIMESTAMPTZ,
    opening_note            TEXT,
    closing_note            TEXT,
    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_shift_closed_pair CHECK (
        (closed_by_user_id IS NULL AND closed_at IS NULL)
        OR
        (closed_by_user_id IS NOT NULL AND closed_at IS NOT NULL)
    )
);

CREATE INDEX idx_shifts_branch_date ON shifts(branch_id, business_date);
CREATE INDEX idx_shifts_status ON shifts(status);

CREATE UNIQUE INDEX uq_branch_active_shift
ON shifts(branch_id)
WHERE status IN ('OPEN', 'ACTIVE', 'CLOSING');

CREATE TRIGGER trg_shifts_updated_at
BEFORE UPDATE ON shifts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- CUSTOMER TRANSACTIONS - SHIFT REQUIRED
-- ============================================================================

CREATE TABLE customer_transactions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_no          VARCHAR(100) NOT NULL UNIQUE,
    operation_code          operation_code NOT NULL REFERENCES operation_types(code) ON DELETE RESTRICT,
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    shift_id                UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    business_date           DATE NOT NULL,
    status                  transaction_status NOT NULL DEFAULT 'DRAFT',
    customer_id             UUID REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name           VARCHAR(255),
    customer_phone          VARCHAR(30),
    amount                  NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    currency_code           currency_code NOT NULL DEFAULT 'VND',
    vnd_amount              NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (vnd_amount >= 0),
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    voided_by_user_id       UUID REFERENCES users(id) ON DELETE RESTRICT,
    void_reason             TEXT,
    voided_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_customer_operation_shift_required CHECK (
        operation_code IN ('WU', 'MG', 'FX', 'DOMESTIC_TRANSFER')
    )
);

CREATE INDEX idx_customer_transactions_branch_date
ON customer_transactions(branch_id, business_date);

CREATE INDEX idx_customer_transactions_shift
ON customer_transactions(shift_id);

CREATE TRIGGER trg_customer_transactions_updated_at
BEFORE UPDATE ON customer_transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Detail tables can stay subtype-based.
CREATE TABLE wu_transaction_details (
    transaction_id      UUID PRIMARY KEY REFERENCES customer_transactions(id) ON DELETE CASCADE,
    mtcn                VARCHAR(50) NOT NULL,
    wu_usd_amount       NUMERIC(20, 2) NOT NULL DEFAULT 0,
    wu_vnd_amount       NUMERIC(20, 2) NOT NULL DEFAULT 0,
    received_usd        NUMERIC(20, 2) NOT NULL DEFAULT 0,
    received_vnd        NUMERIC(20, 2) NOT NULL DEFAULT 0,
    wu_rate             NUMERIC(20, 6) NOT NULL,
    system_rate         NUMERIC(20, 6) NOT NULL,
    applied_rate        NUMERIC(20, 6) NOT NULL
);

CREATE TABLE mg_transaction_details (
    transaction_id      UUID PRIMARY KEY REFERENCES customer_transactions(id) ON DELETE CASCADE,
    reference_no        VARCHAR(50) NOT NULL,
    payout_currency     currency_code NOT NULL CHECK (payout_currency IN ('USD', 'VND')),
    payout_amount       NUMERIC(20, 2) NOT NULL CHECK (payout_amount > 0),
    system_rate         NUMERIC(20, 6) NOT NULL,
    applied_rate        NUMERIC(20, 6) NOT NULL,

    CONSTRAINT chk_mg_rate_same CHECK (ABS(system_rate - applied_rate) <= 0.000001)
);

CREATE TABLE fx_transaction_details (
    transaction_id      UUID PRIMARY KEY REFERENCES customer_transactions(id) ON DELETE CASCADE,
    fx_currency         currency_code NOT NULL CHECK (fx_currency <> 'VND'),
    fx_amount           NUMERIC(20, 2) NOT NULL CHECK (fx_amount > 0),
    rate                NUMERIC(20, 6) NOT NULL CHECK (rate > 0),
    is_buy              BOOLEAN NOT NULL
);

CREATE TABLE domestic_transfer_details (
    transaction_id      UUID PRIMARY KEY REFERENCES customer_transactions(id) ON DELETE CASCADE,
    beneficiary_name    VARCHAR(255) NOT NULL,
    beneficiary_phone   VARCHAR(30),
    transfer_note       TEXT
);

-- Validate shift/branch/user scope for customer transactions.
CREATE OR REPLACE FUNCTION validate_customer_transaction_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    shift_branch UUID;
    shift_state shift_status;
    user_branch UUID;
    v_requires_shift BOOLEAN;
BEGIN
    SELECT ot.requires_shift
    INTO v_requires_shift
    FROM operation_types ot
    WHERE ot.code = NEW.operation_code;

    IF v_requires_shift IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Operation % is not a customer shift operation', NEW.operation_code;
    END IF;

    SELECT branch_id, status
    INTO shift_branch, shift_state
    FROM shifts
    WHERE id = NEW.shift_id;

    IF shift_branch IS NULL THEN
        RAISE EXCEPTION 'Shift % does not exist', NEW.shift_id;
    END IF;

    IF shift_branch <> NEW.branch_id THEN
        RAISE EXCEPTION 'Transaction branch must match shift branch';
    END IF;

    IF shift_state NOT IN ('OPEN', 'ACTIVE') THEN
        RAISE EXCEPTION 'Transactions can only be created in an OPEN or ACTIVE shift';
    END IF;

    SELECT e.branch_id
    INTO user_branch
    FROM users u
    JOIN employees e ON e.id = u.employee_id
    WHERE u.id = NEW.created_by_user_id;

    IF user_branch IS NULL THEN
        RAISE EXCEPTION 'User % does not exist or has no employee branch', NEW.created_by_user_id;
    END IF;

    IF user_branch <> NEW.branch_id THEN
        RAISE EXCEPTION 'Transaction creator must belong to transaction branch';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_customer_transaction_scope
BEFORE INSERT OR UPDATE OF operation_code, branch_id, shift_id, created_by_user_id
ON customer_transactions
FOR EACH ROW EXECUTE FUNCTION validate_customer_transaction_scope();

-- ============================================================================
-- JOURNAL UPLOAD AND RECONCILIATION
-- ============================================================================

CREATE TABLE journal_upload_files (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider            service_provider NOT NULL CHECK (provider IN ('WU', 'MG')),
    scope               journal_scope NOT NULL,
    branch_id           UUID REFERENCES branches(id) ON DELETE RESTRICT,
    business_date       DATE NOT NULL,
    original_file_name  VARCHAR(255) NOT NULL,
    storage_key         TEXT NOT NULL,
    file_hash           VARCHAR(128) NOT NULL,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_journal_file_scope CHECK (
        (scope = 'COMPANY' AND branch_id IS NULL)
        OR
        (scope = 'BRANCH' AND branch_id IS NOT NULL)
    ),
    CONSTRAINT uq_journal_file_hash UNIQUE (provider, business_date, file_hash)
);

CREATE INDEX idx_journal_upload_files_provider_date
ON journal_upload_files(provider, business_date);

CREATE TABLE journal_batches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_file_id         UUID NOT NULL REFERENCES journal_upload_files(id) ON DELETE RESTRICT,
    provider                service_provider NOT NULL CHECK (provider IN ('WU', 'MG')),
    scope                   journal_scope NOT NULL,
    branch_id               UUID REFERENCES branches(id) ON DELETE RESTRICT,
    business_date           DATE NOT NULL,
    batch_no                VARCHAR(100) NOT NULL UNIQUE,
    status                  import_status NOT NULL DEFAULT 'UPLOADED',
    row_count               INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    total_amount            NUMERIC(20, 2) NOT NULL DEFAULT 0,
    currency_code           currency_code NOT NULL DEFAULT 'VND',
    parsed_at               TIMESTAMPTZ,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at             TIMESTAMPTZ,
    posted_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_journal_batch_scope CHECK (
        (scope = 'COMPANY' AND branch_id IS NULL)
        OR
        (scope = 'BRANCH' AND branch_id IS NOT NULL)
    )
);

CREATE INDEX idx_journal_batches_provider_date
ON journal_batches(provider, business_date, status);

CREATE TRIGGER trg_journal_batches_updated_at
BEFORE UPDATE ON journal_batches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE journal_rows (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_batch_id            UUID NOT NULL REFERENCES journal_batches(id) ON DELETE CASCADE,
    row_no                      INTEGER NOT NULL CHECK (row_no > 0),
    external_reference          VARCHAR(150),
    external_transaction_date   TIMESTAMPTZ,
    raw_branch_code             VARCHAR(50),
    matched_branch_id           UUID REFERENCES branches(id) ON DELETE RESTRICT,
    matched_transaction_id      UUID REFERENCES customer_transactions(id) ON DELETE RESTRICT,
    customer_name               VARCHAR(255),
    amount                      NUMERIC(20, 2) NOT NULL CHECK (amount >= 0),
    currency_code               currency_code NOT NULL,
    fee_amount                  NUMERIC(20, 2) NOT NULL DEFAULT 0,
    raw_data                    JSONB NOT NULL DEFAULT '{}'::jsonb,
    match_status                reconciliation_item_status NOT NULL DEFAULT 'MISSING_IN_SYSTEM',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_journal_row_no UNIQUE (journal_batch_id, row_no)
);

CREATE INDEX idx_journal_rows_reference
ON journal_rows(external_reference);

CREATE INDEX idx_journal_rows_matched_transaction
ON journal_rows(matched_transaction_id);

CREATE TABLE journal_parse_errors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_batch_id    UUID NOT NULL REFERENCES journal_batches(id) ON DELETE CASCADE,
    row_no              INTEGER,
    error_code          VARCHAR(100) NOT NULL,
    error_message       TEXT NOT NULL,
    raw_data            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_runs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_no                  VARCHAR(100) NOT NULL UNIQUE,
    provider                service_provider NOT NULL CHECK (provider IN ('WU', 'MG')),
    scope                   journal_scope NOT NULL,
    branch_id               UUID REFERENCES branches(id) ON DELETE RESTRICT,
    business_date           DATE NOT NULL,
    status                  reconciliation_status NOT NULL DEFAULT 'DRAFT',
    system_total_amount     NUMERIC(20, 2) NOT NULL DEFAULT 0,
    journal_total_amount    NUMERIC(20, 2) NOT NULL DEFAULT 0,
    variance_amount         NUMERIC(20, 2) NOT NULL DEFAULT 0,
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    posted_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_reconciliation_run_scope CHECK (
        (scope = 'COMPANY' AND branch_id IS NULL)
        OR
        (scope = 'BRANCH' AND branch_id IS NOT NULL)
    )
);

CREATE INDEX idx_reconciliation_runs_provider_date
ON reconciliation_runs(provider, business_date, status);

CREATE TRIGGER trg_reconciliation_runs_updated_at
BEFORE UPDATE ON reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE reconciliation_run_batches (
    reconciliation_run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    journal_batch_id      UUID NOT NULL REFERENCES journal_batches(id) ON DELETE RESTRICT,
    PRIMARY KEY (reconciliation_run_id, journal_batch_id)
);

CREATE TABLE reconciliation_items (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_run_id       UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    journal_row_id              UUID REFERENCES journal_rows(id) ON DELETE RESTRICT,
    transaction_id              UUID REFERENCES customer_transactions(id) ON DELETE RESTRICT,
    branch_id                   UUID REFERENCES branches(id) ON DELETE RESTRICT,
    system_amount               NUMERIC(20, 2) NOT NULL DEFAULT 0,
    journal_amount              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    variance_amount             NUMERIC(20, 2) NOT NULL DEFAULT 0,
    status                      reconciliation_item_status NOT NULL,
    note                        TEXT,
    resolved_by_user_id         UUID REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_reconciliation_item_source CHECK (
        journal_row_id IS NOT NULL OR transaction_id IS NOT NULL
    )
);

CREATE INDEX idx_reconciliation_items_run
ON reconciliation_items(reconciliation_run_id, status);

CREATE INDEX idx_reconciliation_items_branch
ON reconciliation_items(branch_id, status);

CREATE TABLE reconciliation_adjustments (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_run_id       UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE RESTRICT,
    reconciliation_item_id      UUID REFERENCES reconciliation_items(id) ON DELETE RESTRICT,
    branch_id                   UUID REFERENCES branches(id) ON DELETE RESTRICT,
    amount                      NUMERIC(20, 2) NOT NULL,
    currency_code               currency_code NOT NULL,
    reason                      TEXT NOT NULL,
    created_by_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id         UUID REFERENCES users(id) ON DELETE RESTRICT,
    posted_at                   TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- BANKS AND BANK ACCOUNTS
-- ============================================================================

CREATE TABLE banks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    status      record_status NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE bank_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    bank_id             UUID NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
    account_no          VARCHAR(100) NOT NULL,
    account_name        VARCHAR(255) NOT NULL,
    currency_code       currency_code NOT NULL,
    opening_balance     NUMERIC(20, 2) NOT NULL DEFAULT 0,
    current_balance     NUMERIC(20, 2) NOT NULL DEFAULT 0,
    available_balance   NUMERIC(20, 2) NOT NULL DEFAULT 0,
    status              record_status NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bank_account_no UNIQUE (bank_id, account_no)
);

CREATE INDEX idx_bank_accounts_branch ON bank_accounts(branch_id);
CREATE INDEX idx_bank_accounts_bank ON bank_accounts(bank_id);

CREATE TRIGGER trg_bank_accounts_updated_at
BEFORE UPDATE ON bank_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- FUND ACCOUNTS AND LEDGER
-- ============================================================================

CREATE TABLE fund_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    code                VARCHAR(100) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    account_type        fund_account_type NOT NULL,
    currency_code       currency_code NOT NULL,
    bank_account_id     UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    status              record_status NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fund_accounts_branch_code UNIQUE (branch_id, code),
    CONSTRAINT chk_fund_account_bank_relation CHECK (
        (account_type = 'BANK' AND bank_account_id IS NOT NULL)
        OR
        (account_type <> 'BANK' AND bank_account_id IS NULL)
    )
);

CREATE INDEX idx_fund_accounts_branch ON fund_accounts(branch_id);
CREATE INDEX idx_fund_accounts_type_currency ON fund_accounts(account_type, currency_code);

CREATE TRIGGER trg_fund_accounts_updated_at
BEFORE UPDATE ON fund_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ledger_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_no            VARCHAR(100) NOT NULL UNIQUE,
    business_date       DATE NOT NULL,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    shift_id            UUID REFERENCES shifts(id) ON DELETE RESTRICT,
    source_type         ledger_source_type NOT NULL,
    source_id           UUID NOT NULL,
    status              ledger_entry_status NOT NULL DEFAULT 'DRAFT',
    description         TEXT,
    created_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    posted_at           TIMESTAMPTZ,
    reversed_entry_id   UUID REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ledger_source UNIQUE (source_type, source_id),
    CONSTRAINT chk_ledger_posting CHECK (
        (status <> 'POSTED') OR (posted_at IS NOT NULL)
    )
);

CREATE INDEX idx_ledger_entries_branch_date ON ledger_entries(branch_id, business_date);
CREATE INDEX idx_ledger_entries_shift ON ledger_entries(shift_id);

CREATE TRIGGER trg_ledger_entries_updated_at
BEFORE UPDATE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ledger_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_entry_id     UUID NOT NULL REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    fund_account_id     UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    direction           ledger_direction NOT NULL,
    amount              NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    currency_code       currency_code NOT NULL,
    exchange_rate       NUMERIC(20, 6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
    base_amount_vnd     NUMERIC(20, 2) NOT NULL CHECK (base_amount_vnd >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_lines_entry ON ledger_lines(ledger_entry_id);
CREATE INDEX idx_ledger_lines_account ON ledger_lines(fund_account_id);

-- ============================================================================
-- BACK-OFFICE OPERATIONS - NO SHIFT REQUIRED
-- ============================================================================

CREATE TABLE fund_transfers (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_no                 VARCHAR(100) NOT NULL UNIQUE,
    source_branch_id            UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    destination_branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    source_account_id           UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    destination_account_id      UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    currency_code               currency_code NOT NULL,
    amount                      NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    status                      fund_transfer_status NOT NULL DEFAULT 'DRAFT',
    created_by_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id         UUID REFERENCES users(id) ON DELETE RESTRICT,
    confirmed_by_user_id        UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at                 TIMESTAMPTZ,
    confirmed_at                TIMESTAMPTZ,
    posted_at                   TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fund_transfer_branches CHECK (source_branch_id <> destination_branch_id),
    CONSTRAINT chk_fund_transfer_accounts CHECK (source_account_id <> destination_account_id)
);

CREATE INDEX idx_fund_transfers_source ON fund_transfers(source_branch_id, status);
CREATE INDEX idx_fund_transfers_destination ON fund_transfers(destination_branch_id, status);

CREATE TRIGGER trg_fund_transfers_updated_at
BEFORE UPDATE ON fund_transfers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE bank_balance_movements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_no             VARCHAR(100) NOT NULL UNIQUE,
    bank_account_id         UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    movement_type           bank_movement_type NOT NULL,
    business_date           DATE NOT NULL,
    occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount                  NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    currency_code           currency_code NOT NULL,
    balance_before          NUMERIC(20, 2) NOT NULL,
    balance_after           NUMERIC(20, 2) NOT NULL,
    bank_reference          VARCHAR(150),
    description             TEXT,
    status                  workflow_status NOT NULL DEFAULT 'DRAFT',
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    posted_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bank_movement_reference UNIQUE NULLS NOT DISTINCT (bank_account_id, bank_reference)
);

CREATE INDEX idx_bank_movements_account_date
ON bank_balance_movements(bank_account_id, occurred_at DESC);

CREATE INDEX idx_bank_movements_branch_date
ON bank_balance_movements(branch_id, business_date);

CREATE TRIGGER trg_bank_balance_movements_updated_at
BEFORE UPDATE ON bank_balance_movements
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE bank_statement_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id     UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    business_date       DATE NOT NULL,
    original_file_name  VARCHAR(255) NOT NULL,
    storage_key         TEXT NOT NULL,
    file_hash           VARCHAR(128) NOT NULL,
    status              import_status NOT NULL DEFAULT 'UPLOADED',
    row_count           INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    opening_balance     NUMERIC(20, 2),
    closing_balance     NUMERIC(20, 2),
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    parsed_at           TIMESTAMPTZ,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at         TIMESTAMPTZ,

    CONSTRAINT uq_bank_statement_file_hash UNIQUE (bank_account_id, file_hash)
);

CREATE INDEX idx_bank_statement_batches_account_date
ON bank_statement_batches(bank_account_id, business_date, status);

CREATE TABLE bank_statement_rows (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_statement_batch_id     UUID NOT NULL REFERENCES bank_statement_batches(id) ON DELETE CASCADE,
    row_no                      INTEGER NOT NULL CHECK (row_no > 0),
    transaction_date            TIMESTAMPTZ NOT NULL,
    bank_reference              VARCHAR(150),
    description                 TEXT,
    amount_in                   NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (amount_in >= 0),
    amount_out                  NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (amount_out >= 0),
    balance_after               NUMERIC(20, 2),
    matched_bank_movement_id    UUID REFERENCES bank_balance_movements(id) ON DELETE RESTRICT,
    match_status                reconciliation_item_status NOT NULL DEFAULT 'MISSING_IN_SYSTEM',
    raw_data                    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bank_statement_row_no UNIQUE (bank_statement_batch_id, row_no),
    CONSTRAINT chk_bank_statement_direction CHECK (
        (amount_in > 0 AND amount_out = 0)
        OR
        (amount_in = 0 AND amount_out > 0)
    )
);

CREATE INDEX idx_bank_statement_rows_reference
ON bank_statement_rows(bank_reference);

CREATE TABLE bank_reconciliation_items (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_statement_batch_id     UUID NOT NULL REFERENCES bank_statement_batches(id) ON DELETE CASCADE,
    bank_statement_row_id       UUID REFERENCES bank_statement_rows(id) ON DELETE RESTRICT,
    bank_movement_id            UUID REFERENCES bank_balance_movements(id) ON DELETE RESTRICT,
    amount_system               NUMERIC(20, 2) NOT NULL DEFAULT 0,
    amount_statement            NUMERIC(20, 2) NOT NULL DEFAULT 0,
    variance_amount             NUMERIC(20, 2) NOT NULL DEFAULT 0,
    status                      reconciliation_item_status NOT NULL,
    note                        TEXT,
    resolved_by_user_id         UUID REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_bank_reconciliation_item_source CHECK (
        bank_statement_row_id IS NOT NULL OR bank_movement_id IS NOT NULL
    )
);

CREATE TABLE cash_movements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_no             VARCHAR(100) NOT NULL UNIQUE,
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    fund_account_id         UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    movement_type           cash_movement_type NOT NULL,
    business_date           DATE NOT NULL,
    amount                  NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    currency_code           currency_code NOT NULL,
    description             TEXT,
    status                  workflow_status NOT NULL DEFAULT 'DRAFT',
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    posted_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_movements_branch_date
ON cash_movements(branch_id, business_date);

CREATE TRIGGER trg_cash_movements_updated_at
BEFORE UPDATE ON cash_movements
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE debt_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    provider_code   VARCHAR(50) NOT NULL,
    currency_code   currency_code NOT NULL,
    name            VARCHAR(255) NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_debt_account UNIQUE (branch_id, provider_code, currency_code)
);

CREATE TABLE debt_movements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_account_id         UUID NOT NULL REFERENCES debt_accounts(id) ON DELETE RESTRICT,
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    movement_type           debt_movement_type NOT NULL,
    source_type             ledger_source_type,
    source_id               UUID,
    business_date           DATE NOT NULL,
    effective_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount                  NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    currency_code           currency_code NOT NULL,
    description             TEXT,
    status                  workflow_status NOT NULL DEFAULT 'DRAFT',
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    posted_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debt_movements_account_date
ON debt_movements(debt_account_id, business_date);

CREATE INDEX idx_debt_movements_source
ON debt_movements(source_type, source_id);

CREATE TABLE cash_counts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    shift_id                UUID REFERENCES shifts(id) ON DELETE RESTRICT,
    business_date           DATE NOT NULL,
    status                  workflow_status NOT NULL DEFAULT 'DRAFT',
    counted_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    counted_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at             TIMESTAMPTZ,
    note                    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_counts_branch_shift
ON cash_counts(branch_id, shift_id);

CREATE TABLE cash_count_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_count_id       UUID NOT NULL REFERENCES cash_counts(id) ON DELETE CASCADE,
    fund_account_id     UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    currency_code       currency_code NOT NULL,
    system_amount       NUMERIC(20, 2) NOT NULL CHECK (system_amount >= 0),
    actual_amount       NUMERIC(20, 2) NOT NULL CHECK (actual_amount >= 0),
    variance            NUMERIC(20, 2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_cash_count_account UNIQUE (cash_count_id, fund_account_id)
);

-- ============================================================================
-- APPROVAL WORKFLOW
-- ============================================================================

CREATE TABLE approval_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type         VARCHAR(100) NOT NULL,
    entity_id           UUID NOT NULL,
    requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status              approval_status NOT NULL DEFAULT 'PENDING',
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    note                TEXT,

    CONSTRAINT uq_approval_request_entity UNIQUE (entity_type, entity_id)
);

CREATE INDEX idx_approval_requests_status
ON approval_requests(status, requested_at DESC);

CREATE TABLE approval_steps (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id     UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    step_no                 INTEGER NOT NULL CHECK (step_no > 0),
    required_role_code      VARCHAR(50) REFERENCES roles(code) ON DELETE RESTRICT,
    assigned_user_id        UUID REFERENCES users(id) ON DELETE RESTRICT,
    status                  approval_status NOT NULL DEFAULT 'PENDING',
    acted_by_user_id        UUID REFERENCES users(id) ON DELETE RESTRICT,
    acted_at                TIMESTAMPTZ,
    note                    TEXT,

    CONSTRAINT uq_approval_step_no UNIQUE (approval_request_id, step_no),
    CONSTRAINT chk_approval_step_assignee CHECK (
        required_role_code IS NOT NULL OR assigned_user_id IS NOT NULL
    )
);

CREATE TABLE approval_actions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id     UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    approval_step_id        UUID REFERENCES approval_steps(id) ON DELETE SET NULL,
    action                  approval_action NOT NULL,
    acted_by_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    note                    TEXT,
    acted_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- BALANCE SNAPSHOTS
-- ============================================================================

CREATE TABLE fund_balance_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_account_id     UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    business_date       DATE NOT NULL,
    opening_balance     NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_debit         NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_credit        NUMERIC(20, 2) NOT NULL DEFAULT 0,
    closing_balance     NUMERIC(20, 2) NOT NULL DEFAULT 0,
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fund_balance_snapshot UNIQUE (fund_account_id, business_date)
);

CREATE INDEX idx_fund_balance_snapshots_date ON fund_balance_snapshots(business_date);

CREATE TABLE bank_balance_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id     UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    business_date       DATE NOT NULL,
    opening_balance     NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_in            NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_out           NUMERIC(20, 2) NOT NULL DEFAULT 0,
    closing_balance     NUMERIC(20, 2) NOT NULL DEFAULT 0,
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bank_balance_snapshot UNIQUE (bank_account_id, business_date)
);

-- ============================================================================
-- DAY CLOSING
-- ============================================================================

CREATE TABLE business_days (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID REFERENCES branches(id) ON DELETE RESTRICT,
    business_date       DATE NOT NULL,
    status              business_day_status NOT NULL DEFAULT 'OPEN',
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at           TIMESTAMPTZ,
    closed_by_user_id   UUID REFERENCES users(id) ON DELETE RESTRICT,
    reopened_at         TIMESTAMPTZ,
    reopened_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    note                TEXT,

    CONSTRAINT uq_business_day_branch UNIQUE NULLS NOT DISTINCT (branch_id, business_date)
);

CREATE INDEX idx_business_days_date_status
ON business_days(business_date, status);

CREATE TABLE day_closing_runs (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_no                      VARCHAR(100) NOT NULL UNIQUE,
    business_day_id             UUID NOT NULL REFERENCES business_days(id) ON DELETE RESTRICT,
    branch_id                   UUID REFERENCES branches(id) ON DELETE RESTRICT,
    business_date               DATE NOT NULL,
    status                      workflow_status NOT NULL DEFAULT 'DRAFT',
    total_cash_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_bank_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_debt_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_branch_fund_vnd       NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_customer_txn_vnd      NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_variance_vnd          NUMERIC(20, 2) NOT NULL DEFAULT 0,
    created_by_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id         UUID REFERENCES users(id) ON DELETE RESTRICT,
    posted_at                   TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_day_closing_runs_date
ON day_closing_runs(business_date, status);

CREATE TRIGGER trg_day_closing_runs_updated_at
BEFORE UPDATE ON day_closing_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE branch_daily_summaries (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id                   UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    business_date               DATE NOT NULL,
    shift_count                 INTEGER NOT NULL DEFAULT 0,
    transaction_count           INTEGER NOT NULL DEFAULT 0,
    transaction_value_vnd       NUMERIC(20, 2) NOT NULL DEFAULT 0,
    cash_value_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    bank_value_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    debt_value_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    variance_vnd                NUMERIC(20, 2) NOT NULL DEFAULT 0,
    calculated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_branch_daily_summary UNIQUE (branch_id, business_date)
);

CREATE TABLE company_daily_summaries (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date               DATE NOT NULL UNIQUE,
    branch_count                INTEGER NOT NULL DEFAULT 0,
    transaction_count           INTEGER NOT NULL DEFAULT 0,
    transaction_value_vnd       NUMERIC(20, 2) NOT NULL DEFAULT 0,
    cash_value_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    bank_value_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    debt_value_vnd              NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_fund_value_vnd        NUMERIC(20, 2) NOT NULL DEFAULT 0,
    variance_vnd                NUMERIC(20, 2) NOT NULL DEFAULT 0,
    calculated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- NOTIFICATIONS AND AUDIT
-- ============================================================================

CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
    branch_id           UUID REFERENCES branches(id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    body                TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'UNREAD',
    source_type         VARCHAR(80),
    source_id           UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_notification_recipient CHECK (
        recipient_user_id IS NOT NULL OR branch_id IS NOT NULL
    )
);

CREATE INDEX idx_notifications_user_status
ON notifications(recipient_user_id, status, created_at DESC);

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID,
    before_data     JSONB,
    after_data      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

