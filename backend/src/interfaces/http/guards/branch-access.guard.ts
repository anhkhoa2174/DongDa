// Branch Access Guard
// Layer: Interface — enforce chi nhánh isolation (NF3)
// Chi nhánh A không được xem dữ liệu chi nhánh B

import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { canAccessBranch } from '../../../domain/entities/user.entity';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    // branchId từ route param hoặc query (ví dụ: /branches/:branchId/...)
    const targetBranchId: string | undefined =
      req.params?.branchId ?? req.query?.branchId ?? req.body?.branchId;

    if (!targetBranchId) return true; // Không có branchId → không cần kiểm tra

    if (!canAccessBranch(user, targetBranchId)) {
      throw new ForbiddenException('Bạn không có quyền truy cập dữ liệu chi nhánh này');
    }

    return true;
  }
}
