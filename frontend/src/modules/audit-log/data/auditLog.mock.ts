export type AuditAction =
  | 'LOGIN' | 'LOGOUT'
  | 'CREATE' | 'UPDATE' | 'VOID' | 'APPROVE' | 'REJECT'
  | 'OPEN_SHIFT' | 'CLOSE_SHIFT'
  | 'UPLOAD_JOURNAL' | 'RECONCILE';

export type AuditEntity =
  | 'Session' | 'Transaction' | 'ExchangeRate' | 'Shift' | 'Transfer'
  | 'User' | 'BankAccount' | 'JournalUpload';

export type AuditRecord = {
  id: string;
  at: string;
  userId: string;
  userName: string;
  role: string;
  ip: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  before?: string;
  after?: string;
};

export const auditRecordsMock: AuditRecord[] = [
  { id: '1', at: '2026-06-29T14:32:18', userId: 'u4', userName: 'Phạm Thị Huệ', role: 'NV CN', ip: '10.0.1.12', action: 'CREATE', entity: 'Transaction', entityId: 'WU-2128', after: '$1,000' },
  { id: '2', at: '2026-06-29T14:18:02', userId: 'u4', userName: 'Phạm Thị Huệ', role: 'NV CN', ip: '10.0.2.18', action: 'CREATE', entity: 'Transaction', entityId: 'MG-845', after: '$500' },
  { id: '3', at: '2026-06-29T11:32:45', userId: 'u3', userName: 'Lê Văn Minh', role: 'Trưởng CN', ip: '10.0.1.10', action: 'APPROVE', entity: 'Transfer', entityId: 'DD-2026060700003', before: 'Pending', after: 'Confirmed' },
  { id: '4', at: '2026-06-29T10:05:30', userId: 'u4', userName: 'Phạm Thị Huệ', role: 'NV CN', ip: '10.0.2.18', action: 'UPDATE', entity: 'Transaction', entityId: 'WU-2105', before: '$500', after: '$510 — WU sửa MTCN' },
  { id: '5', at: '2026-06-29T07:42:11', userId: 'u1', userName: 'Nguyễn Văn A', role: 'GĐ', ip: '10.0.0.5', action: 'APPROVE', entity: 'ExchangeRate', entityId: 'USD-2026-06-29', before: 'Pending', after: 'Active — USD: 25,650' },
  { id: '6', at: '2026-06-29T07:38:02', userId: 'u2', userName: 'Trần Thị Lan', role: 'KTTH', ip: '10.0.0.8', action: 'CREATE', entity: 'ExchangeRate', entityId: 'USD-2026-06-29', after: 'USD: 25,650 (PENDING)' },
  { id: '7', at: '2026-06-29T07:30:15', userId: 'u3', userName: 'Lê Văn Minh', role: 'Trưởng CN', ip: '10.0.1.12', action: 'LOGIN', entity: 'Session', after: 'Chrome 124, Win10' },
  { id: '8', at: '2026-06-29T07:30:00', userId: 'u4', userName: 'Phạm Thị Huệ', role: 'NV CN', ip: '10.0.2.18', action: 'OPEN_SHIFT', entity: 'Shift', entityId: 'SHIFT-TD-20260629', after: 'Đầu ca 187,420,000 VND' },
  { id: '9', at: '2026-06-28T17:30:00', userId: 'u5', userName: 'Trần Thị Nguyệt', role: 'NV CN', ip: '10.0.3.18', action: 'CLOSE_SHIFT', entity: 'Shift', entityId: 'SHIFT-AD-20260628', before: '276,480,000', after: '276,300,000 (chênh -180K)' },
  { id: '10', at: '2026-06-28T17:00:00', userId: 'u2', userName: 'Trần Thị Lan', role: 'KTTH', ip: '10.0.0.8', action: 'UPLOAD_JOURNAL', entity: 'JournalUpload', entityId: 'WU_2026-06-28.pdf', after: 'Đã parse 32 dòng' },
  { id: '11', at: '2026-06-28T09:20:00', userId: 'u3', userName: 'Lê Văn Minh', role: 'Trưởng CN', ip: '10.0.1.10', action: 'VOID', entity: 'Transaction', entityId: 'WU-2098', before: 'Active $700', after: 'Voided — Lý do: khách hủy' },
];

export const actionColors: Record<AuditAction, string> = {
  LOGIN:          'green',
  LOGOUT:         'default',
  CREATE:         'blue',
  UPDATE:         'gold',
  VOID:           'red',
  APPROVE:        'green',
  REJECT:         'red',
  OPEN_SHIFT:     'geekblue',
  CLOSE_SHIFT:    'purple',
  UPLOAD_JOURNAL: 'cyan',
  RECONCILE:      'magenta',
};
