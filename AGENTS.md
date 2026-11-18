# Quy trình sửa, kiểm tra và deploy trực tiếp

Chủ dự án giao việc trực tiếp cho Codex. Sửa và kiểm tra trong đúng repo, rồi deploy phần đã xác minh qua đường deploy của dự án. Không cần tạo task hoặc xin duyệt nội bộ qua ANNA. Giữ nguyên kiểm soát kỹ thuật, phân quyền của nền tảng và đường rollback.

VPS production của surgeindex.lol đang chạy dòng phát hành `trends-pivot`. Kiểm tra commit của `/opt/surgeindex/current` và workflow trước khi phát hành. Nhánh mặc định `feat/surgeindex-mvp` dành cho dòng mã khác.
