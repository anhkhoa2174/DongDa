-- ============================================================================
-- ĐỐNG ĐA SYSTEM v2.0
-- PostgreSQL database schema
-- Target: PostgreSQL 15+
-- Generated: 2026-07-22
--
-- Main design decisions:
--   1. User belongs to exactly one Department and stores one fixed role.
--   2. Permissions are enforced by the backend, not stored as permission tables.
--   3. Customer transactions use a parent Transaction table and subtype tables.
--   4. WU stores WU USD, WU VND, customer payout, WU/system/applied rates.
--   5. MG stores one payout currency/amount; applied rate must equal system rate.
--   6. Ledger is the financial source of truth.
--   7. Audit logs are append-only.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE department_type AS ENUM (
    'HEAD_OFFICE',
    'BRANCH'
);

CREATE TYPE record_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'LOCKED'
);

CREATE TYPE user_role AS ENUM (
    'DIRECTOR',
    'KTTH',
    'STAFF',
    'AUDITOR',
    'ADMIN'
);

CREATE TYPE user_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'LOCKED',
    'SUSPENDED'
);

CREATE TYPE shift_status AS ENUM (
    'OPEN',
    'ACTIVE',
    'CLOSING',
    'CLOSED',
    'REVIEW',
    'APPROVED',
    'CANCELLED'
);

CREATE TYPE transaction_type AS ENUM (
    'WU',
    'MG',
    'FX',
    'DOMESTIC_TRANSFER'
);

CREATE TYPE transaction_status AS ENUM (
    'DRAFT',
    'COMPLETED',
    'RECONCILED',
    'ADJUSTED',
    'VOIDED'
);

CREATE TYPE currency_code AS ENUM (
    'VND',
    'USD',
    'EUR',
    'AUD',
    'JPY',
    'GBP',
    'SGD',
    'KRW',
    'THB',
    'HKD',
    'CNY',
    'OTHER'
);

CREATE TYPE fx_direction AS ENUM (
    'BUY',
    'SELL'
);

CREATE TYPE transfer_direction AS ENUM (
    'OUTGOING',
    'INCOMING'
);

CREATE TYPE rate_type AS ENUM (
    'WU',
    'MG',
    'FX',
    'BANK',
    'PAID'
);

CREATE TYPE rate_status AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'ACTIVE',
    'EXPIRED',
    'REJECTED'
);

CREATE TYPE fund_account_type AS ENUM (
    'CASH',
    'BANK',
    'RECEIVABLE',
    'PAYABLE',
    'SUSPENSE',
    'EXCHANGE_DIFFERENCE'
);

CREATE TYPE ledger_entry_status AS ENUM (
    'DRAFT',
    'POSTED',
    'REVERSED'
);

CREATE TYPE ledger_direction AS ENUM (
    'DEBIT',
    'CREDIT'
);

CREATE TYPE ledger_source_type AS ENUM (
    'TRANSACTION',
    'FUND_TRANSFER',
    'DEBT_SETTLEMENT',
    'BANK_TRANSACTION',
    'CASH_ADJUSTMENT'
);

CREATE TYPE fund_transfer_status AS ENUM (
    'DRAFT',
    'PENDING',
    'IN_TRANSIT',
    'CONFIRMED',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);

CREATE TYPE journal_provider AS ENUM (
    'WU',
    'MG',
    'BANK'
);

CREATE TYPE journal_file_status AS ENUM (
    'UPLOADED',
    'PARSING',
    'PARSED',
    'FAILED',
    'RECONCILED'
);

CREATE TYPE parse_status AS ENUM (
    'PENDING',
    'VALID',
    'INVALID',
    'DUPLICATE'
);

CREATE TYPE reconciliation_type AS ENUM (
    'WU_JOURNAL',
    'MG_JOURNAL',
    'FUND_LEDGER',
    'BANK_DEBT',
    'WU_BANK',
    'MG_BANK',
    'CENTRAL_FUND'
);

CREATE TYPE reconciliation_status AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'REVIEWED',
    'FAILED'
);

CREATE TYPE reconciliation_match_status AS ENUM (
    'MATCHED',
    'MISMATCH',
    'MISSING_TRANSACTION',
    'MISSING_JOURNAL',
    'DUPLICATE',
    'REVIEW_REQUIRED',
    'RESOLVED'
);

CREATE TYPE cash_count_type AS ENUM (
    'SHIFT_OPENING',
    'SHIFT_CLOSING',
    'AD_HOC',
    'CENTRAL_AUDIT'
);

