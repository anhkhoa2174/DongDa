-- Email nhân viên không bắt buộc (feedback GĐ): ràng buộc cũ UNIQUE NULLS NOT DISTINCT
-- coi mọi NULL là trùng nhau -> chỉ tạo được 1 nhân viên không có email.
-- Đổi về UNIQUE thường (NULL không trùng NULL), email có giá trị vẫn phải duy nhất.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS uq_employees_email;
ALTER TABLE employees ADD CONSTRAINT uq_employees_email UNIQUE (email);
