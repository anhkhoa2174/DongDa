# Huong dan doc Backend DongDa

Tai lieu nay la lo trinh doc code backend theo thu tu de hieu tu tong quan den
chi tiet. Hay doc file nay song song voi code, va danh dau lai nhung doan ban
da tu tra loi duoc cau hoi "du lieu di qua dau?".

## 1. Hieu backend dang giai quyet bai toan gi

DongDa la he thong van hanh tai chinh cho nhieu chi nhanh, khong phai chi la
mot CRUD app. Cac nhom nghiep vu chinh la:

- Xac thuc, tai khoan, vai tro va phan quyen.
- Ca lam viec cua nhan vien chi nhanh.
- Giao dich Western Union (WU), MoneyGram (MG), mua ban ngoai te (FX).
- Quan ly quy, tiep quy, chuyen quy va bien dong ngan hang.
- Cong no, doi chieu Journal, bao cao va giam sat chi nhanh.
- Audit log va thong bao.

Ba quy tac phai nho truoc khi doc code tien:

1. Khong xoa giao dich nghiep vu. Du lieu duoc update co kiem soat hoac
   deactivate; cac thao tac quan trong phai co ly do/approval theo nghiep vu.
2. Moi giao dich dung snapshot ty gia tai thoi diem phat sinh. Ty gia active
   moi khong duoc lam thay doi lich su.
3. Bien dong quy phai truy duoc ve giao dich nguon, duoc post vao ledger va
   duoc audit. Staff chi duoc xem/thao tac trong chi nhanh cua minh.

Chi tiet tinh trang API that hay mock cua frontend nam trong README. Khi hoc
backend, uu tien nhung dong README danh dau **API THAT**, dac biet WU, MG, FX,
ca, quy, tiep quy, ngan hang, cong no, doi chieu, bao cao va audit log.

## 2. Doc README truoc

Bat dau tai [README.md](README.md). Doc theo thu tu sau:

1. **Thanh Phan**: biet backend dung NestJS + Prisma + PostgreSQL, frontend
   dung React/Vite.
2. **Chay bang Docker**: biet cac port, tai khoan seed, database dev.
3. **Chay local khong Docker** va **Environment**: biet `DATABASE_URL`, JWT
   secrets, `FRONTEND_URL`, global prefix `/api/v1`.
4. **Kien truc Backend**: ghi nho bon layer.
5. **Auth Va Phan Quyen**: biet role nao co quyen gi va endpoint dau tien de
   thu la `POST /api/v1/auth/login`.
6. **Kiem Ke Module, Nghiep Vu Va API**: day la muc tra cuu quan trong nhat
   de biet module nao da co API that, module nao moi la mock.

Sau README, doc [backend/CLAUDE.md](backend/CLAUDE.md). File nay la quy tac
ky thuat cua backend, dac biet:

- Chieu phu thuoc: `interfaces -> application -> domain <- infrastructure`.
- Interface repository nam o domain; Prisma repository nam o infrastructure.
- `app.module.ts` bind interface token vao implementation.
- Prisma phai dung migration, khong dung `db push`.
- Backend phai enforce branch isolation, khong tin frontend.

## 3. Chuan bi chay va quan sat API

Neu Docker Desktop dang chay:

```bash
docker compose up --build
```

Neu chi muon doc backend va database da san sang, co the xem huong dan trong
README de chay rieng backend. Sau khi server len, mo Swagger:

```txt
http://localhost:3000/api/docs
```

Swagger la phong thi nghiem tot nhat de hoc route. Thu theo thu tu:

1. Goi `POST /api/v1/auth/login` voi tai khoan seed trong README.
2. Lay `accessToken` tu response.
3. Bam **Authorize** trong Swagger va dan token.
4. Goi `GET /api/v1/auth/me` de thay user sau khi JWT duoc xac thuc.
5. Thu mot endpoint doc, sau do moi thu endpoint tao/sua khi da hieu dieu kien
   role, branch, ca va trang thai.

## 4. Ban do khoi dong ung dung

Doc [backend/src/main.ts](backend/src/main.ts) truoc de hieu nhung quy tac ap
dung cho moi request:

- `helmet` va `compression` xu ly HTTP security/performance.
- `ValidationPipe` validate DTO, lo field la va reject field khong duoc phep.
- CORS chi cho `FRONTEND_URL`.
- Global prefix la `/api/v1`.
- Swagger chi bat khi khong phai production.

