Sau khi xem cả requirement gốc v1.0 và bản cập nhật v1.2, tôi thấy hệ thống đã phát triển thành một **Enterprise Financial Operations System**, không còn là một web CRUD thông thường nữa.  

Vì vậy frontend nên chia theo **bounded context (module nghiệp vụ)** thay vì chỉ chia theo menu.

# Kiến trúc Frontend đề xuất

```txt
frontend/
│
├── src/
│
├── app/
│   ├── router/
│   ├── layouts/
│   ├── guards/
│   └── providers/
│
├── modules/
│
│   ├── auth/
│   ├── dashboard/
│
│   ├── fund-management/
│   ├── exchange-rate/
│
│   ├── western-union/
│   ├── moneygram/
│   ├── domestic-transfer/
│
│   ├── debt-management/
│   ├── bank-management/
│
│   ├── capital-transfer/
│
│   ├── shift-management/
│
│   ├── reconciliation/
│
│   ├── reports/
│
│   ├── audit-log/
│
│   └── administration/
│
├── shared/
│
└── assets/
```

---

# Module 1: Dashboard

Theo requirement có 3 dashboard khác nhau. 

```txt
dashboard/
│
├── director/
│
├── accountant/
│
└── branch/
```

Ví dụ:

```txt
/dashboard/director
/dashboard/ktth
/dashboard/branch
```

---

# Module 2: Fund Management

Đây là lõi hệ thống.

Theo requirement:

```txt
Quỹ Chi Nhánh
Quỹ Chung
Kiểm Quỹ
Kiểm Quỹ Tổng
```



Nên tách:

```txt
fund-management/
│
├── branch-funds/
│
├── central-fund/
│
├── cash-count/
│
└── fund-history/
```

Menu:

```txt
Quỹ
 ├── Quỹ Chi Nhánh
 ├── Quỹ Chung
 ├── Kiểm Quỹ
 └── Lịch sử
```

---

# Module 3: Exchange Rate

Requirement hiện đã có:

```txt
WU
MG
Ngoại tệ
Tỷ giá ngân hàng
Workflow duyệt
```



```txt
exchange-rate/
│
├── wu-mg-rates/
│
├── fx-rates/
│
├── bank-rates/
│
└── approval/
```

---

# Module 4: Western Union

Requirement đã khá lớn. 

```txt
western-union/
│
├── transactions/
│
├── journal-upload/
│
├── reconciliation/
│
└── reports/
```

Menu:

```txt
Western Union
 ├── Giao dịch
 ├── Upload Journal
 ├── Đối chiếu
 └── Báo cáo
```

---

# Module 5: MoneyGram

Không nên gộp vào WU.

MoneyGram đã có nghiệp vụ riêng. 

```txt
moneygram/
│
├── transactions/
│
├── journal-upload/
│
├── reconciliation/
│
└── reports/
```

Bên trong transaction:

```txt
Nhận USD
Nhận VND
MG trả USD
MG trả VND
```

---

# Module 6: Debt Management

Đây là module mới rất quan trọng. 

```txt
debt-management/
│
├── debt-list/
│
├── debt-resolution/
│
├── debt-history/
│
└── debt-report/
```

Menu:

```txt
Công Nợ
 ├── Công nợ USD
 ├── Công nợ VND
 ├── Giải quyết công nợ
 └── Lịch sử
```

---

# Module 7: Bank Management

Requirement v1.2 đã tách thành module riêng. 

```txt
bank-management/
│
├── accounts/
│
├── transactions/
│
├── deposits/
│
├── withdrawals/
│
└── reconciliation/
```

---

# Module 8: Capital Transfer

```txt
capital-transfer/
│
├── requests/
│
├── transfers/
│
├── approvals/
│
└── history/
```



---

# Module 9: Shift Management

Theo requirement:

```txt
Mở ca
Trong ca
Đóng ca
Sai lệch
```



```txt
shift-management/
│
├── open-shift/
│
├── active-shift/
│
├── close-shift/
│
└── discrepancy/
```

---

# Module 10: Reconciliation

Đây là module cực lớn.

Requirement hiện có:

```txt
WU ↔ Sổ
MG ↔ Sổ
Bank ↔ Công nợ
Quỹ ↔ Sổ
Quỹ tổng ↔ Chi nhánh
Khách hàng trùng tên
```



Tách riêng:

```txt
reconciliation/
│
├── wu/
│
├── moneygram/
│
├── bank/
│
├── fund/
│
├── debt/
│
└── duplicate-customer/
```

---

# Module 11: Reports

```txt
reports/
│
├── daily/
├── weekly/
├── monthly/
├── yearly/
│
├── wu/
├── mg/
├── debt/
├── bank/
├── transfer/
├── discrepancy/
└── foreign-exchange/
```



---

# Module 12: Administration

```txt
administration/
│
├── users/
├── roles/
├── branches/
├── currencies/
├── thresholds/
├── fee-rules/
└── system-config/
```

Hiện requirement chưa ghi rõ nhưng production chắc chắn sẽ cần.

---

# Menu cuối cùng tôi đề xuất

```txt
Dashboard

Quỹ
 ├── Quỹ Chi Nhánh
 ├── Quỹ Chung
 ├── Kiểm Quỹ

Tỷ Giá
 ├── WU/MG
 ├── Ngoại Tệ
 ├── Ngân Hàng

Western Union

MoneyGram

Công Nợ

Ngân Hàng

Điều Chuyển Vốn

Ca Làm Việc

Đối Chiếu

Báo Cáo

Audit Log

Quản Trị
```

Đây là cấu trúc đủ để đi từ MVP hiện tại đến production mà không phải đập bỏ frontend khi bổ sung thêm MoneyGram, Công nợ, Ngân hàng và Đối chiếu đa lớp sau này.