CREATE TYPE cash_count_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'CONFIRMED',
    'REJECTED'
);

CREATE TYPE debt_provider AS ENUM (
    'WU',
    'MG',
    'OTHER'
);

CREATE TYPE debt_type AS ENUM (
    'RECEIVABLE',
    'PAYABLE'
);

CREATE TYPE debt_movement_type AS ENUM (
    'INCREASE',
    'DECREASE',
    'SETTLEMENT',
    'ADJUSTMENT'
);

CREATE TYPE settlement_method AS ENUM (
    'CASH',
    'BANK',
    'MIXED'
);

CREATE TYPE bank_transaction_direction AS ENUM (
    'CREDIT',
    'DEBIT'
);

CREATE TYPE notification_status AS ENUM (
    'UNREAD',
    'READ',
    'ARCHIVED'
);

-- ============================================================================
-- COMMON UPDATED_AT TRIGGER
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

CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    type            department_type NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    address         TEXT,
    phone           VARCHAR(30),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_departments_company_code UNIQUE (company_id, code)
);

CREATE INDEX idx_departments_company_id ON departments(company_id);
CREATE INDEX idx_departments_type ON departments(type);

CREATE TRIGGER trg_departments_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id           UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    employee_code           VARCHAR(50) NOT NULL UNIQUE,
    username                VARCHAR(100) NOT NULL UNIQUE,
    password_hash           TEXT NOT NULL,
    full_name               VARCHAR(255) NOT NULL,
    phone                   VARCHAR(30),
    email                   VARCHAR(255),
    role                    user_role NOT NULL,
    status                  user_status NOT NULL DEFAULT 'ACTIVE',
    two_factor_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    must_change_password    BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_count      INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until            TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_email UNIQUE NULLS NOT DISTINCT (email)
);

CREATE INDEX idx_users_department_id ON users(department_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SHIFTS
-- ============================================================================

CREATE TABLE shifts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id           UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
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
    ),
    CONSTRAINT chk_shift_reviewed_pair CHECK (
        (reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
        OR
        (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT chk_shift_approved_pair CHECK (
        (approved_by_user_id IS NULL AND approved_at IS NULL)
        OR
        (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)
    )
);

CREATE INDEX idx_shifts_department_date ON shifts(department_id, business_date);
CREATE INDEX idx_shifts_status ON shifts(status);

-- One active/opening shift per department.
CREATE UNIQUE INDEX uq_department_active_shift
ON shifts(department_id)
WHERE status IN ('OPEN', 'ACTIVE', 'CLOSING');

CREATE TRIGGER trg_shifts_updated_at
BEFORE UPDATE ON shifts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- EXCHANGE RATES
-- ============================================================================

CREATE TABLE exchange_rates (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_type               rate_type NOT NULL,
    currency_code           currency_code NOT NULL,

    buy_rate                NUMERIC(20, 6),
    sell_rate               NUMERIC(20, 6),
    reference_rate          NUMERIC(20, 6),

    lower_adjustment        NUMERIC(20, 6),
    upper_adjustment        NUMERIC(20, 6),

    status                  rate_status NOT NULL DEFAULT 'DRAFT',
    effective_from          TIMESTAMPTZ NOT NULL,
    effective_to            TIMESTAMPTZ,

    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at             TIMESTAMPTZ,

    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_exchange_rate_value CHECK (
        buy_rate IS NOT NULL
        OR sell_rate IS NOT NULL
        OR reference_rate IS NOT NULL
    ),
    CONSTRAINT chk_exchange_rate_period CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),
    CONSTRAINT chk_exchange_rate_approval CHECK (
        (status <> 'ACTIVE')
        OR
        (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)
    )
);

CREATE INDEX idx_exchange_rates_lookup
ON exchange_rates(rate_type, currency_code, status, effective_from DESC);

CREATE TRIGGER trg_exchange_rates_updated_at
BEFORE UPDATE ON exchange_rates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Prevent overlapping ACTIVE rates for the same rate type/currency.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE exchange_rates
ADD CONSTRAINT ex_exchange_rates_active_period
EXCLUDE USING gist (
    rate_type WITH =,
    currency_code WITH =,
    tstzrange(
        effective_from,
        COALESCE(effective_to, 'infinity'::timestamptz),
        '[)'
    ) WITH &&
)
WHERE (status = 'ACTIVE');

-- ============================================================================
-- TRANSACTIONS: PARENT TABLE
-- ============================================================================

CREATE TABLE transactions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_no          VARCHAR(100) NOT NULL UNIQUE,
    department_id           UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    shift_id                UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    type                    transaction_type NOT NULL,
    status                  transaction_status NOT NULL DEFAULT 'DRAFT',
    business_date           DATE NOT NULL,

    customer_name           VARCHAR(255) NOT NULL,
    customer_phone          VARCHAR(30),
    reference_no            VARCHAR(150),
    note                    TEXT,

    version                 INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),

    voided_by_user_id       UUID REFERENCES users(id) ON DELETE RESTRICT,
    voided_at               TIMESTAMPTZ,
    void_reason             TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_transaction_voided_fields CHECK (
        (status <> 'VOIDED')
        OR
        (
            voided_by_user_id IS NOT NULL
            AND voided_at IS NOT NULL
            AND NULLIF(BTRIM(void_reason), '') IS NOT NULL
        )
    )
);

