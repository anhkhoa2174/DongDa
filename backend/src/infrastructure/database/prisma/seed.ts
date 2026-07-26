// Seed: dữ liệu khởi tạo cho schema v3
//   company → head office + 5 chi nhánh → roles → admin (employee + user + user_role)
// Idempotent: chạy lại không tạo trùng.

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLES = [
  { code: 'ADMIN', name: 'Quản trị hệ thống' },
  { code: 'MANAGER', name: 'Kế toán tổng hợp / Trưởng chi nhánh' },
  { code: 'STAFF', name: 'Nhân viên chi nhánh' },
  { code: 'AUDITOR', name: 'Kiểm toán (chỉ đọc)' },
];

const BRANCHES = [
  { code: 'NCT', name: 'Chi nhánh Nguyễn Cư Trinh' },
  { code: 'TAO_DAN', name: 'Chi nhánh Tao Đàn' },
  { code: 'LHP', name: 'Chi nhánh Lê Hồng Phong' },
  { code: 'BAY_HIEN', name: 'Chi nhánh Bảy Hiền' },
  { code: 'AN_DONG', name: 'Chi nhánh An Đông' },
];

async function main() {
  // 1. Company
  const company = await prisma.companies.upsert({
    where: { code: 'DONGDA' },
    update: {},
    create: { code: 'DONGDA', name: 'Công ty TNHH TM DV PT Đống Đa' },
  });

  // 2. Head office
  const headOffice = await prisma.branch.upsert({
    where: { company_id_code: { company_id: company.id, code: 'HO' } },
    update: {},
    create: { company_id: company.id, code: 'HO', name: 'Hội sở', type: 'HEAD_OFFICE' },
  });

  // 3. 5 chi nhánh giao dịch
  for (const b of BRANCHES) {
    await prisma.branch.upsert({
      where: { company_id_code: { company_id: company.id, code: b.code } },
      update: {},
      create: { company_id: company.id, code: b.code, name: b.name, type: 'BRANCH' },
    });
  }

  // 4. Roles
  for (const r of ROLES) {
    await prisma.roles.upsert({ where: { code: r.code }, update: {}, create: r });
  }

  // 5. Admin (chỉ tạo nếu chưa có)
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (existing) {
    console.log('✅ Admin đã tồn tại — bỏ qua seed user');
    return;
  }

  const adminRole = await prisma.roles.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const passwordHash = await bcrypt.hash('Admin@123456', 12);

  await prisma.$transaction(async (tx) => {
    const employee = await tx.employees.create({
      data: {
        branch_id: headOffice.id,
        employee_code: 'EMP_ADMIN',
        full_name: 'Quản trị viên',
        email: 'admin@dongda.vn',
        status: 'ACTIVE',
      },
    });
    const user = await tx.user.create({
      data: {
        employee_id: employee.id,
        username: 'admin',
        password_hash: passwordHash,
        status: 'ACTIVE',
        must_change_password: true,
      },
    });
    await tx.user_roles.create({ data: { user_id: user.id, role_id: adminRole.id } });
  });

  console.log('✅ Đã seed: company, hội sở + 5 chi nhánh, 4 roles, tài khoản admin');
  console.log('   Username: admin');
  console.log('   Password: Admin@123456  ← ĐỔI NGAY sau lần đăng nhập đầu tiên!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
