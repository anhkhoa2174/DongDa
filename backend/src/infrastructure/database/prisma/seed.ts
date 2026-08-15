import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SYSTEM_ROLES = [
  { code: 'ADMIN', name: 'Quản trị hệ thống' },
  { code: 'MANAGER', name: 'Kế toán tổng hợp / Trưởng chi nhánh' },
  { code: 'STAFF', name: 'Nhân viên chi nhánh' },
  { code: 'AUDITOR', name: 'Kiểm toán (chỉ đọc)' },
] as const;

const INITIAL_USERS = [
  {
    username: 'admin',
    password: 'Admin@123456',
    roleCode: 'ADMIN',
    employeeCode: 'EMP_ADMIN',
    fullName: 'Quản trị viên',
    email: 'admin@dongda.vn',
  },
  {
    username: 'auditor',
    password: 'Auditor@123456',
    roleCode: 'AUDITOR',
    employeeCode: 'EMP_AUDITOR',
    fullName: 'Kiểm toán viên',
    email: 'auditor@dongda.vn',
  },
] as const;

async function seedInitialUser(input: typeof INITIAL_USERS[number], headOfficeId: string) {
  const role = await prisma.roles.findUniqueOrThrow({ where: { code: input.roleCode } });
  const existingUser = await prisma.user.findUnique({ where: { username: input.username } });

  if (existingUser) {
    await prisma.$transaction([
      prisma.employees.update({
        where: { id: existingUser.employee_id },
        data: {
          branch_id: headOfficeId,
          employee_code: input.employeeCode,
          full_name: input.fullName,
          email: input.email,
          status: 'ACTIVE',
        },
      }),
      prisma.user.update({
        where: { id: existingUser.id },
        data: { status: 'ACTIVE' },
      }),
      prisma.user_roles.deleteMany({ where: { user_id: existingUser.id } }),
      prisma.user_roles.create({ data: { user_id: existingUser.id, role_id: role.id } }),
    ]);
    return;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.$transaction(async (tx) => {
    const employee = await tx.employees.create({
      data: {
        branch_id: headOfficeId,
        employee_code: input.employeeCode,
        full_name: input.fullName,
        email: input.email,
        status: 'ACTIVE',
      },
    });
    const user = await tx.user.create({
      data: {
        employee_id: employee.id,
        username: input.username,
        password_hash: passwordHash,
        status: 'ACTIVE',
        must_change_password: true,
      },
    });
    await tx.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
  });
}

async function main() {
  const company = await prisma.companies.upsert({
    where: { code: 'DONGDA' },
    update: { name: 'Công ty TNHH TM DV PT Đống Đa', status: 'ACTIVE' },
    create: { code: 'DONGDA', name: 'Công ty TNHH TM DV PT Đống Đa' },
  });

  const headOffice = await prisma.branch.upsert({
    where: { company_id_code: { company_id: company.id, code: 'HO' } },
    update: { name: 'Hội sở', type: 'HEAD_OFFICE', status: 'ACTIVE' },
    create: {
      company_id: company.id,
      code: 'HO',
      name: 'Hội sở',
      type: 'HEAD_OFFICE',
    },
  });

  for (const role of SYSTEM_ROLES) {
    await prisma.roles.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  for (const user of INITIAL_USERS) {
    await seedInitialUser(user, headOffice.id);
  }

  console.log('Seed hoàn tất: DONGDA, HO, system roles, admin và auditor.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
