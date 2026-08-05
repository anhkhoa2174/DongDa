// NestJS App Module — wiring tất cả modules
// Layer: Interface

import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaService } from './infrastructure/database/prisma.service';
import { PrismaUserRepository } from './infrastructure/database/repositories/prisma-user.repository';

import { LoginUseCase } from './application/use-cases/auth/login.use-case';
import { CreateUserUseCase } from './application/use-cases/auth/create-user.use-case';
import { ChangePasswordUseCase } from './application/use-cases/auth/change-password.use-case';
import { RefreshTokenUseCase } from './application/use-cases/auth/refresh-token.use-case';

import { AuthController, UserController } from './interfaces/http/controllers/auth.controller';
import { ExchangeRateController } from './interfaces/http/controllers/exchange-rate.controller';
import { DebtController } from './interfaces/http/controllers/debt.controller';
import { BranchController } from './interfaces/http/controllers/branch.controller';
import { PrismaBranchRepository } from './infrastructure/database/repositories/prisma-branch.repository';
import { FundController } from './interfaces/http/controllers/fund.controller';
import { PrismaFundRepository } from './infrastructure/database/repositories/prisma-fund.repository';
import {
  CreateTransferUseCase, ConfirmTransferUseCase, RejectTransferUseCase, ListFundUseCase,
  CreateFundMovementUseCase,
} from './application/use-cases/fund/fund-transfer.use-cases';
import { WuController } from './interfaces/http/controllers/wu.controller';
import { PrismaWuRepository } from './infrastructure/database/repositories/prisma-wu.repository';
import { CreateWuUseCase, ListWuUseCase } from './application/use-cases/wu/wu.use-cases';
import { MgController } from './interfaces/http/controllers/mg.controller';
import { PrismaMgRepository } from './infrastructure/database/repositories/prisma-mg.repository';
import { CreateMgUseCase, ListMgUseCase } from './application/use-cases/mg/mg.use-cases';
import { FxController } from './interfaces/http/controllers/fx.controller';
import { PrismaFxRepository } from './infrastructure/database/repositories/prisma-fx.repository';
import { CreateFxUseCase, ListFxUseCase } from './application/use-cases/fx/fx.use-cases';
import { BankController } from './interfaces/http/controllers/bank.controller';
import { PrismaBankRepository } from './infrastructure/database/repositories/prisma-bank.repository';
import { ListBankUseCase, ReceiveFromProviderUseCase } from './application/use-cases/bank/bank.use-cases';
import { ReconciliationController } from './interfaces/http/controllers/reconciliation.controller';
import { PrismaReconciliationRepository } from './infrastructure/database/repositories/prisma-reconciliation.repository';
import { RunReconciliationUseCase, ListReconciliationUseCase } from './application/use-cases/reconciliation/reconciliation.use-cases';
import { AuditLogController } from './interfaces/http/controllers/audit-log.controller';
import { PrismaAuditRepository } from './infrastructure/database/repositories/prisma-audit.repository';
import { ListAuditUseCase } from './application/use-cases/audit/list-audit.use-case';
import { AuditInterceptor } from './interfaces/http/interceptors/audit.interceptor';
import { ReportsController } from './interfaces/http/controllers/reports.controller';
import { PrismaReportsRepository } from './infrastructure/database/repositories/prisma-reports.repository';
import { GetSummaryUseCase } from './application/use-cases/reports/get-summary.use-case';
import { ShiftController } from './interfaces/http/controllers/shift.controller';
import { PrismaShiftRepository } from './infrastructure/database/repositories/prisma-shift.repository';
import { OpenShiftUseCase, CloseShiftUseCase, CurrentShiftUseCase } from './application/use-cases/shift/shift.use-cases';
import { OrganizationController } from './interfaces/http/controllers/organization.controller';
import { TransactionAdminController } from './interfaces/http/controllers/transaction-admin.controller';
import { BranchMonitoringController } from './interfaces/http/controllers/branch-monitoring.controller';
import { PrismaBranchMonitoringRepository } from './infrastructure/database/repositories/prisma-branch-monitoring.repository';
import { GetBranchMonitoringUseCase } from './application/use-cases/branch-monitoring/get-branch-monitoring.use-case';
import { JwtStrategy } from './interfaces/http/guards/jwt.strategy';
import { HashService } from './infrastructure/config/hash.service';
import { NotificationController } from './interfaces/http/controllers/notification.controller';
import { NotificationService } from './infrastructure/notifications/notification.service';

import { PrismaExchangeRateRepository } from './infrastructure/database/repositories/prisma-exchange-rate.repository';
import { CreateExchangeRateUseCase } from './application/use-cases/exchange-rate/create-exchange-rate.use-case';
import { ApproveExchangeRateUseCase } from './application/use-cases/exchange-rate/approve-exchange-rate.use-case';
import { RejectExchangeRateUseCase } from './application/use-cases/exchange-rate/reject-exchange-rate.use-case';
import { ListExchangeRatesUseCase } from './application/use-cases/exchange-rate/list-exchange-rates.use-case';
import { ParseExchangeRateImageUseCase } from './application/use-cases/exchange-rate/parse-exchange-rate-image.use-case';
import { GeminiExchangeRateParserService } from './infrastructure/ai/gemini-exchange-rate-parser.service';