Tiep theo doc [backend/src/app.module.ts](backend/src/app.module.ts). Khong can
doc tung dong import ngay lan dau; hay xem file nay nhu so do noi day:

```txt
HTTP controller
    -> use case
        -> domain repository interface
            -> Prisma repository
                -> PrismaService -> PostgreSQL
```

Trong `@Module`:

- `imports` nap Config, JWT, Passport va Throttler.
- `controllers` dang ky cac cua vao HTTP.
- `providers` dang ky use case, service, guard va repository.
- Cac dong `{ provide: 'I...Repository', useClass: Prisma...Repository }`
  la noi Clean Architecture duoc noi voi database.
- `APP_GUARD` ap dung rate limit toan cuc.
- `APP_INTERCEPTOR` dang ky `AuditInterceptor` cho cac mutation.

Khi khong tim thay vi sao NestJS tao duoc mot dependency, quay lai `providers`
trong file nay truoc khi tim o noi khac.

## 5. Luong mau can doc that ky: dang nhap

Day la luong nho, it phu thuoc nghiep vu tien, nhung cho thay day du cach cac
layer noi voi nhau.

### Buoc 1: Route HTTP

Mo [auth.controller.ts](backend/src/interfaces/http/controllers/auth.controller.ts)
va tim:

```ts
@Post('login')
async login(@Body() dto: LoginDto) {
  return this.loginUseCase.execute(dto);
}
```

Suy ra endpoint day du la `POST /api/v1/auth/login` vi:

- `@Controller('auth')` them `/auth`.
- `@Post('login')` them `/login`.
- `main.ts` them prefix `/api/v1`.

Controller chi lam ba viec: nhan body, de NestJS validate DTO, goi use case va
tra response. Logic dang nhap khong nen nam o day.

### Buoc 2: Input va output

Doc DTO o
[backend/src/application/dtos/auth/auth.dto.ts](backend/src/application/dtos/auth/auth.dto.ts).
Kiem tra:

- Field nao bat buoc?
- Rule do dai/format nao duoc validate?
- `ValidationPipe` se strip hay reject field la?
- Response co access token, refresh token va thong tin user nao?

### Buoc 3: Nghiep vu dang nhap

Mo [login.use-case.ts](backend/src/application/use-cases/auth/login.use-case.ts).
Thu tu logic la:

1. Tim user theo username qua `IUserRepository`.
2. Tu choi neu user khong ton tai hoac inactive.
3. So sanh password plaintext voi bcrypt hash qua `IHashService`.
4. Ky access token voi `sub`, `role`, `branchId`, `type: access`.
5. Ky refresh token voi `sub`, `type: refresh` va secret khac.
6. Tra user an toan, khong tra password.

Diem can ghi chu: loi user khong ton tai va sai password dung cung mot message,
de tranh user enumeration.

### Buoc 4: Domain va hop dong repository

Doc [user.entity.ts](backend/src/domain/entities/user.entity.ts) va
[user.repository.ts](backend/src/domain/repositories/user.repository.ts).

- `UserRole` la nguon su that cua role.
- `GLOBAL_ROLES` co quyen xem toan he thong; `STAFF` bi gioi han branch.
- `hasPermission` kiem tra quyen dang `resource:action`.
- `canAccessBranch` kiem tra user co duoc vao branch hay khong.
- `IUserRepository` chi mo ta hop dong, khong biet Prisma.

Khi doc mot use case khac, luon tim interface repository no inject truoc. Day
la cach biet use case dang can gi ma khong bi lac trong implementation database.

### Buoc 5: Infrastructure va mapping

Mo [prisma-user.repository.ts](backend/src/infrastructure/database/repositories/prisma-user.repository.ts).
File nay noi domain voi schema that:

- Domain `User` la object phang.
- Database tach thanh `users`, `employees`, `user_roles`, `roles`, `branches`.
- `INCLUDE` lay cac quan he can thiet.
- `toDomain()` map record Prisma ve `User`.
- `save()` dung `$transaction()` de tao employee, user va role cung nhau.

Day la mau hinh can tim trong moi repository:

```txt
method cua interface
    -> Prisma query
    -> map DB row thanh domain entity
    -> tra ket qua cho use case
```

### Buoc 6: JWT request sau khi login

Khi goi endpoint co `@UseGuards(JwtAuthGuard)`, doc tiep:

1. [jwt-auth.guard.ts](backend/src/interfaces/http/guards/jwt-auth.guard.ts)
   chan request neu khong co user hop le.
