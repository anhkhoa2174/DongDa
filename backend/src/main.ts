// main.ts — NestJS bootstrap
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Bảo mật (NF1)
  // helmet() thêm các HTTP header bảo mật (ngăn XSS, clickjacking...)
  // Tắt contentSecurityPolicy để Swagger UI load được CSS/JS của nó
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  // Global validation pipe — tự động validate DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — chỉ cho phép frontend origin (KHÔNG dùng APP_URL vì đó là URL backend)
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  // ─── SWAGGER / API DOC ────────────────────────────────────────────────────
  // Chỉ bật Swagger ở môi trường development (không expose ở production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('DongDa API')
      .setDescription(
        `## Hệ thống Quản lý Quỹ & Giao dịch — Công ty Đống Đa
        
**Cách dùng Swagger:**
1. Đăng nhập: gọi \`POST /auth/login\` với \`username: admin\`, \`password: Admin@123456\`
2. Copy \`accessToken\` từ response
3. Click nút **Authorize 🔒** (góc phải trên) → dán token vào ô \`Bearer <token>\`
4. Giờ có thể gọi tất cả API cần xác thực

**Tài khoản mặc định (sau khi chạy seed):**
- Admin: \`admin\` / \`Admin@123456\`
- Auditor: \`auditor\` / \`Auditor@123456\``,
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Dán accessToken vào đây (không cần gõ "Bearer " thủ công)',
        },
        'JWT', // tên security scheme — dùng @ApiBearerAuth('JWT') ở controller
      )
      .addTag('Auth', 'Đăng nhập, đăng xuất, refresh token, đổi mật khẩu')
      .addTag('Users', 'Quản lý tài khoản người dùng')
      .addTag('Exchange Rate', 'Quản lý tỷ giá ngoại tệ')
      .addTag('Fund', 'Quản lý quỹ tiền và chuyển quỹ')
      .addTag('Shift', 'Quản lý ca làm việc')
      .addTag('Debt', 'Quản lý công nợ')
      .addTag('Western Union', 'Giao dịch Western Union')
      .addTag('MoneyGram', 'Giao dịch MoneyGram')
      .addTag('FX', 'Giao dịch ngoại tệ')
      .addTag('Bank', 'Ngân hàng đối tác')
      .addTag('Reconciliation', 'Đối chiếu sổ sách')
      .addTag('Reports', 'Báo cáo tổng hợp')
      .addTag('Branch Monitoring', 'Giám sát chi nhánh')
      .addTag('Audit Log', 'Nhật ký thao tác hệ thống')
      .addTag('Organization', 'Quản lý tổ chức & nhân viên')
      .addTag('Notifications', 'Thông báo in-app')
      // ← Áp dụng JWT security cho TẤT CẢ endpoints mặc định
      // Swagger sẽ tự động gửi header "Authorization: Bearer <token>" cho mọi request
      // (trừ các API không cần auth như /auth/login thì vẫn hoạt động bình thường)
      .addSecurityRequirements('JWT')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    // Swagger UI tại: http://localhost:3000/api/docs
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // Giữ token sau khi refresh trang
        tagsSorter: 'alpha',
        operationsSorter: 'method',
      },
    });

    console.log(`📖 Swagger UI: http://localhost:${process.env.PORT ?? 3000}/api/docs`);
  }
  // ─────────────────────────────────────────────────────────────────────────

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🚀 Server running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
