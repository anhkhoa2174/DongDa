// Repository Interface: Audit Log (Port) — append-only
// Layer: Domain

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: any;
  afterData?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogRecord extends AuditEntry {
  id: string;
  createdAt: Date;
}

export interface ListAuditFilter {
  userId?: string;
  entityType?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export interface IAuditRepository {
  append(entry: AuditEntry): Promise<void>; // chỉ INSERT — không update/delete
  list(filter?: ListAuditFilter): Promise<AuditLogRecord[]>;
}