import { PrismaDebtRepository } from './infrastructure/database/repositories/prisma-debt.repository';
import { RecordDebtUseCase } from './application/use-cases/debt/record-debt.use-case';
import {
  SettleUsdCashDebtUseCase, SettleVndCashDebtUseCase,
} from './application/use-cases/debt/settle-debt.use-case';
import { ListDebtsUseCase } from './application/use-cases/debt/list-debts.use-case';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting (NF1) — enforce qua APP_GUARD bên dưới
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    PassportModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        // Default secret cho access token (refresh ký bằng secret khác trong factory)
        secret: cfg.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRES_IN') ?? '30m' },
      }),
    }),
  ],
  controllers: [AuthController, UserController, ExchangeRateController, DebtController, BranchController, FundController, WuController, MgController, FxController, BankController, ReconciliationController, AuditLogController, ReportsController, ShiftController, OrganizationController, TransactionAdminController, BranchMonitoringController, NotificationController],
  providers: [
    PrismaService,
    NotificationService,

    // Bind interface token → concrete implementation
    { provide: 'IUserRepository', useClass: PrismaUserRepository },
    { provide: 'IExchangeRateRepository', useClass: PrismaExchangeRateRepository },
    { provide: 'IExchangeRateImageParser', useClass: GeminiExchangeRateParserService },
    { provide: 'IDebtRepository', useClass: PrismaDebtRepository },
    { provide: 'IBranchRepository', useClass: PrismaBranchRepository },
    { provide: 'IFundRepository', useClass: PrismaFundRepository },
    { provide: 'IWuRepository', useClass: PrismaWuRepository },
    { provide: 'IMgRepository', useClass: PrismaMgRepository },
    { provide: 'IFxRepository', useClass: PrismaFxRepository },
    { provide: 'IBankRepository', useClass: PrismaBankRepository },
    { provide: 'IReconciliationRepository', useClass: PrismaReconciliationRepository },
    { provide: 'IAuditRepository', useClass: PrismaAuditRepository },
    { provide: 'IReportsRepository', useClass: PrismaReportsRepository },
    { provide: 'IShiftRepository', useClass: PrismaShiftRepository },
    { provide: 'IBranchMonitoringRepository', useClass: PrismaBranchMonitoringRepository },
    { provide: 'IHashService', useClass: HashService },

    // Ghi Audit Log tự động cho mọi mutation (Flow 6a)
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },

    // IJwtService: wrapper quanh NestJS JwtService, tách access/refresh secret
    {
      provide: 'IJwtService',
      useFactory: (jwt: JwtService, cfg: ConfigService) => ({
        signAccess: (payload: Record<string, unknown>) =>
          jwt.sign(payload, {
            secret: cfg.get<string>('JWT_SECRET'),
            expiresIn: cfg.get<string>('JWT_EXPIRES_IN') ?? '30m',
          }),
        signRefresh: (payload: Record<string, unknown>) =>
          jwt.sign(payload, {
            secret: cfg.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: cfg.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
          }),
        verifyAccess: (token: string) =>
          jwt.verify(token, { secret: cfg.get<string>('JWT_SECRET') }),
        verifyRefresh: (token: string) =>
          jwt.verify(token, { secret: cfg.get<string>('JWT_REFRESH_SECRET') }),
      }),
      inject: [JwtService, ConfigService],
    },

    LoginUseCase,
    CreateUserUseCase,
    ChangePasswordUseCase,
    RefreshTokenUseCase,

    CreateExchangeRateUseCase,
    ApproveExchangeRateUseCase,
    RejectExchangeRateUseCase,
    ListExchangeRatesUseCase,
    ParseExchangeRateImageUseCase,

    RecordDebtUseCase,
    SettleUsdCashDebtUseCase,
    SettleVndCashDebtUseCase,
    ListDebtsUseCase,

    CreateTransferUseCase,
    ConfirmTransferUseCase,
    RejectTransferUseCase,
    ListFundUseCase,
    CreateFundMovementUseCase,

    CreateWuUseCase,
    ListWuUseCase,

    CreateMgUseCase,
    ListMgUseCase,

    CreateFxUseCase,
    ListFxUseCase,

    ListBankUseCase,
    ReceiveFromProviderUseCase,

    RunReconciliationUseCase,
    ListReconciliationUseCase,

    ListAuditUseCase,

    GetSummaryUseCase,

    GetBranchMonitoringUseCase,

    OpenShiftUseCase,
    CloseShiftUseCase,
    CurrentShiftUseCase,

    JwtStrategy,

    // Enforce rate limit cho mọi route (NF1)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
