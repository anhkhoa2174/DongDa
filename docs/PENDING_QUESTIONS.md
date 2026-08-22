# Câu hỏi CHƯA RÕ — chờ anh Kiển trả lời (cập nhật 22/08/2026)

> Nguồn: feedback Zalo 17–19/08 của anh Kiển. Đừng tự đoán khi code (CLAUDE.md).
> Đọc kèm: `HANDOFF_CONTEXT.md` mục 8 (các câu hỏi cũ vẫn còn hiệu lực).

## 1. Chuyển khoản tại chi nhánh + số âm TK ngân hàng (QUAN TRỌNG NHẤT)

Anh Kiển: CN nhận tiền mặt của khách → ghi **số âm** vào TK ngân hàng (TK tạo trong acc
GĐ/KTTH, CN chọn TK nào cũng được). GĐ/KTTH "chọn thanh toán" thì các khoản âm **về 0**.

Chưa rõ:
- [ ] **Flow đầy đủ** từ lúc khách vào đến lúc xong: tiền mặt và tiền trong TK chạy thế
      nào từng bước? (anh Quyền đã hỏi 21/08, chưa được trả lời)
- [ ] Giao dịch chuyển khoản có **mấy loại**? (nhận tiền mặt→CK; nhận CK→trả tiền mặt;
      còn loại nào khác?)
- [ ] Số âm **trừ thẳng vào số dư TK** (số dư sẽ lệch sao kê ngân hàng) hay tách thành
      cột **"chờ xử lý"** riêng bên cạnh số dư thật?
- [ ] Bấm "thanh toán" ứng với sự kiện gì ngoài đời: (a) KTTH **đã chuyển khoản đi** cho
      người nhận từ TK đó, hay (b) CN **đã nộp tiền mặt về** hội sở? → quyết định bút toán.
- [ ] Thanh toán **gom hết khoản âm của 1 TK một lần** hay **tick chọn từng giao dịch**?
      (đoán: gom + tick lẻ cho ngoại lệ, như công nợ — cần xác nhận)
- [ ] Mâu thuẫn với ghi chú cũ "mỗi chi nhánh có ngân hàng riêng" (GhichuDongDa): giờ CN
      chọn TK bất kỳ → còn giữ khái niệm TK riêng theo CN không? (code hiện tại đang khóa
      STAFF theo TK chi nhánh mình — sẽ phải nới)

## 2. Trường "Giao dịch được Paid tại"

- [ ] 5 CN Paid (NCT, Tao Đàn, Lê Hồng Phong, An Đông, Bảy Hiền) là **cố định** hay lấy
      động theo danh sách chi nhánh? CN mới mở có tự thành CN Paid không?
- [ ] Áp dụng cho cả **MG** hay chỉ WU? (tin nhắn chỉ nói "tạo giao dịch WU")
- [ ] Công nợ hiện gom `ngày + CN + WU/MG + loại tiền` — đổi CN thành **CN Paid**?
      Và anh Quyền hỏi: có đổi gom **theo ngân hàng** không (vì có GD thanh toán trễ 1–2 món)?
      → chưa được trả lời.

## 3. Đối chiếu Wupos — chọn cách nào

Anh Kiển gợi ý 2 cách (19/08), bảo "e nghĩ thêm":
- Cách 1: đối chiếu theo trường "Paid tại".
- Cách 2: đối chiếu 2 lớp (CN match trước → phần chưa match + file PDF đẩy lên GĐ/KTTH
  match lớp 2).
- [ ] Đề xuất của team: **kết hợp** — có "Paid tại" thì lớp 1 match được nhiều hơn, phần
      còn lại vẫn lên lớp 2. Cần chốt với anh Kiển trước khi làm.

## 4. Slider tỷ giá WU 3 mốc (vàng/đen)

- [ ] "Thấp nhất" là giá nào — FX_BUY? một tỷ giá mới phải tạo thêm? hay biên dưới cố định?
- [ ] Khách nhận USD (PAID_SELL) có tô màu tương tự không hay chỉ áp cho khách nhận VND?

## 5. Tỷ giá — duyệt & biên độ

- [ ] GĐ tự tạo tỷ giá có cần bước duyệt không, hay tự động ACTIVE? (hiện bắt duyệt chéo)
- [ ] "3 nhóm biên độ" cố định — **chờ anh Kiển cung cấp** con số.

## 6. Bán ngoại tệ Quỹ A (GĐ/KTTH)

- [ ] Ô "Trừ tiền bị lỗi": trừ vào **số lượng ngoại tệ** hay trừ **thành tiền VNĐ**?
      Số tiền lỗi đó ghi sổ thế nào (thiệt hại? quỹ riêng tiền rách?)
- [ ] Tỷ giá nhập tay (không theo FX active) có cần giới hạn biên độ / quyền duyệt không?

## 7. Báo cáo (10 loại, đặt tên theo anh Kiển)

- [ ] Chờ **mẫu Excel** các báo cáo #2 (WU), #5 (Vốn & Quỹ), #6 (Ngoại tệ) — anh Kiển nói
      "sẽ gửi mẫu". Đã có mẫu #3 (Sổ thu chi quỹ USD) và #1 (đã làm).
- [ ] #3/#4 lấy CN theo "Paid tại" → phụ thuộc mục 2.

## 8. In phiếu (deadline 20/8 — ĐÃ TRỄ)

- [ ] Phiếu ACB/MSB chọn theo gì — TK ngân hàng nhận tiền WU về, hay người dùng tự chọn?
- [ ] Máy POS in FX là loại nào (Bluetooth/USB, khổ 58mm hay 80mm)? In từ trình duyệt
      kiểu gì — cần biết model máy để làm đúng.
- [ ] Sheet "MẪU CHI DÙM" trong FORM MẪU dùng cho nghiệp vụ gì?
