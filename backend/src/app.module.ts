// NestJS App Module — wiring tất cả modules
// Layer: Interface

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { JwtStrategy } from './interfaces/http/guards/jwt.strategy';
import { HashService } from './infrastructure/config/hash.service';

import { PrismaExchangeRateRepository } from './infrastructure/database/repositories/prisma-exchange-rate.repository';
import { CreateExchangeRateUseCase } from './application/use-cases/exchange-rate/create-exchange-rate.use-case';
import { ApproveExchangeRateUseCase } from './application/use-cases/exchange-rate/approve-exchange-rate.use-case';
import { RejectExchangeRateUseCase } from './application/use-cases/exchange-rate/reject-exchange-rate.use-case';
import { ListExchangeRatesUseCase } from './application/use-cases/exchange-rate/list-exchange-rates.use-case';

import { PrismaDebtRepository } from './infrastructure/database/repositories/prisma-debt.repository';
import { RecordDebtUseCase } from './application/use-cases/debt/record-debt.use-case';
import { SettleDebtUseCase } from './application/use-cases/debt/settle-debt.use-case';
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
  controllers: [AuthController, UserController, ExchangeRateController, DebtController, BranchController, FundController, WuController, MgController, FxController, BankController],
  providers: [
    PrismaService,

    // Bind interface token → concrete implementation
    { provide: 'IUserRepository', useClass: PrismaUserRepository },
    { provide: 'IExchangeRateRepository', useClass: PrismaExchangeRateRepository },
    { provide: 'IDebtRepository', useClass: PrismaDebtRepository },
    { provide: 'IBranchRepository', useClass: PrismaBranchRepository },
    { provide: 'IFundRepository', useClass: PrismaFundRepository },
    { provide: 'IWuRepository', useClass: PrismaWuRepository },
    { provide: 'IMgRepository', useClass: PrismaMgRepository },
    { provide: 'IFxRepository', useClass: PrismaFxRepository },
    { provide: 'IBankRepository', useClass: PrismaBankRepository },
    { provide: 'IHashService', useClass: HashService },

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

    RecordDebtUseCase,
    SettleDebtUseCase,
    ListDebtsUseCase,

    CreateTransferUseCase,
    ConfirmTransferUseCase,
    RejectTransferUseCase,
    ListFundUseCase,

    CreateWuUseCase,
    ListWuUseCase,

    CreateMgUseCase,
    ListMgUseCase,

    CreateFxUseCase,
    ListFxUseCase,

    ListBankUseCase,
    ReceiveFromProviderUseCase,

    JwtStrategy,

    // Enforce rate limit cho mọi route (NF1)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