CREATE INDEX idx_transactions_department_date
ON transactions(department_id, business_date);

CREATE INDEX idx_transactions_shift_id
ON transactions(shift_id);

CREATE INDEX idx_transactions_type_status
ON transactions(type, status);

CREATE INDEX idx_transactions_reference_no
ON transactions(reference_no);

CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- TRANSACTION SUBTYPES
-- ============================================================================

CREATE TABLE wu_transaction_details (
    transaction_id              UUID PRIMARY KEY REFERENCES transactions(id) ON DELETE RESTRICT,
    mskh                        VARCHAR(100) NOT NULL,

    wu_usd_amount               NUMERIC(20, 2) NOT NULL CHECK (wu_usd_amount > 0),
    wu_vnd_amount               NUMERIC(20, 0) NOT NULL CHECK (wu_vnd_amount > 0),

    customer_receive_currency   currency_code NOT NULL,
    customer_receive_amount     NUMERIC(20, 2) NOT NULL CHECK (customer_receive_amount > 0),

    wu_rate                     NUMERIC(20, 6) NOT NULL CHECK (wu_rate > 0),

    system_exchange_rate_id     UUID NOT NULL REFERENCES exchange_rates(id) ON DELETE RESTRICT,
    system_rate_snapshot        NUMERIC(20, 6) NOT NULL CHECK (system_rate_snapshot > 0),
    applied_rate                NUMERIC(20, 6) NOT NULL CHECK (applied_rate > 0),

    min_allowed_rate            NUMERIC(20, 6) NOT NULL CHECK (min_allowed_rate > 0),
    max_allowed_rate            NUMERIC(20, 6) NOT NULL CHECK (max_allowed_rate > 0),

    rate_difference             NUMERIC(20, 6) NOT NULL DEFAULT 0,
    settlement_difference_vnd   NUMERIC(20, 0) NOT NULL DEFAULT 0,

    bank_name                   VARCHAR(255),
    journal_reference           VARCHAR(150),

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_wu_receive_currency CHECK (
        customer_receive_currency IN ('USD', 'VND')
    ),
    CONSTRAINT chk_wu_rate_range CHECK (
        min_allowed_rate <= max_allowed_rate
        AND applied_rate BETWEEN min_allowed_rate AND max_allowed_rate
    ),
    CONSTRAINT chk_wu_rate_calculation CHECK (
        ABS(wu_rate - (wu_vnd_amount / wu_usd_amount)) <= 0.01
    ),
    CONSTRAINT chk_wu_customer_receive CHECK (
        (
            customer_receive_currency = 'USD'
            AND ABS(customer_receive_amount - wu_usd_amount) <= 0.01
        )
        OR
        (
            customer_receive_currency = 'VND'
            AND ABS(customer_receive_amount - ROUND(wu_usd_amount * applied_rate, 0)) <= 1
        )
    )
);

CREATE INDEX idx_wu_details_mskh ON wu_transaction_details(mskh);
CREATE INDEX idx_wu_details_exchange_rate ON wu_transaction_details(system_exchange_rate_id);
CREATE INDEX idx_wu_details_journal_reference ON wu_transaction_details(journal_reference);

