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

BEGIN;

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
    'CASH_COUNT'
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
    requires_shift BOOLEAN;
BEGIN
    SELECT requires_shift
    INTO requires_shift
    FROM operation_types
    WHERE code = NEW.operation_code;

    IF requires_shift IS DISTINCT FROM TRUE THEN
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

CREATE INDEX idx_debt_movements_account_date
ON debt_movements(debt_account_id, business_date);

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

COMMIT;