2. [jwt.strategy.ts](backend/src/interfaces/http/guards/jwt.strategy.ts)
   lay Bearer token, verify bang `JWT_SECRET`, reject refresh token va load lai
   user tu repository.
3. [roles.guard.ts](backend/src/interfaces/http/guards/roles.guard.ts) doc
   `@Roles(...)`, sau do so sanh role trong `req.user`.
4. Controller dung `req.user` de lay identity, role va branch.

Can phan biet:

- **Authentication**: ban la ai, do JWT/Passport xu ly.
- **Authorization**: ban duoc lam gi, do role/permission/branch check xu ly.

## 6. Thu tu doc cac layer cho moi module

Sau auth, dung mot module nho de luyen cach doc. Thu tu de xuat:

1. `interfaces/http/controllers/<module>.controller.ts`: liet ke endpoint,
   DTO, guard, role va response.
2. `application/dtos/<module>/`: xem input/output va validation.
3. `application/use-cases/<module>/`: doc tung class, tung `execute()`;
   ghi lai precondition, state transition va side effect.
4. `domain/entities/<module>.entity.ts`: xem enum, invariant, ham domain.
5. `domain/repositories/<module>.repository.ts`: xem hop dong ma use case
   duoc phep dung.
6. `infrastructure/database/repositories/prisma-<module>.repository.ts`:
   doi chieu hop dong voi query, transaction va mapping.
7. `schema.prisma`: xem bang, enum, relation, unique/index va constraint.
8. `migrations/`: xem lich su vi sao schema co cau truc hien tai.

Neu controller gom nhieu use case trong mot file, khong doc theo so dong. Hay
tach theo tung endpoint, roi di theo mot luong den database.

## 7. Lo trinh module cu the

Doc theo cac chang sau de tang dan do phuc tap:

### Chang 1: Auth va user

Files chinh:

- `interfaces/http/controllers/auth.controller.ts`
- `application/use-cases/auth/`
- `domain/entities/user.entity.ts`
- `infrastructure/config/hash.service.ts`
- `interfaces/http/guards/`
- `infrastructure/database/repositories/prisma-user.repository.ts`

Muc tieu: hieu request lifecycle, DI token, JWT, role va branch scope.

### Chang 2: Chi nhanh va ca

Doc `branch.controller.ts`, `shift.controller.ts`, cac use case/repository
tuong ung. Tap trung vao cau hoi:

- Ai duoc mo/ dong ca?
- So tien dau ca va cuoi ca duoc lay tu dau?
- Tai sao WU/MG/FX khong duoc tao neu khong co ca mo?
- Trang thai ca thay doi nhu the nao?

### Chang 3: Ty gia va giao dich

Doc `exchange-rate`, sau do WU, MG, FX. Luon truy ba nhanh song song:

```txt
transaction -> exchange-rate snapshot
transaction -> ledger/cash movement
transaction -> debt movement (neu co)
transaction -> audit log
```

Khong chi doc ham `create`; hay doc list, update/void, approve va cac check
branch/shift/currency/status.

### Chang 4: Quy, ngan hang va cong no

Doc `fund`, `bank`, `debt`. Day la noi can chu y transaction database va truy
vet nguon. Dac biet xem khi nao bien dong duoc post, khi nao chi la PENDING,
va ai co quyen confirm/settle.

### Chang 5: Doi chieu, bao cao, audit

Doc `reconciliation`, `reports`, `audit`. Day la cac module doc/tong hop nhieu
nguon; can doi chieu filter status, branch va ngay thay vi chi doc mot query.

## 8. Doc database dung cach

Bat dau tai [schema.prisma](backend/src/infrastructure/database/prisma/schema.prisma),
nhung khong doc tu dau den cuoi ngay lap tuc. Tim truoc cac nhom:

- Identity: `users`, `employees`, `roles`, `user_roles`, `branches`.
- Money: `fund_accounts`, `ledger_entries`, `cash_movements`,
  `bank_balance_movements`.
- Business: `customer_transactions`, WU/MG/FX va cac bang lien quan.
- Control: `shifts`, `exchange_rates`, `approval_*`, `audit_logs`.
- Reconciliation/reporting: `journal_*`, `reconciliation_*`, summaries.

Voi moi model, tra loi bon cau hoi:

1. Ai tao record va ai duoc phe duyet?
2. Trang thai nao la draft/pending, trang thai nao da post?
3. Khoa ngoai nao tao duong truy vet ve branch, user, transaction?
4. Unique/index/constraint nao dang bao ve du lieu?