CREATE TRIGGER trg_wu_details_updated_at
BEFORE UPDATE ON wu_transaction_details
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE mg_transaction_details (
    transaction_id              UUID PRIMARY KEY REFERENCES transactions(id) ON DELETE RESTRICT,
    reference_number            VARCHAR(150) NOT NULL,
    payout_currency             currency_code NOT NULL,
    payout_amount               NUMERIC(20, 2) NOT NULL CHECK (payout_amount > 0),

    system_exchange_rate_id     UUID NOT NULL REFERENCES exchange_rates(id) ON DELETE RESTRICT,
    system_rate_snapshot        NUMERIC(20, 6) NOT NULL CHECK (system_rate_snapshot > 0),
    applied_rate                NUMERIC(20, 6) NOT NULL CHECK (applied_rate > 0),

    journal_reference           VARCHAR(150),

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_mg_payout_currency CHECK (
        payout_currency IN ('USD', 'VND')
    ),
    CONSTRAINT chk_mg_applied_equals_system CHECK (
        applied_rate = system_rate_snapshot
    )
);

CREATE INDEX idx_mg_details_reference_number ON mg_transaction_details(reference_number);
CREATE INDEX idx_mg_details_exchange_rate ON mg_transaction_details(system_exchange_rate_id);
CREATE INDEX idx_mg_details_journal_reference ON mg_transaction_details(journal_reference);

CREATE TRIGGER trg_mg_details_updated_at
BEFORE UPDATE ON mg_transaction_details
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE fx_transaction_details (
    transaction_id              UUID PRIMARY KEY REFERENCES transactions(id) ON DELETE RESTRICT,
    direction                   fx_direction NOT NULL,
    foreign_currency            currency_code NOT NULL,
    foreign_amount              NUMERIC(20, 2) NOT NULL CHECK (foreign_amount > 0),

    system_exchange_rate_id     UUID NOT NULL REFERENCES exchange_rates(id) ON DELETE RESTRICT,
    system_rate_snapshot        NUMERIC(20, 6) NOT NULL CHECK (system_rate_snapshot > 0),
    applied_rate                NUMERIC(20, 6) NOT NULL CHECK (applied_rate > 0),

    min_allowed_rate            NUMERIC(20, 6) NOT NULL CHECK (min_allowed_rate > 0),
    max_allowed_rate            NUMERIC(20, 6) NOT NULL CHECK (max_allowed_rate > 0),

    vnd_amount                  NUMERIC(20, 0) NOT NULL CHECK (vnd_amount > 0),

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fx_foreign_currency CHECK (
        foreign_currency <> 'VND'
    ),
    CONSTRAINT chk_fx_rate_range CHECK (
        min_allowed_rate <= max_allowed_rate
        AND applied_rate BETWEEN min_allowed_rate AND max_allowed_rate
    ),
    CONSTRAINT chk_fx_vnd_amount CHECK (
        ABS(vnd_amount - ROUND(foreign_amount * applied_rate, 0)) <= 1
    )
);

CREATE INDEX idx_fx_details_exchange_rate ON fx_transaction_details(system_exchange_rate_id);
CREATE INDEX idx_fx_details_currency ON fx_transaction_details(foreign_currency);

CREATE TRIGGER trg_fx_details_updated_at
BEFORE UPDATE ON fx_transaction_details
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Banks and bank accounts are defined before domestic transfer details.
CREATE TABLE banks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_banks_updated_at
BEFORE UPDATE ON banks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE bank_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    bank_id         UUID NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
    account_number  VARCHAR(100) NOT NULL,
    account_name    VARCHAR(255) NOT NULL,
    currency_code   currency_code NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bank_accounts UNIQUE (bank_id, account_number, currency_code)
);

CREATE INDEX idx_bank_accounts_department ON bank_accounts(department_id);
CREATE INDEX idx_bank_accounts_bank ON bank_accounts(bank_id);

