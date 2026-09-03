-- Dọn các thông báo cũ từng bị gửi sai do điều kiện chi nhánh lấy mọi role bằng OR.
-- Notifications chỉ là hộp thư người dùng; audit_logs và dữ liệu nghiệp vụ không bị tác động.
DELETE FROM notifications AS notification
USING users AS recipient, user_roles AS assignment, roles AS role
WHERE notification.recipient_user_id = recipient.id
  AND assignment.user_id = recipient.id
  AND role.id = assignment.role_id
  AND (
    (
      role.code = 'AUDITOR'
      AND notification.source_type IN (
        'BANK_INTERNAL_TRANSFER',
        'FUND_TRANSFER_CREATED',
        'FUND_TRANSFER_CONFIRMED',
        'FUND_TRANSFER_REJECTED',
        'FUND_TRANSFER_CANCELLED',
        'BRANCH_FUND_MOVEMENT',
        'DEBT_SETTLED',
        'DEBT_PARTIALLY_SETTLED',
        'SHIFT_CASH_COUNT',
        'RECONCILIATION_VARIANCE',
        'ADVANCE_CK_UNSETTLED',
        'JOURNAL_PENDING_REVIEW',
        'WU_BRANCH_RECON_SUBMITTED',
        'MG_BRANCH_RECON_SUBMITTED'
      )
    )
    OR (
      role.code = 'STAFF'
      AND notification.source_type IN (
        'ADVANCE_CK_UNSETTLED',
        'JOURNAL_PENDING_REVIEW',
        'WU_BRANCH_RECON_SUBMITTED',
        'MG_BRANCH_RECON_SUBMITTED',
        'CENTRAL_FUND_MOVEMENT',
        'CENTRAL_FUND_CONVERSION'
      )
    )
  );
