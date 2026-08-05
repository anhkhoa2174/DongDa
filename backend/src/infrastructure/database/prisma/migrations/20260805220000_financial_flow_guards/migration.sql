-- Mỗi MTCN Western Union chỉ được xử lý một lần trên toàn hệ thống.
CREATE UNIQUE INDEX uq_wu_mtcn ON wu_transaction_details(mtcn);