CREATE TRIGGER trg_bank_accounts_updated_at
BEFORE UPDATE ON bank_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE domestic_transfer_details (
    transaction_id      UUID PRIMARY KEY REFERENCES transactions(id) ON DELETE RESTRICT,
    direction           transfer_direction NOT NULL,
    cash_currency       currency_code NOT NULL,
    cash_amount         NUMERIC(20, 2) NOT NULL CHECK (cash_amount > 0),
    bank_account_id     UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    bank_amount         NUMERIC(20, 2) NOT NULL CHECK (bank_amount > 0),
    fee_amount          NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    fee_type            VARCHAR(50),
    bank_reference      VARCHAR(150),
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_domestic_transfer_bank_account
ON domestic_transfer_details(bank_account_id);

CREATE TRIGGER trg_domestic_transfer_details_updated_at
BEFORE UPDATE ON domestic_transfer_details
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SUBTYPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_transaction_subtype()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    tx_type transaction_type;
BEGIN
    SELECT type INTO tx_type
    FROM transactions
    WHERE id = NEW.transaction_id;

    IF TG_TABLE_NAME = 'wu_transaction_details' AND tx_type <> 'WU' THEN
        RAISE EXCEPTION 'Transaction % must have type WU', NEW.transaction_id;
    ELSIF TG_TABLE_NAME = 'mg_transaction_details' AND tx_type <> 'MG' THEN
        RAISE EXCEPTION 'Transaction % must have type MG', NEW.transaction_id;
    ELSIF TG_TABLE_NAME = 'fx_transaction_details' AND tx_type <> 'FX' THEN
        RAISE EXCEPTION 'Transaction % must have type FX', NEW.transaction_id;
    ELSIF TG_TABLE_NAME = 'domestic_transfer_details' AND tx_type <> 'DOMESTIC_TRANSFER' THEN
        RAISE EXCEPTION 'Transaction % must have type DOMESTIC_TRANSFER', NEW.transaction_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_wu_subtype
BEFORE INSERT OR UPDATE ON wu_transaction_details
FOR EACH ROW EXECUTE FUNCTION validate_transaction_subtype();

CREATE TRIGGER trg_validate_mg_subtype
BEFORE INSERT OR UPDATE ON mg_transaction_details
FOR EACH ROW EXECUTE FUNCTION validate_transaction_subtype();

CREATE TRIGGER trg_validate_fx_subtype
BEFORE INSERT OR UPDATE ON fx_transaction_details
FOR EACH ROW EXECUTE FUNCTION validate_transaction_subtype();

CREATE TRIGGER trg_validate_domestic_transfer_subtype
BEFORE INSERT OR UPDATE ON domestic_transfer_details
FOR EACH ROW EXECUTE FUNCTION validate_transaction_subtype();

-- Validate that the transaction belongs to the same department as its shift
-- and that the creating user belongs to the same department.
CREATE OR REPLACE FUNCTION validate_transaction_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    shift_department UUID;
    shift_state shift_status;
    user_department UUID;
BEGIN
    SELECT department_id, status
    INTO shift_department, shift_state
    FROM shifts
    WHERE id = NEW.shift_id;

    IF shift_department IS NULL THEN
        RAISE EXCEPTION 'Shift % does not exist', NEW.shift_id;
    END IF;

    IF shift_department <> NEW.department_id THEN
        RAISE EXCEPTION 'Transaction department must match shift department';
    END IF;

    IF shift_state NOT IN ('OPEN', 'ACTIVE') THEN
        RAISE EXCEPTION 'Transactions can only be created in an OPEN or ACTIVE shift';
    END IF;

    SELECT department_id
    INTO user_department
    FROM users
    WHERE id = NEW.created_by_user_id;

    IF user_department IS NULL THEN
        RAISE EXCEPTION 'User % does not exist', NEW.created_by_user_id;
    END IF;

    IF user_department <> NEW.department_id THEN
        RAISE EXCEPTION 'Transaction creator must belong to the transaction department';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_transaction_scope
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION validate_transaction_scope();

-- ============================================================================
-- FUND ACCOUNTS AND LEDGER
-- ============================================================================

CREATE TABLE fund_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id       UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    code                VARCHAR(100) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    account_type        fund_account_type NOT NULL,
    currency_code       currency_code NOT NULL,
    bank_account_id     UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    status              record_status NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fund_accounts_department_code UNIQUE (department_id, code),
    CONSTRAINT chk_fund_account_bank_relation CHECK (
        (account_type = 'BANK' AND bank_account_id IS NOT NULL)
        OR
        (account_type <> 'BANK' AND bank_account_id IS NULL)
    )
);

CREATE INDEX idx_fund_accounts_department ON fund_accounts(department_id);
CREATE INDEX idx_fund_accounts_type_currency
ON fund_accounts(account_type, currency_code);

CREATE TRIGGER trg_fund_accounts_updated_at
BEFORE UPDATE ON fund_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ledger_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_no            VARCHAR(100) NOT NULL UNIQUE,
    business_date       DATE NOT NULL,
    department_id       UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
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
        (status <> 'POSTED')
        OR
        (posted_at IS NOT NULL)
    ),
    CONSTRAINT chk_ledger_reversal CHECK (
        (status <> 'REVERSED')
        OR
        (reversed_entry_id IS NOT NULL)
    )
);

CREATE INDEX idx_ledger_entries_department_date
ON ledger_entries(department_id, business_date);

CREATE INDEX idx_ledger_entries_shift
ON ledger_entries(shift_id);

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

