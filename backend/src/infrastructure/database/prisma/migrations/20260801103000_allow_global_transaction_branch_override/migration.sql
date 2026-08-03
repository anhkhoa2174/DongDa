CREATE OR REPLACE FUNCTION validate_customer_transaction_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    shift_branch UUID;
    shift_state shift_status;
    user_branch UUID;
    is_global_user BOOLEAN;
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

    IF shift_state <> 'OPEN' THEN
        RAISE EXCEPTION 'Transactions can only be created in an OPEN shift';
    END IF;

    SELECT e.branch_id,
           EXISTS (
               SELECT 1
               FROM user_roles ur
               JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id
                 AND r.code IN ('ADMIN', 'MANAGER')
           )
    INTO user_branch, is_global_user
    FROM users u
    JOIN employees e ON e.id = u.employee_id
    WHERE u.id = NEW.created_by_user_id;

    IF user_branch IS NULL THEN
        RAISE EXCEPTION 'User % does not exist or has no employee branch', NEW.created_by_user_id;
    END IF;

    IF is_global_user IS DISTINCT FROM TRUE AND user_branch <> NEW.branch_id THEN
        RAISE EXCEPTION 'Transaction creator must belong to transaction branch';
    END IF;

    RETURN NEW;
END;
$$;
