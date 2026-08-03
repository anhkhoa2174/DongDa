# Doi chieu activity diagram voi he thong Dong Da

Ngay lap: 2026-07-28

Tai lieu nay doi chieu 5 flow nghiep vu: duyet ty gia, cong no WU/MG, tiep quy/dieu chuyen von, bao cao va audit log. Muc tieu la chot cac diem can bo sung truoc khi day frontend/backend vao test production-like.

## 1. Duyet ty gia

Trang thai hien tai:
- Backend da co `exchange_rates` voi `DRAFT`, `ACTIVE`, `REJECTED`, `SUPERSEDED`.
- API da co tao, list, active, approve va reject.
- Khi approve, ban cu cung loai/provider/currency duoc supersede.
- Form WU/MG/ngoai te da doc active rate va tu apply vao giao dich moi.

Can bo sung:
- Luu ly do tu choi khi Giam doc khong duyet.
- Ghi audit log cho `CREATE_RATE`, `APPROVE_RATE`, `REJECT_RATE`.
- Them notification/websocket sau approve de chi nhanh biet ty gia moi.

Ket luan: Flow nay da dung khung, con thieu notification va audit that.

## 2. Giai quyet cong no WU/MG

Trang thai hien tai:
- Backend da tu sinh cong no khi tao giao dich WU/MG.
- Moi chi nhanh co so no theo `branch + provider + currency`.
- Da co API list cong no, xem movement va settle.
- UI `DebtSettlementPage` da dung API that, nhung man `DebtManagementPage` cu van con mock.

Can bo sung theo diagram:
- Tach ro `EXPECTED_DEBT` va `ACTUAL_DEBT` sau khi upload Journal cuoi ngay.
- Doi chieu Journal WU/MG de tao/adjust cong no thuc te tai thoi diem chot ngay.
- Xu ly rieng cong no USD:
  - KTTH chon khoan no USD.
  - Nhap phan USD tien mat la so nguyen.
  - Phan le duoi 1 USD quy doi theo ty gia ngan hang thanh VND.
- Xu ly rieng cong no VND:
  - Chon tai khoan ngan hang noi bo.
  - Tao bien dong ngan hang chuyen khoan di.
- Cap nhat status tai summary: `PENDING`, `PARTIAL`, `SETTLED`.
- Ghi audit log cho moi lan ghi no, dieu chinh no, thanh toan no.

Ket luan: Nen them lop `DebtReconciliation` cho Journal cuoi ngay, khong tron truc tiep vao create transaction.

## 3. Tiep quy / Dieu chuyen von

Trang thai hien tai:
- Backend co tao phieu `PENDING_APPROVAL`, confirm va reject.
- Confirm da post ledger: tru so du ben gui, cong so du ben nhan.
- UI da co workspace dung API that.

Can bo sung theo diagram:
- Luu `reject_reason` khi ben nhan tu choi.
- Tao notification cho ben nhan khi co phieu moi.
- Tao notification cho ben gui khi bi tu choi.
- Chi ben nhan hoac role KTTH/Giam doc moi duoc confirm/reject phieu den.
- Dung active rate de tinh `base_amount_vnd` thay vi hard-code `25_000`.
- Ghi 2 audit entries: ben gui tao phieu, ben nhan xac nhan/tu choi.

Ket luan: Flow da chay duoc, nhung can bo sung kiem soat quyen, ly do tu choi, audit va rate snapshot.

## 4. Tao bao cao

Trang thai hien tai:
- UI `ReportsPage` van la mock data.
- Backend chua co report controller/use-case rieng.
- Schema da co bang tong hop theo ca/ngay/thang trong baseline, nhung chua expose API tong hop.

Can bo sung theo diagram:
- API report gom:
  - loai bao cao: WU, MG, ngoai te, ngan hang, quy, cong no, sai lech.
  - khoang thoi gian va tan suat: ngay/tuan/thang/nam.
  - pham vi chi nhanh theo quyen user.
- Query aggregate dung index theo `shift_id`, `branch_id`, `business_date`.
- Render preview bang KPI, table va chart tu data that.
- Export Excel/PDF.
- Ghi audit log `EXPORT_REPORT` khi user export, preview khong bat buoc ghi.

Ket luan: Report nen lam sau audit/reconciliation vi bao cao can nguon du lieu da chot.

## 5. Audit log bat bien

Trang thai hien tai:
- Database da co `audit_logs`.
- UI `AuditLogPage` van doc mock.
- Backend chua co audit interceptor/service/controller that.
- Chua co rang buoc DB ngan UPDATE/DELETE tren `audit_logs`.

Can bo sung theo diagram:
- Tao `AuditService` chi insert append-only.
- Tao `AuditInterceptor` hoac goi audit o use-case quan trong.
- Tao API `GET /audit-logs` cho Giam doc/KTTH/Auditor.
- Tao migration trigger chan `UPDATE` va `DELETE` tren `audit_logs`.
- Log toi thieu: `user_id`, `action`, `entity_type`, `entity_id`, `before_data`, `after_data`, `ip_address`, `user_agent`, `created_at`.
- Dat policy retention/backup trong README/deployment: luu toi thieu 5 nam, backup hang ngay.

Ket luan: Audit log la nen tang can lam truoc khi hoan thien cac flow duyet, cong no, tiep quy va report.

## Thu tu trien khai de nghi

1. Audit backend: service, controller, append-only DB trigger, UI doc API that.
2. Notification/in-app event: phieu dieu chuyen, duyet ty gia, tu choi phieu.
3. Dieu chuyen von: reject reason, check quyen ben nhan, active rate snapshot.
4. Cong no cuoi ngay: journal reconciliation tao `ACTUAL_DEBT` va adjustment.
5. Report API: aggregate preview va export.

## Cac diem can duyet truoc khi code

- Cong no Journal WU/MG khi lech: tao movement `ACTUAL_DEBT` rieng hay tao `ADJUSTMENT` chenhlech so voi `EXPECTED_DEBT`.
- Thanh toan cong no USD: phan USD tien mat se ghi vao quy tien mat USD cua chi nhanh nao, hay quy chung KTTH.
- Phan le USD quy doi VND: dung ty gia ngan hang nao va co can snapshot theo tung tai khoan ngan hang khong.
- Dieu chuyen von: phieu STAFF tao co can KTTH/Giam doc approve truoc khi ben nhan confirm khong, hay pending gui thang cho ben nhan nhu diagram.
- Report export: file luu vao storage noi bo hay chi stream download.