CREATE INDEX idx_fund_balance_snapshots_date
ON fund_balance_snapshots(business_date);

-- ============================================================================
-- FUND TRANSFERS
-- ============================================================================

CREATE TABLE fund_transfers (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_no                 VARCHAR(100) NOT NULL UNIQUE,

    source_department_id        UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    destination_department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,

    source_account_id           UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    destination_account_id      UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,

    currency_code               currency_code NOT NULL,
    amount                      NUMERIC(20, 2) NOT NULL CHECK (amount > 0),

    status                      fund_transfer_status NOT NULL DEFAULT 'DRAFT',

    created_by_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    confirmed_by_user_id        UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id         UUID REFERENCES users(id) ON DELETE RESTRICT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at                TIMESTAMPTZ,
    approved_at                 TIMESTAMPTZ,
    cancelled_at                TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fund_transfer_departments CHECK (
        source_department_id <> destination_department_id
    ),
    CONSTRAINT chk_fund_transfer_accounts CHECK (
        source_account_id <> destination_account_id
    )
);

CREATE INDEX idx_fund_transfers_source_department
ON fund_transfers(source_department_id, status);

CREATE INDEX idx_fund_transfers_destination_department
ON fund_transfers(destination_department_id, status);

CREATE TRIGGER trg_fund_transfers_updated_at
BEFORE UPDATE ON fund_transfers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- CASH COUNTS
-- ============================================================================

CREATE TABLE cash_counts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id           UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    shift_id                UUID REFERENCES shifts(id) ON DELETE RESTRICT,
    count_type              cash_count_type NOT NULL,
    status                  cash_count_status NOT NULL DEFAULT 'DRAFT',

    counted_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    confirmed_by_user_id    UUID REFERENCES users(id) ON DELETE RESTRICT,
    counted_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at            TIMESTAMPTZ,

    note                    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_counts_department_shift
ON cash_counts(department_id, shift_id);

CREATE TRIGGER trg_cash_counts_updated_at
BEFORE UPDATE ON cash_counts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cash_count_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cash_count_id       UUID NOT NULL REFERENCES cash_counts(id) ON DELETE CASCADE,
    currency_code       currency_code NOT NULL,
    denomination        NUMERIC(20, 2) NOT NULL CHECK (denomination > 0),
    quantity            INTEGER NOT NULL CHECK (quantity >= 0),
    actual_amount       NUMERIC(20, 2) NOT NULL CHECK (actual_amount >= 0),
    system_amount       NUMERIC(20, 2) NOT NULL CHECK (system_amount >= 0),
    variance            NUMERIC(20, 2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_cash_count_denomination
        UNIQUE (cash_count_id, currency_code, denomination),
    CONSTRAINT chk_cash_count_actual_amount CHECK (
        ABS(actual_amount - denomination * quantity) <= 0.01
    ),
    CONSTRAINT chk_cash_count_variance CHECK (
        ABS(variance - (actual_amount - system_amount)) <= 0.01
    )
);

CREATE INDEX idx_cash_count_lines_count ON cash_count_lines(cash_count_id);

-- ============================================================================
-- BANK TRANSACTIONS
-- ============================================================================

CREATE TABLE bank_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id     UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    transaction_date    TIMESTAMPTZ NOT NULL,
    direction           bank_transaction_direction NOT NULL,
    amount              NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    currency_code       currency_code NOT NULL,
    bank_reference      VARCHAR(150),
    description         TEXT,
    source_type         VARCHAR(50),
    source_id           UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bank_transaction_reference
        UNIQUE NULLS NOT DISTINCT (bank_account_id, bank_reference)
);

CREATE INDEX idx_bank_transactions_account_date
ON bank_transactions(bank_account_id, transaction_date);

-- ============================================================================
-- DEBT
-- ============================================================================

CREATE TABLE debt_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    provider        debt_provider NOT NULL,
    currency_code   currency_code NOT NULL,
    debt_type       debt_type NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_debt_account
        UNIQUE (department_id, provider, currency_code, debt_type)
);

CREATE INDEX idx_debt_accounts_department ON debt_accounts(department_id);

CREATE TRIGGER trg_debt_accounts_updated_at
BEFORE UPDATE ON debt_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE debt_movements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_account_id     UUID NOT NULL REFERENCES debt_accounts(id) ON DELETE RESTRICT,
    business_date       DATE NOT NULL,
    movement_type       debt_movement_type NOT NULL,
    amount              NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    currency_code       currency_code NOT NULL,
    source_type         VARCHAR(50) NOT NULL,
    source_id           UUID NOT NULL,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debt_movements_account_date
