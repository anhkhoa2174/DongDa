import {
  BadRequestException, Body, Controller, Inject, Post, Request, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateEmployeeDto } from '../../../application/dtos/organization/organization.dto';

type HashPort = {
  hash(plain: string): Promise<string>;
};

@Controller('organization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('IHashService') private readonly hashService: HashPort,
  ) {}

  @Post('employees')
  @Roles(UserRole.ADMIN)
  async createEmployee(@Request() req: any, @Body() dto: CreateEmployeeDto) {
    if (dto.account?.role === UserRole.ADMIN) {
      throw new BadRequestException('Không tạo thêm tài khoản ADMIN từ form nhân viên');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.account) {
        const existingUsername = await tx.user.findUnique({ where: { username: dto.account.username } });
        if (existingUsername) throw new BadRequestException('Username đã tồn tại');
      }

      const employeeCode = dto.employeeCode?.trim()
        || `EMP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const employeeRows = await tx.$queryRaw<any[]>`
        INSERT INTO employees(branch_id, employee_code, full_name, phone, email, hired_at, status)
        VALUES (
          ${dto.branchId}::uuid,
          ${employeeCode},
          ${dto.fullName.trim()},
          ${dto.phone ?? null},
          ${dto.email ?? null},
          ${dto.hiredAt ? new Date(dto.hiredAt) : null},
          'ACTIVE'
        )
        RETURNING id, branch_id AS "branchId", employee_code AS "employeeCode",
          full_name AS "fullName", phone, email, status, hired_at AS "hiredAt", created_at AS "createdAt"
      `;
      const employee = employeeRows[0];

      if (!dto.account) return { employee, user: null };

      const role = await tx.roles.findUnique({ where: { code: dto.account.role } });
      if (!role) throw new BadRequestException(`Role không tồn tại: ${dto.account.role}`);

      const passwordHash = await this.hashService.hash(dto.account.password);
      const user = await tx.user.create({
        data: {
          employee_id: employee.id,
          username: dto.account.username,
          password_hash: passwordHash,
          status: 'ACTIVE',
        },
      });
      await tx.user_roles.create({ data: { user_id: user.id, role_id: role.id } });

      return {
        employee,
        user: {
          id: user.id,
          username: user.username,
          role: dto.account.role,
          isActive: user.status === 'ACTIVE',
          createdByUserId: req.user.id,
        },
      };
    });
  }
}
