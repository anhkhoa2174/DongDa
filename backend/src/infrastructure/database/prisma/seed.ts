// Seed: dữ liệu khởi tạo cho schema v3
//   company → head office + 5 chi nhánh → roles → tài khoản vận hành → fund accounts
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
  { code: 'NCT', name: 'Chi nhánh Nguyễn Chí Thanh' },
  { code: 'TAO_DAN', name: 'Chi nhánh Tao Đàn' },
  { code: 'LHP', name: 'Chi nhánh Lê Hồng Phong' },
  { code: 'BAY_HIEN', name: 'Chi nhánh Bảy Hiền' },
  { code: 'AN_DONG', name: 'Chi nhánh An Đông' },
];

const OPERATION_USERS = [
  {
    username: 'giamdoc',
    password: 'Giamdoc@123456',
    roleCode: 'ADMIN',
    branchCode: 'HO',
    employeeCode: 'EMP_GIAMDOC',
    fullName: 'Giám đốc Đống Đa',
    email: 'giamdoc@dongda.vn',
  },
  {
    username: 'ktth',
    password: 'Ktth@123456',
    roleCode: 'MANAGER',
    branchCode: 'HO',
    employeeCode: 'EMP_KTTH',
    fullName: 'Kế toán tổng hợp',
    email: 'ktth@dongda.vn',
  },
  {
    username: 'nv_nct',
    password: 'Staff@123456',
    roleCode: 'STAFF',
    branchCode: 'NCT',
    employeeCode: 'EMP_NV_NCT',
    fullName: 'Nhân viên Nguyễn Chí Thanh',
    email: 'nv_nct@dongda.vn',
  },
  {
    username: 'nv_tao_dan',
    password: 'Staff@123456',
    roleCode: 'STAFF',
    branchCode: 'TAO_DAN',
    employeeCode: 'EMP_NV_TAO_DAN',
    fullName: 'Nhân viên Tao Đàn',
    email: 'nv_tao_dan@dongda.vn',
  },
  {
    username: 'nv_lhp',
    password: 'Staff@123456',
    roleCode: 'STAFF',
    branchCode: 'LHP',
    employeeCode: 'EMP_NV_LHP',
    fullName: 'Nhân viên Lê Hồng Phong',
    email: 'nv_lhp@dongda.vn',
  },
  {
    username: 'nv_bay_hien',
    password: 'Staff@123456',
    roleCode: 'STAFF',
    branchCode: 'BAY_HIEN',
    employeeCode: 'EMP_NV_BAY_HIEN',
    fullName: 'Nhân viên Bảy Hiền',
    email: 'nv_bay_hien@dongda.vn',
  },
  {
    username: 'nv_an_dong',
    password: 'Staff@123456',
    roleCode: 'STAFF',
    branchCode: 'AN_DONG',
    employeeCode: 'EMP_NV_AN_DONG',
    fullName: 'Nhân viên An Đông',
    email: 'nv_an_dong@dongda.vn',
  },
] as const;

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
      update: { name: b.name, type: 'BRANCH' },
      create: { company_id: company.id, code: b.code, name: b.name, type: 'BRANCH' },
    });
  }

  // 4. Roles
  for (const r of ROLES) {
    await prisma.roles.upsert({ where: { code: r.code }, update: {}, create: r });
  }

  // 5. Admin kỹ thuật cũ + bộ tài khoản vận hành — lấy adminUserId để seed ledger
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

  await seedOperationUsers();
  const directorUser = await prisma.user.findUnique({ where: { username: 'giamdoc' } });
  const seedUserId = directorUser?.id ?? adminUser.id;
  await seedActiveExchangeRates(seedUserId);

  // 6. Sổ quỹ tiền mặt (CASH VND/USD) + số dư đầu kỳ cho MỌI chi nhánh
  await seedFundAccounts(seedUserId);

  console.log('✅ Seed xong: company, hội sở + 5 CN, roles, tài khoản GĐ/KTTH/5 CN, tỷ giá active, sổ quỹ + số dư đầu kỳ');
}

async function seedOperationUsers() {
  for (const item of OPERATION_USERS) {
    await seedUser(item);
  }

  console.log('✅ Đã tạo/cập nhật tài khoản vận hành: giamdoc, ktth, 5 nhân viên chi nhánh');
}

async function seedUser(input: typeof OPERATION_USERS[number]) {
  const role = await prisma.roles.findUniqueOrThrow({ where: { code: input.roleCode } });
  const branch = await prisma.branch.findFirstOrThrow({
    where: { code: input.branchCode, status: 'ACTIVE' },
  });
  const passwordHash = await bcrypt.hash(input.password, 12);
  const existingUser = await prisma.user.findUnique({ where: { username: input.username } });

  await prisma.$transaction(async (tx) => {
    if (existingUser) {
      await tx.employees.update({
        where: { id: existingUser.employee_id },
        data: {
          branch_id: branch.id,
          employee_code: input.employeeCode,
          full_name: input.fullName,
          email: input.email,
          status: 'ACTIVE',
        },
      });
      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          password_hash: passwordHash,
          status: 'ACTIVE',
          must_change_password: false,
        },
      });
      await tx.user_roles.deleteMany({ where: { user_id: existingUser.id } });
      await tx.user_roles.create({ data: { user_id: existingUser.id, role_id: role.id } });
      return;
    }

    const employee = await tx.employees.create({
      data: {
        branch_id: branch.id,
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
        must_change_password: false,
      },
    });
    await tx.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
  });
}

async function seedActiveExchangeRates(adminUserId: string) {
  const now = new Date();
  const rates = [
    { rate_type: 'PAID_SELL', provider: 'WU_MG', from_currency: 'USD', rate: 26600 },
    { rate_type: 'PAID_BUY', provider: 'WU_MG', from_currency: 'USD', rate: 26500 },
    { rate_type: 'BANK_RATE', provider: 'BANK', from_currency: 'USD', rate: 26550 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'USD', rate: 26500 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'USD', rate: 26700 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'EUR', rate: 29000 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'EUR', rate: 29400 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'AUD', rate: 16650 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'AUD', rate: 17050 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'JPY', rate: 167 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'JPY', rate: 174 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'GBP', rate: 33800 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'GBP', rate: 34400 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'SGD', rate: 19800 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'SGD', rate: 20200 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'CNY', rate: 3520 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'CNY', rate: 3610 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'KRW', rate: 18.2 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'KRW', rate: 20.1 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'THB', rate: 735 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'THB', rate: 770 },
    { rate_type: 'FX_BUY', provider: 'INTERNAL', from_currency: 'HKD', rate: 3250 },
    { rate_type: 'FX_SELL', provider: 'INTERNAL', from_currency: 'HKD', rate: 3340 },
  ] as const;

  for (const rate of rates) {
    const existing = await prisma.exchange_rates.findFirst({
      where: {
        rate_type: rate.rate_type,
        provider: rate.provider,
        from_currency: rate.from_currency,
        to_currency: 'VND',
        status: 'ACTIVE',
      },
    });

    if (existing) {
      await prisma.exchange_rates.update({
        where: { id: existing.id },
        data: { rate: rate.rate, effective_from: now, approved_by_user_id: adminUserId, approved_at: now },
      });
      continue;
    }

    await prisma.exchange_rates.create({
      data: {
        ...rate,
        to_currency: 'VND',
        effective_from: now,
        status: 'ACTIVE',
        created_by_user_id: adminUserId,
        approved_by_user_id: adminUserId,
        approved_at: now,
      },
    });
  }

  console.log('✅ Đã seed tỷ giá ACTIVE dev');
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