ON debt_movements(debt_account_id, business_date);

CREATE TABLE debt_settlements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_account_id         UUID NOT NULL REFERENCES debt_accounts(id) ON DELETE RESTRICT,
    settlement_method       settlement_method NOT NULL,

    cash_account_id         UUID REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    bank_account_id         UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,

    settlement_amount       NUMERIC(20, 2) NOT NULL CHECK (settlement_amount > 0),
    settlement_currency     currency_code NOT NULL,

    fraction_amount         NUMERIC(20, 2) CHECK (fraction_amount IS NULL OR fraction_amount >= 0),
    fraction_exchange_rate  NUMERIC(20, 6) CHECK (fraction_exchange_rate IS NULL OR fraction_exchange_rate > 0),
    fraction_vnd_amount     NUMERIC(20, 2) CHECK (fraction_vnd_amount IS NULL OR fraction_vnd_amount >= 0),

    status                  ledger_entry_status NOT NULL DEFAULT 'DRAFT',
    created_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    settled_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_debt_settlement_method CHECK (
        (settlement_method = 'CASH' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
        OR
        (settlement_method = 'BANK' AND cash_account_id IS NULL AND bank_account_id IS NOT NULL)
        OR
        (settlement_method = 'MIXED' AND cash_account_id IS NOT NULL AND bank_account_id IS NOT NULL)
    )
);

CREATE INDEX idx_debt_settlements_account ON debt_settlements(debt_account_id);

CREATE TRIGGER trg_debt_settlements_updated_at
BEFORE UPDATE ON debt_settlements
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- JOURNAL FILES AND RECORDS
-- ============================================================================

CREATE TABLE journal_files (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id       UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    shift_id            UUID REFERENCES shifts(id) ON DELETE RESTRICT,
    provider            journal_provider NOT NULL,
    business_date       DATE NOT NULL,

    file_name           VARCHAR(255) NOT NULL,
    storage_key         TEXT NOT NULL UNIQUE,
    checksum            VARCHAR(128) NOT NULL UNIQUE,

    status              journal_file_status NOT NULL DEFAULT 'UPLOADED',
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    parsed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_files_lookup
ON journal_files(provider, department_id, business_date);

CREATE TRIGGER trg_journal_files_updated_at
BEFORE UPDATE ON journal_files
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE journal_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_file_id     UUID NOT NULL REFERENCES journal_files(id) ON DELETE CASCADE,
    row_number          INTEGER NOT NULL CHECK (row_number > 0),
    external_reference  VARCHAR(150),
    customer_name       VARCHAR(255),
    currency_code       currency_code,
    amount              NUMERIC(20, 2),
    raw_data            JSONB NOT NULL,
    parse_status        parse_status NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_journal_record_row UNIQUE (journal_file_id, row_number)
);

CREATE INDEX idx_journal_records_external_reference
ON journal_records(external_reference);

CREATE INDEX idx_journal_records_raw_data
ON journal_records USING GIN(raw_data);

-- ============================================================================
-- RECONCILIATION
-- ============================================================================

CREATE TABLE reconciliation_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id       UUID REFERENCES departments(id) ON DELETE RESTRICT,
    shift_id            UUID REFERENCES shifts(id) ON DELETE RESTRICT,
    type                reconciliation_type NOT NULL,
    status              reconciliation_status NOT NULL DEFAULT 'PENDING',

    started_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,

    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reconciliation_runs_department_shift
ON reconciliation_runs(department_id, shift_id);

CREATE INDEX idx_reconciliation_runs_type_status
ON reconciliation_runs(type, status);

CREATE TRIGGER trg_reconciliation_runs_updated_at
BEFORE UPDATE ON reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE reconciliation_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_run_id   UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,

    transaction_id          UUID REFERENCES transactions(id) ON DELETE RESTRICT,
    journal_record_id       UUID REFERENCES journal_records(id) ON DELETE RESTRICT,
    bank_transaction_id     UUID REFERENCES bank_transactions(id) ON DELETE RESTRICT,

    match_status            reconciliation_match_status NOT NULL,
    match_method            VARCHAR(100),

    expected_amount         NUMERIC(20, 2),
    actual_amount           NUMERIC(20, 2),
    difference_amount       NUMERIC(20, 2),

    review_note             TEXT,
    reviewed_by_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_reconciliation_item_source CHECK (
        transaction_id IS NOT NULL
        OR journal_record_id IS NOT NULL
        OR bank_transaction_id IS NOT NULL
    )
);

