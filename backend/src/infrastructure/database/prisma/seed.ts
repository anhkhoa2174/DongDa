// Seed: Tạo tài khoản Admin mặc định
// Chạy: npx ts-node prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminExists = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  if (adminExists) {
    console.log('✅ Admin đã tồn tại — bỏ qua seed');
    return;
  }

  const hashedPassword = await bcrypt.hash('Admin@123456', 12);

  await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@dongda.vn',
      password: hashedPassword,
      fullName: 'Quản trị viên',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('✅ Đã tạo tài khoản Admin mặc định');
  console.log('   Username: admin');
  console.log('   Password: Admin@123456  ← ĐỔI NGAY sau lần đăng nhập đầu tiên!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
