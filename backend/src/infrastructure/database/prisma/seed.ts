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

  // 5. Admin (chỉ tạo nếu chưa có) — lấy adminUserId để seed ledger
  let adminUser = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!adminUser) {
    const adminRole = await prisma.roles.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const passwordHash = await bcrypt.hash('Admin@123456', 12);
    adminUser = await prisma.$transaction(async (tx) => {
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
      return user;
    });
    console.log('✅ Đã tạo admin (admin / Admin@123456 — đổi ngay)');
  }

  // 6. Sổ quỹ tiền mặt (CASH VND/USD) + số dư đầu kỳ cho MỌI chi nhánh
  await seedFundAccounts(adminUser.id);

  console.log('✅ Seed xong: company, hội sở + 5 CN, roles, admin, sổ quỹ + số dư đầu kỳ');
}

// Tạo sổ quỹ CASH VND/USD cho mỗi chi nhánh + ghi số dư đầu kỳ vào ledger (idempotent)
async function seedFundAccounts(adminUserId: string) {
  const OPENING = [
    { code: 'CASH_VND', name: 'Quỹ tiền mặt VND', currency: 'VND' as const, amount: 500_000_000, rate: 1 },
    { code: 'CASH_USD', name: 'Quỹ tiền mặt USD', currency: 'USD' as const, amount: 50_000, rate: 25_000 },
  ];
  const branches = await prisma.branch.findMany({ where: { status: 'ACTIVE' } });
  const now = new Date();

  for (const branch of branches) {
    for (const o of OPENING) {
      const existing = await prisma.fund_accounts.findUnique({
        where: { branch_id_code: { branch_id: branch.id, code: o.code } },
      });
      if (existing) continue; // đã có → bỏ qua (không nạp lại số dư đầu)

      const account = await prisma.fund_accounts.create({
        data: {
          branch_id: branch.id,
          code: o.code,
          name: o.name,
          account_type: 'CASH',
          currency_code: o.currency,
        },
      });
      // Số dư đầu kỳ = 1 ledger_entry POSTED, 1 line DEBIT (tăng quỹ)
      await prisma.ledger_entries.create({
        data: {
          entry_no: `OPEN-${branch.code}-${o.code}`,
          business_date: now,
          branch_id: branch.id,
          source_type: 'CASH_MOVEMENT',
          source_id: account.id,
          status: 'POSTED',
          posted_at: now,
          description: 'Số dư đầu kỳ',
          created_by_user_id: adminUserId,
          ledger_lines: {
            create: [{
              fund_account_id: account.id,
              direction: 'DEBIT',
              amount: o.amount,
              currency_code: o.currency,
              exchange_rate: o.rate,
              base_amount_vnd: o.amount * o.rate,
            }],
          },
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
