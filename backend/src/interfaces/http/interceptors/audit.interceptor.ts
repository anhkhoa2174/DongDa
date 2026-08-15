// AuditInterceptor — Flow 6a: tự ghi Audit Log cho mọi thao tác ghi (append-only)
// Layer: Interface
//
// Chặn mọi request KHÔNG phải GET, ghi lại cả kết quả thành công và thất bại.
// Lỗi ghi audit KHÔNG làm hỏng response (best-effort).

import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IAuditRepository } from '../../../domain/repositories/audit.repository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_PARTS = ['password', 'token', 'secret', 'pin'];

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_PARTS.some((part) => normalized.includes(part));
}

function redact(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map(redact);
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveKey(k)) out[k] = '***';
    else if (v && typeof v === 'object') out[k] = redact(v);
    else out[k] = v;
  }
  return out;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject('IAuditRepository') private readonly audit: IAuditRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    // Chỉ ghi log cho thao tác thay đổi dữ liệu
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') {
      return next.handle();
    }

    const routePath = req.route?.path ?? (req.originalUrl || req.url || '').split('?')[0];
    const cleanPath = String(routePath).replace(/^\/?api\/v\d+\//, '').replace(/^\//, '');
    const entityType = cleanPath.split('/').filter(Boolean)[0] ?? 'unknown';
    const append = (outcome: 'SUCCESS' | 'ERROR', body?: any, error?: any) => {
      const rawId = body?.id ?? req.params?.id;
      const entityId = typeof rawId === 'string' && UUID_RE.test(rawId) ? rawId : null;
      void this.audit.append({
        userId: req.user?.id ?? null,
        action: `${method} ${routePath}`,
        entityType,
        entityId,
        beforeData: redact(req.body),
        afterData: outcome === 'SUCCESS'
          ? { outcome, response: redact(body) }
          : {
            outcome,
            statusCode: error?.status ?? error?.statusCode ?? 500,
            error: redact({ name: error?.name, message: error?.message }),
          },
        ipAddress: req.ip ?? null,
        userAgent: req.headers?.['user-agent'] ?? null,
      }).catch(() => undefined);
    };

    return next.handle().pipe(tap({
      next: (body) => append('SUCCESS', body),
      error: (error) => append('ERROR', undefined, error),
    }));
  }
}