Sau schema moi doc migration. Migration cho biet y dinh lich su, vi du them
financial integrity guard, transaction replacement, currency reconciliation
va maker-checker guard. Khi sua schema, theo quy tac trong `backend/CLAUDE.md`:
tao migration, commit thu muc migration, khong dung `db push`.

## 9. Cach truy mot endpoint khi debug

Dung checklist nay moi lan gap mot API:

1. Tim decorator route trong `interfaces/http/controllers`.
2. Ghi lai global prefix, controller prefix, HTTP method va params/body.
3. Ghi lai guard va role decorator.
4. Tim DTO va validation.
5. Tim use case duoc goi; doc `execute()` tu tren xuong.
6. Liet ke repository/service duoc inject.
7. Tim interface domain tuong ung.
8. Mo Prisma implementation va doi chieu tung query.
9. Kiem tra transaction, status transition, ledger, debt, audit va notification.
10. Mo schema/migration neu mot field hoac relation chua ro.
11. Thu endpoint bang Swagger va quan sat status code/response.

Mot cach ghi chu huu ich:

```txt
Request
  -> Controller: validate/identity
  -> Use case: business decision
  -> Domain port: required capability
  -> Adapter: DB/AI/external side effect
  -> Response: mapped safe output
```

## 10. Cac diem de tranh doc nham

- `app.module.ts` la noi dang ky dependency, khong phai noi chua toan bo
  business logic.
- Interface repository khong phai class co code chay; implementation nam trong
  `infrastructure/database/repositories`.
- Domain entity khong duoc phu thuoc Prisma. Neu thay query Prisma trong domain,
  can xem lai ranh gioi layer.
- JWT payload co role/branch de ho tro guard, nhung `JwtStrategy` van load lai
  user de kiem tra user con active hay khong.
- README ghi ro frontend co trang MOCK. Khong ket luan backend thieu API chi
  vi mot page frontend chua goi API.
- Mot record tao thanh cong chua co nghia tien da vao so. Hay tim trang thai
  va logic post ledger.
- `DELETE` trong quan he noi bo Prisma khong dong nghia co endpoint xoa giao
  dich; phai phan biet xoa lien ket ky thuat voi xoa du lieu nghiep vu.

## 11. Bai tap doc de kiem tra da hieu

1. Ve tay luong `POST /api/v1/auth/login` tu request den PostgreSQL va nguoc lai.
2. Giai thich vi sao mot STAFF khong doc duoc du lieu branch khac neu sua URL
   bang tay.
3. Chi ra file nao quyet dinh role, file nao verify JWT, file nao query user.
4. Theo mot giao dich WU tu controller den snapshot ty gia, ledger va debt.
5. Tim mot endpoint mutation va xac dinh audit log duoc tao o use case,
   repository hay global interceptor.
6. Tim migration gan nhat lien quan den module ban dang hoc va noi no bao ve
   invariant nao.

Neu tra loi duoc 6 cau tren bang duong dan file va ten ham cu the, ban da nam
duoc bo khung backend. Luc do moi nen doc chi tiet cac nhanh edge case va
test spec.

## 12. Lenh doc va kiem tra hang ngay

Chay tu thu muc `backend/`:

```bash
npm run build        # kiem tra TypeScript/NestJS build
npm test             # chay unit tests
npm run test:e2e     # chay e2e neu moi truong da san sang
npm run db:studio    # quan sat database bang Prisma Studio
```

Khi can xem API nhanh, uu tien Swagger. Khi can hieu hanh vi ben trong, uu tien
unit test gan entity/use case. Khi can hieu du lieu that, doc Prisma repository
va schema cung nhau.

## Thu tu doc ngan gon

```txt
README.md
  -> backend/CLAUDE.md
  -> backend/src/main.ts
  -> backend/src/app.module.ts
  -> auth.controller.ts + auth DTO
  -> login.use-case.ts
  -> user.entity.ts + user.repository.ts
  -> prisma-user.repository.ts
  -> jwt-auth.guard.ts + jwt.strategy.ts + roles.guard.ts
  -> shift
  -> exchange-rate
  -> WU / MG / FX
  -> fund / bank / debt
  -> reconciliation / reports / audit
  -> schema.prisma
  -> migrations
  -> tests
```

Dung dung thu tu nay, ban se luon biet minh dang o layer nao, dang doc quyet
dinh nghiep vu hay chi dang doc adapter ky thuat, va co the lan theo bat ky
endpoint nao trong project.