CREATE INDEX idx_reconciliation_items_run
ON reconciliation_items(reconciliation_run_id);

CREATE INDEX idx_reconciliation_items_status
ON reconciliation_items(match_status);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    recipient_department_id UUID REFERENCES departments(id) ON DELETE CASCADE,

    type                    VARCHAR(100) NOT NULL,
    title                   VARCHAR(255) NOT NULL,
    message                 TEXT NOT NULL,

    entity_type             VARCHAR(100),
    entity_id               UUID,

    status                  notification_status NOT NULL DEFAULT 'UNREAD',
    read_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_notification_recipient CHECK (
        recipient_user_id IS NOT NULL
        OR recipient_department_id IS NOT NULL
    ),
    CONSTRAINT chk_notification_read_status CHECK (
        (status = 'UNREAD' AND read_at IS NULL)
        OR
        (status IN ('READ', 'ARCHIVED'))
    )
);

CREATE INDEX idx_notifications_user_status
ON notifications(recipient_user_id, status, created_at DESC);

CREATE INDEX idx_notifications_department_status
ON notifications(recipient_department_id, status, created_at DESC);

-- ============================================================================
-- APPEND-ONLY AUDIT LOG
-- ============================================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE RESTRICT,
    department_id   UUID REFERENCES departments(id) ON DELETE RESTRICT,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,

    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID,

    request_id      VARCHAR(150),
    ip_address      INET,
    user_agent      TEXT,

    old_values      JSONB,
    new_values      JSONB,
    metadata        JSONB,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity
ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX idx_audit_logs_user
ON audit_logs(user_id, created_at DESC);

CREATE INDEX idx_audit_logs_department
ON audit_logs(department_id, created_at DESC);

CREATE INDEX idx_audit_logs_metadata
ON audit_logs USING GIN(metadata);

CREATE OR REPLACE FUNCTION prevent_audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE are not allowed';
END;
$$;

CREATE TRIGGER trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_changes();

CREATE TRIGGER trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_changes();

-- ============================================================================
-- REPORTING VIEWS
-- ============================================================================

CREATE VIEW vw_transaction_summary AS
SELECT
    t.id,
    t.transaction_no,
    t.type,
    t.status,
    t.business_date,
    t.department_id,
    d.code AS department_code,
    d.name AS department_name,
    t.shift_id,
    s.shift_code,
    t.created_by_user_id,
    u.full_name AS created_by_name,
    t.customer_name,
    t.customer_phone,
    t.reference_no,
    t.created_at
FROM transactions t
JOIN departments d ON d.id = t.department_id
JOIN shifts s ON s.id = t.shift_id
JOIN users u ON u.id = t.created_by_user_id;

CREATE VIEW vw_fund_account_balances AS
SELECT
    fa.id AS fund_account_id,
    fa.department_id,
    fa.code,
    fa.name,
    fa.account_type,
    fa.currency_code,
    COALESCE(
        SUM(
            CASE
                WHEN le.status <> 'POSTED' THEN 0
                WHEN ll.direction = 'DEBIT' THEN ll.amount
                WHEN ll.direction = 'CREDIT' THEN -ll.amount
                ELSE 0
            END
        ),
        0
    ) AS balance
FROM fund_accounts fa
LEFT JOIN ledger_lines ll ON ll.fund_account_id = fa.id
LEFT JOIN ledger_entries le ON le.id = ll.ledger_entry_id
GROUP BY
    fa.id,
    fa.department_id,
    fa.code,
    fa.name,
    fa.account_type,
    fa.currency_code;

-- ============================================================================
-- OPTIONAL SEED DATA
-- Uncomment and replace values before use.
-- ============================================================================

-- INSERT INTO companies (code, name)
-- VALUES ('DONGDA', 'Đống Đa');

-- ============================================================================
-- POST-DEPLOYMENT NOTES
-- ============================================================================
-- 1. The backend should create Transaction and its subtype detail in one DB
--    transaction.
-- 2. The backend must not accept calculated rates from the frontend without
--    recalculating and validating them.
-- 3. PostgreSQL CHECK constraints cannot enforce all cross-table business rules.
--    Keep backend authorization and workflow validation enabled.
-- 4. Ledger entries should be posted atomically with the related business
--    operation.
-- 5. Production should use migration tooling instead of executing this file
--    repeatedly against an existing database.
-- ============================================================================

COMMIT;
