# SỔ TAY KIỂM THỬ UAT THEO VAI TRÒ NGHIỆP VỤ (UAT CHECKLIST)

> **Phiên bản Baseline:** `uat-v1.0.0` (FROZEN BASELINE FOR HUMAN UAT)  
> **Môi trường:** Staging  
> **URL Web:** `http://localhost:5173` (hoặc domain staging nội bộ)  
> **Thông tin xác thực:** Mật khẩu mặc định `${UAT_DEFAULT_PASSWORD}` và mã PIN bảo mật `${UAT_BOSS_PIN}` được cấp phát riêng qua kênh bảo mật nội bộ (không lưu trữ secret thô trong tài liệu quản lý phiên bản).

---

## MỤC LỤC
1. [Bảng tài khoản UAT theo 9 vai trò](#bảng-tài-khoản-uat-theo-9-vai-trò)
2. [Checklist kiểm thử vai trò BOSS (Giám Đốc Điều Hành)](#1-vai-trò-boss-giám-đốc-điều-hành)
3. [Checklist kiểm thử vai trò ADMIN (Quản Trị Hệ Thống)](#2-vai-trò-admin-quản-trị-hệ-thống)
4. [Checklist kiểm thử vai trò ACCOUNTANT (Kế Toán Trưởng)](#3-vai-trò-accountant-kế-toán-trưởng)
5. [Checklist kiểm thử vai trò SALES_TEAM_LEADER (Trưởng Nhóm Kinh Doanh)](#4-vai-trò-sales_team_leader-trưởng-nhóm-kinh-doanh)
6. [Checklist kiểm thử vai trò SALE (Chuyên Viên Kinh Doanh)](#5-vai-trò-sale-chuyên-viên-kinh-doanh)
7. [Checklist kiểm thử vai trò DEV_TEAM_LEADER (Trưởng Nhóm Kỹ Thuật)](#6-vai-trò-dev_team_leader-trưởng-nhóm-kỹ-thuật)
8. [Checklist kiểm thử vai trò DEV (Lập Trình Viên)](#7-vai-trò-dev-lập-trình-viên)
9. [Checklist kiểm thử vai trò SEO_TEAM_LEADER (Trưởng Nhóm SEO)](#8-vai-trò-seo_team_leader-trưởng-nhóm-seo)
10. [Checklist kiểm thử vai trò SEO (Chuyên Viên SEO)](#9-vai-trò-seo-chuyên-viên-seo)

---

## BẢNG TÀI KHOẢN UAT THEO 9 VAI TRÒ

| VAI TRÒ | USERNAME | EMAIL | HỌ VÀ TÊN | ĐỘI NGŨ / PHÒNG BAN |
| :--- | :--- | :--- | :--- | :--- |
| **BOSS** | `staging_boss` | `boss@staging.crm.local` | Giám Đốc Điều Hành Staging | Ban Giám Đốc |
| **ADMIN** | `staging_admin` | `admin@staging.crm.local` | Quản Trị Viên Staging | Đội Vận Hành Hệ Thống |
| **ACCOUNTANT** | `staging_accountant` | `accountant@staging.crm.local` | Kế Toán Trưởng Staging | Phòng Kế Toán |
| **SALES_TEAM_LEADER**| `staging_sales_leader`| `sales_leader@staging.crm.local` | Trưởng Nhóm Sales 1 | Team Kinh Doanh Alpha |
| **SALE (Team 1)** | `staging_sale` | `sale@staging.crm.local` | Chuyên Viên Sales Team 1 | Team Kinh Doanh Alpha |
| **SALE (Team 2)** | `staging_sale_t2` | `sale_t2@staging.crm.local` | Chuyên Viên Sales Team 2 | Team Kinh Doanh Beta |
| **DEV_TEAM_LEADER** | `staging_dev_leader` | `dev_leader@staging.crm.local` | Trưởng Nhóm Lập Trình 1 | Team Lập Trình Web |
| **DEV (Team 1)** | `staging_dev` | `dev@staging.crm.local` | Lập Trình Viên Team 1 | Team Lập Trình Web |
| **DEV (Team 2)** | `staging_dev_t2` | `dev_t2@staging.crm.local` | Lập Trình Viên Team 2 | Team Lập Trình Mobile |
| **SEO_TEAM_LEADER** | `staging_seo_leader` | `seo_leader@staging.crm.local` | Trưởng Nhóm SEO 1 | Team Nội Dung & SEO 1 |
| **SEO (Team 1)** | `staging_seo` | `seo@staging.crm.local` | Chuyên Viên SEO Team 1 | Team Nội Dung & SEO 1 |
| **SEO (Team 2)** | `staging_seo_t2` | `seo_t2@staging.crm.local` | Chuyên Viên SEO Team 2 | Team Nội Dung & SEO 2 |

---

## 1. VAI TRÒ: BOSS (GIÁM ĐỐC ĐIỀU HÀNH)

### Task BOSS-01: Phê duyệt đơn hàng (Order Review & Approval)
* **Phân loại:** `VALID`
* **Mục đích:** Kiểm tra thẩm quyền phê duyệt hợp đồng/đơn hàng trước khi chuyển giao kỹ thuật.
* **Dữ liệu mẫu:** Đơn hàng trạng thái `Dự thảo` hoặc `Chờ duyệt` (DRAFT).
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_boss`.
  2. Truy cập menu **Đơn hàng** (`/orders`).
  3. Bấm vào một đơn hàng để xem chi tiết.
  4. Bấm nút **Duyệt đơn hàng**.
  5. Đọc cảnh báo nghiệp vụ trong modal, nhập ghi chú (ví dụ: *"Đã kiểm tra điều khoản thanh toán, đồng ý duyệt"*), bấm **Xác nhận duyệt**.
* **Kết quả mong đợi:** Đơn hàng chuyển trạng thái sang **Đã duyệt** (APPROVED), hệ thống tự động sinh Project kỹ thuật tương ứng cho các dịch vụ trong đơn.

### Task BOSS-02: Xác nhận tiền về thực tế (Payment Confirmation)
* **Phân loại:** `VALID`
* **Mục đích:** Chỉ có Boss mới có quyền xác nhận tiền đã vào tài khoản công ty (độc quyền Boss).
* **Dữ liệu mẫu:** Phiếu thu do kế toán tạo ở trạng thái `Chờ xác nhận` (PENDING_CONFIRMATION).
* **Các bước thao tác:**
  1. Truy cập menu **Thanh toán** (`/payments`).
  2. Tìm kiếm phiếu thu có trạng thái `Chờ xác nhận`.
  3. Bấm nút **Xác nhận thu tiền**.
  4. Kiểm tra số tiền hiển thị đúng phân cách hàng nghìn (ví dụ: `15.000.000 ₫`), phương thức thanh toán và chứng từ đính kèm.
  5. Bấm **Xác nhận**.
* **Kết quả mong đợi:** Phiếu thu đổi thành **Đã xác nhận** (CONFIRMED). Công nợ của đơn hàng giảm tương ứng; nếu thu đủ tiền, đơn hàng đổi sang **Đã thanh toán đủ** (FULLY_PAID).

### Task BOSS-03: Ký duyệt nghiệm thu dự án (Project Acceptance Approval)
* **Phân loại:** `VALID`
* **Mục đích:** Nghiệm thu chất lượng dịch vụ để giải phóng hoa hồng cho nhân viên.
* **Dữ liệu mẫu:** Dự án kỹ thuật đã đạt tiến độ 100%.
* **Các bước thao tác:**
  1. Truy cập menu **Dự án** (`/projects`).
  2. Bấm vào dự án cần nghiệm thu.
  3. Chuyển sang tab **Nghiệm thu** hoặc bấm nút **Ghi nhận nghiệm thu**.
  4. Nhập Họ tên người đại diện khách hàng ký (ví dụ: *"Ông Trần Văn Đối Tác"*), tải lên file biên bản nghiệm thu (PDF/ảnh).
  5. Bấm **Lưu biên bản nghiệm thu**.
* **Kết quả mong đợi:** Dự án chuyển sang **Đã hoàn thành** (COMPLETED). Trạng thái nghiệm thu chuyển thành **Đã nghiệm thu**.

### Task BOSS-04: Mở khóa bảo mật & Quản lý mật khẩu nhân viên
* **Phân loại:** `VALID`
* **Mục đích:** Boss dùng mã PIN cá nhân để xem danh sách tài khoản và cấp lại mật khẩu an toàn.
* **Dữ liệu mẫu:** Mã PIN `${UAT_BOSS_PIN}`.
* **Các bước thao tác:**
  1. Truy cập menu **Quản lý tài khoản** (`/employee-accounts`).
  2. Màn hình yêu cầu nhập mã PIN bảo mật 6 số.
  3. Thử nhập sai mã PIN $\rightarrow$ Hệ thống báo lỗi và đếm số lần còn lại.
  4. Nhập đúng mã PIN `${UAT_BOSS_PIN}` $\rightarrow$ Hệ thống mở khóa giao diện quản lý.
  5. Chọn một nhân viên, bấm **Đặt lại mật khẩu**, bấm **Tạo mật khẩu ngẫu nhiên** và bấm **Lưu**.
* **Kết quả mong đợi:** Mật khẩu được cập nhật dưới dạng băm Argon2id; cờ `must_change_password` được kích hoạt; có bản ghi audit log rõ ràng.

### Task BOSS-05: Khóa kỳ lương tháng (Payroll Period Locking)
* **Phân loại:** `VALID`
* **Mục đích:** Đóng sổ bảng lương tháng, kích hoạt trigger biến dữ liệu thành bất biến (immutable).
* **Dữ liệu mẫu:** Kỳ lương đang mở.
* **Các bước thao tác:**
  1. Truy cập menu **Bảng lương** (`/payroll`).
  2. Kiểm tra danh sách nhân sự và các khoản thu nhập (lương cứng, hoa hồng, thưởng phạt).
  3. Bấm nút **Khóa kỳ lương**.
  4. Đọc cảnh báo: *"Dữ liệu sau khi khóa sẽ không thể sửa đổi"*, bấm **Đồng ý khóa**.
* **Kết quả mong đợi:** Trạng thái kỳ lương chuyển thành **Đã khóa** (LOCKED). Các nút chỉnh sửa lương bị vô hiệu hóa; trigger bảo vệ cơ sở dữ liệu ngăn chặn mọi câu lệnh sửa đổi.

### Task BOSS-06: Xem báo cáo tài chính & Drilldown số liệu an toàn
* **Phân loại:** `VALID (SAFE-FROZEN METRICS)`
* **Mục đích:** Đảm bảo các chỉ số tài chính hiển thị trung thực, tuân thủ nguyên tắc đóng băng an toàn.
* **Các bước thao tác:**
  1. Truy cập menu **Tổng quan tài chính** (`/finance/overview` hoặc `/dashboard`).
  2. Kiểm tra các số liệu:
     - Thực thu (Confirmed Cash In): Ghi nhận từ các phiếu thu đã CONFIRMED.
     - Công nợ phải thu (Receivables): Tính từ các đợt chưa thu đủ tiền.
     - Nợ quá hạn (Overdue): Tính từ các đợt quá hạn chưa thu.
     - Chi phí đã duyệt (Approved Expenses): Tổng chi phí hợp lệ.
  3. Kiểm tra chỉ số **Số dư tiền mặt hiện tại**: Bắt buộc hiển thị là `Chưa xác định` (chờ sổ quỹ Cash Ledger).
  4. Kiểm tra chỉ số **Dòng tiền thuần**: Bắt buộc hiển thị là `Chưa khả dụng`.
  5. Bấm vào chi tiết công nợ phải thu $\rightarrow$ Điều hướng chính xác sang trang `/finance/receivables`.
* **Kết quả mong đợi:** Số liệu hiển thị đúng định dạng `1.250.000 ₫`, điều hướng mượt mà, không tự suy diễn số dư ảo.

### Task BOSS-07: Quản lý và điều chuyển nhân sự trên Sơ đồ tổ chức
* **Phân loại:** `VALID (FROZEN: BOSS-ONLY)`
* **Mục đích:** Boss trực tiếp theo dõi cấu trúc tổ chức và điều chuyển nhân sự giữa các phòng ban/đội nhóm.
* **Dữ liệu mẫu:** Chuyển nhân viên từ Team Alpha sang Team Beta.
* **Các bước thao tác:**
  1. Truy cập menu **Sơ đồ tổ chức** (`/organization-chart`).
  2. Xem dạng cây (Tree view) hoặc dạng lưới (Grid view).
  3. Chọn một nhân viên, bấm nút **Điều chuyển team**.
  4. Chọn team đích (Team Kinh Doanh Beta), nhập ngày hiệu lực.
  5. Bấm **Xác nhận điều chuyển**.
* **Kết quả mong đợi:** Sơ đồ cập nhật vị trí mới; hệ thống ghi nhận `team_memberships` với dải thời gian `effective_range` chuẩn, không bị trùng lặp active membership.

---

## 2. VAI TRÒ: ADMIN (QUẢN TRỊ HỆ THỐNG)

### Task ADM-01: Tạo mới hồ sơ nhân viên và phân quyền
* **Phân loại:** `VALID`
* **Mục đích:** Khởi tạo nhân sự mới kèm tài khoản đăng nhập có vai trò cụ thể.
* **Dữ liệu mẫu:** Họ tên: `Lê Hoàng Long`, Vị trí: `SALE`, Team: `Team Kinh Doanh Alpha`.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_admin`.
  2. Truy cập menu **Nhân viên** (`/employees`).
  3. Bấm **Thêm nhân viên mới**.
  4. Điền mã nhân viên, họ tên, email, số điện thoại, chọn phòng ban, chọn Team từ dropdown, chọn vai trò.
  5. Bấm nút **Tạo mật khẩu tự động** (hiển thị mật khẩu mạnh).
  6. Bấm **Lưu nhân sự**.
* **Kết quả mong đợi:** Nhân viên mới xuất hiện trong danh sách, tự động tạo tài khoản user và phân quyền tương ứng.

### Task ADM-02: Quản lý cơ cấu phòng ban và đội nhóm
* **Phân loại:** `VALID`
* **Mục đích:** Quản trị viên cập nhật thông tin đội nhóm và danh sách thành viên qua menu Teams.
* **Dữ liệu mẫu:** Team Kinh Doanh Alpha, Team Lập Trình Web.
* **Các bước thao tác:**
  1. Truy cập menu **Đội ngũ / Teams** (`/teams`).
  2. Xem danh sách các team theo phòng ban (`SALES`, `DEV`, `SEO`, `OPERATION`).
  3. Bấm vào một team để kiểm tra danh sách thành viên hiện tại.
* **Kết quả mong đợi:** Danh sách phòng ban và đội nhóm hiển thị đầy đủ thông tin mã team, trưởng nhóm và các thành viên.

### Task ADM-03: Xác nhận ADMIN bị chặn truy cập Sơ đồ tổ chức (Boss-Only Check)
* **Phân loại:** `VALID (SECURITY CONSTRAINT)`
* **Mục đích:** Đảm bảo nguyên tắc bảo mật: Màn hình Organization Chart là quyền độc quyền của BOSS.
* **Các bước thao tác:**
  1. Kiểm tra thanh menu bên trái (Sidebar): Không hiển thị mục "Sơ đồ tổ chức".
  2. Thử gõ trực tiếp URL lên thanh địa chỉ trình duyệt: `http://localhost:5173/organization-chart`.
* **Kết quả mong đợi:** Hệ thống hiển thị trang **403 Không có quyền truy cập** hoặc chuyển hướng an toàn về Dashboard.

### Task ADM-04: Cấu hình danh mục tùy chọn động (Dynamic Options)
* **Phân loại:** `VALID`
* **Mục đích:** Thêm/sửa danh mục kênh marketing, nguồn lead mà không cần sửa code.
* **Dữ liệu mẫu:** Nhóm: `LEAD_SOURCE`, Giá trị mới: `Tiktok Ads 2026`.
* **Các bước thao tác:**
  1. Truy cập cài đặt tùy chọn hệ thống hoặc menu Dynamic Options.
  2. Chọn nhóm `Nguồn khách hàng (LEAD_SOURCE)`.
  3. Bấm **Thêm tùy chọn**. Nhập nhãn hiển thị và mã code.
  4. Bấm **Lưu**.
* **Kết quả mong đợi:** Dropdown nguồn lead ở các form tạo mới tự động cập nhật giá trị mới.

### Task ADM-05: Giám sát hàng đợi & Background Jobs
* **Phân loại:** `VALID`
* **Mục đích:** Đảm bảo các tiến trình gửi thông báo, nhắc nợ, tính lương ngầm hoạt động tốt.
* **Các bước thao tác:**
  1. Truy cập màn hình giám sát hàng đợi (`/system/queues`) hoặc endpoint metrics hệ thống.
  2. Quan sát 3 hàng đợi: `crm-notifications`, `crm-reminders`, `crm-maintenance`.
  3. Kiểm tra các chỉ số `waiting`, `active`, `completed`, `failed`.
* **Kết quả mong đợi:** Hàng đợi hoạt động trơn tru, tiến trình hoàn tất không phát sinh job bị treo (`stalled`).

---

## 3. VAI TRÒ: ACCOUNTANT (KẾ TOÁN TRƯỞNG)

### Task ACC-01: Tạo phiếu thu tiền đợt (Payment Creation)
* **Phân loại:** `VALID`
* **Mục đích:** Ghi nhận thông tin khách hàng thanh toán để trình Giám đốc phê duyệt.
* **Dữ liệu mẫu:** Đơn hàng có đợt thanh toán đến hạn; số tiền `25.000.000 ₫`.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_accountant`.
  2. Truy cập menu **Thanh toán** (`/payments`).
  3. Bấm **Tạo phiếu thu mới**.
  4. Chọn Đơn hàng từ ô tìm kiếm (hiển thị Mã đơn + Tên khách hàng).
  5. Nhập số tiền thu: `25000000` (input tự động format `25.000.000 ₫`).
  6. Chọn phương thức: `Chuyển khoản ngân hàng`, đính kèm ủy nhiệm chi/ảnh chụp giao dịch.
  7. Bấm **Tạo phiếu thu**.
* **Kết quả mong đợi:** Phiếu thu được tạo thành công ở trạng thái **Chờ xác nhận (PENDING_CONFIRMATION)**. Kế toán viên không thấy nút Xác nhận tiền về (chỉ Boss mới có thẩm quyền).

### Task ACC-02: Theo dõi danh sách công nợ phải thu (Receivables Tracking)
* **Phân loại:** `VALID`
* **Mục đích:** Rà soát các đơn hàng chưa thanh toán đủ và các khoản nợ quá hạn.
* **Các bước thao tác:**
  1. Truy cập menu **Tài chính > Công nợ phải thu** (`/finance/receivables`).
  2. Lọc danh sách theo: Đơn hàng quá hạn (Overdue).
  3. Kiểm tra: Số ngày trễ hạn, Tên khách hàng, Nhân viên sale phụ trách, Số tiền còn thiếu.
* **Kết quả mong đợi:** Danh sách phân loại rõ ràng theo mức độ trễ hạn, tính toán số dư công nợ chính xác.

### Task ACC-03: Tạo và hạch toán khoản chi phí vận hành (Operational Expense)
* **Phân loại:** `VALID`
* **Mục đích:** Ghi nhận chi phí phát sinh hàng ngày của công ty.
* **Dữ liệu mẫu:** Chi phí văn phòng phẩm, số tiền: `3.500.000 ₫`.
* **Các bước thao tác:**
  1. Truy cập menu **Quản lý chi phí** (`/expenses`).
  2. Bấm nút **Tạo khoản chi**.
  3. Điền lý do: *"Mua văn phòng phẩm và mực in tháng 9"*, chọn danh mục chi phí, nhập số tiền `3500000`.
  4. Bấm **Lưu khoản chi**.
* **Kết quả mong đợi:** Khoản chi hiển thị trong danh sách chi phí với định dạng tiền tệ `3.500.000 ₫`.

### Task ACC-04: Hạch toán chi phí lương từ bảng lương đã khóa (Payroll Expense Posting)
* **Phân loại:** `VALID`
* **Mục đích:** Kết chuyển toàn bộ quỹ lương đã chốt vào chi phí hoạt động của doanh nghiệp.
* **Dữ liệu mẫu:** Kỳ lương đã được Boss khóa (LOCKED).
* **Các bước thao tác:**
  1. Tại trang **Quản lý chi phí** (`/expenses`), bấm nút **Hạch toán chi phí lương**.
  2. Chọn kỳ lương đã khóa từ danh sách.
  3. Hệ thống hiển thị tổng quỹ lương cần hạch toán.
  4. Bấm **Xác nhận hạch toán**.
* **Kết quả mong đợi:** Sinh bản ghi chi phí nguồn `PAYROLL` tương ứng, không cho phép hạch toán lặp lại hai lần cho cùng một kỳ lương.

### Task ACC-05: Xuất dữ liệu danh sách khách hàng & công nợ ra file Excel
* **Phân loại:** `VALID`
* **Mục đích:** Cung cấp báo cáo dạng file cho phòng kế toán đối soát.
* **Các bước thao tác:**
  1. Truy cập màn hình Khách hàng hoặc Báo cáo.
  2. Bấm nút **Xuất Excel (Export)**.
  3. Chờ hệ thống tải xuống file `.xlsx`.
  4. Mở file kiểm tra: Tiêu đề cột tiếng Việt, format số tiền, ngày tháng đúng định dạng `dd/MM/yyyy`.
* **Kết quả mong đợi:** File Excel mở được không lỗi font tiếng Việt, số liệu khớp chính xác 100% với giao diện web.

---

## 4. VAI TRÒ: SALES_TEAM_LEADER (TRƯỞNG NHÓM KINH DOANH)

### Task STL-01: Phân công Lead cho nhân viên trong nhóm
* **Phân loại:** `VALID`
* **Mục đích:** Trưởng nhóm phân bổ khách hàng tiềm năng mới về cho nhân viên sale phù hợp.
* **Dữ liệu mẫu:** Lead mới chưa phân công; nhân viên nhận: `Chuyên Viên Sales Team 1`.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_sales_leader`.
  2. Truy cập menu **Khách hàng tiềm năng** (`/leads`).
  3. Bấm vào Lead đang ở trạng thái `Mới`.
  4. Bấm nút **Phân công Sale**.
  5. Chọn nhân viên `Chuyên Viên Sales Team 1 (STG-SALE-01)` từ danh sách.
  6. Bấm **Lưu phân công**.
* **Kết quả mong đợi:** Lead được gán cho nhân viên chỉ định; nhân viên sale nhận được thông báo in-app.

### Task STL-02: Giám sát Deal Pipeline của toàn team
* **Phân loại:** `VALID`
* **Mục đích:** Theo dõi tiến độ đàm phán hợp đồng của tất cả nhân viên trong nhóm.
* **Các bước thao tác:**
  1. Truy cập menu **Cơ hội bán hàng** (`/deals`).
  2. Quan sát danh sách Deals: Chỉ hiển thị các deal do thành viên trong **Team Kinh Doanh Alpha** phụ trách.
  3. Lọc theo giai đoạn: `Đang thương lượng`, `Chờ chốt hợp đồng`.
* **Kết quả mong đợi:** Nhìn thấy đầy đủ deals của team mình, không thấy deals của Team Beta.

### Task STL-03: Xem và giám sát báo cáo ngày của thành viên nhóm
* **Phân loại:** `VALID (CHỈ XEM/GIÁM SÁT, KHÔNG CÓ WORKFLOW DUYỆT)`
* **Mục đích:** Nắm bắt hoạt động gọi điện, gặp gỡ khách hàng hàng ngày của sales.
* **Các bước thao tác:**
  1. Truy cập menu **Báo cáo ngày** (`/reports`).
  2. Chọn tab **Báo cáo nhóm**.
  3. Chọn ngày làm việc cần xem.
  4. Bấm vào báo cáo của `Chuyên Viên Sales Team 1` để xem chi tiết danh sách khách hàng đã tiếp cận.
* **Kết quả mong đợi:** Xem được toàn bộ danh sách báo cáo của team, xem chi tiết từng đầu việc (hệ thống ghi nhận giám sát, không có nút duyệt).

### Task STL-04: Theo dõi chỉ số KPI & Doanh thu nhóm
* **Phân loại:** `VALID`
* **Mục đích:** Đánh giá tiến độ hoàn thành chỉ tiêu doanh số tháng của cả nhóm.
* **Các bước thao tác:**
  1. Truy cập menu **KPI & Doanh số** (`/kpi`).
  2. Xem thanh tiến độ chỉ tiêu doanh thu thực thu của team.
  3. Xem bảng xếp hạng doanh số nội bộ của các thành viên.
* **Kết quả mong đợi:** Doanh thu tính toán dựa trên thanh toán thực thu (Cash In), cập nhật thời gian thực.

### Task STL-05: Kiểm tra cơ chế cách ly dữ liệu chéo nhóm (Cross-team Isolation)
* **Phân loại:** `VALID`
* **Mục đích:** Đảm bảo bảo mật thương mại, trưởng nhóm không thể xem hoặc sửa Lead của nhóm khác.
* **Các bước thao tác:**
  1. Thử tìm kiếm Lead hoặc Deal thuộc sở hữu của thành viên Team Beta (`staging_sale_t2`).
  2. Nhập trực tiếp ID của Deal nhóm Beta lên thanh địa chỉ URL trình duyệt.
* **Kết quả mong đợi:** Hệ thống hiển thị thông báo **Không có quyền truy cập (403)** hoặc không tìm thấy dữ liệu.

---

## 5. VAI TRÒ: SALE (CHUYÊN VIÊN KINH DOANH)

### Task SALE-01: Tạo mới và phân loại khách hàng tiềm năng (Lead Creation)
* **Phân loại:** `VALID`
* **Mục đích:** Nhập thông tin khách hàng mới từ cuộc gọi/tin nhắn.
* **Dữ liệu mẫu:** Tên: `Công ty TNHH Giải Pháp Việt`, SĐT: `0987654321`, Nguồn: `Facebook Ads`.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_sale`.
  2. Truy cập menu **Khách hàng tiềm năng** (`/leads`).
  3. Bấm **Thêm lead mới**.
  4. Nhập Họ tên, Số điện thoại, Email, chọn Nguồn lead từ danh mục.
  5. Bấm **Lưu**.
  6. Tại trang chi tiết Lead, bấm **Đánh giá chất lượng**, chọn `Có tiềm năng (POTENTIAL)`.
* **Kết quả mong đợi:** Lead được tạo thành công, tự động gán người phụ trách là chính sale tạo; trạng thái cập nhật đúng.

### Task SALE-02: Chuyển đổi Lead thành Deal (Convert to Deal)
* **Phân loại:** `VALID`
* **Mục đích:** Khi khách hàng có nhu cầu báo giá thực tế, chuyển sang giai đoạn cơ hội.
* **Dữ liệu mẫu:** Lead đã đánh giá `POTENTIAL`.
* **Các bước thao tác:**
  1. Mở chi tiết Lead đã tạo ở Task SALE-01.
  2. Bấm nút **Chuyển thành Deal**.
  3. Nhập tên cơ hội (ví dụ: *"Gói giải pháp Web Doanh Nghiệp 2026"*), nhập giá trị dự kiến: `50.000.000 ₫`.
  4. Bấm **Xác nhận chuyển đổi**.
* **Kết quả mong đợi:** Lead chuyển trạng thái sang **Đã chuyển đổi**; tạo ra một Deal mới ở trạng thái **Đang mở** (OPEN).

### Task SALE-03: Chốt hợp đồng và chọn Sale chốt (Closing Deal)
* **Phân loại:** `VALID`
* **Mục đích:** Khách hàng đồng ý ký hợp đồng; ghi nhận nhân sự sale chốt để tính thưởng hoa hồng.
* **Các bước thao tác:**
  1. Mở chi tiết Deal vừa tạo.
  2. Bấm nút **Chốt Deal (Đóng hợp đồng)**.
  3. Tại trường **Sale chốt hợp đồng**: Chọn bằng ô tìm kiếm có avatar và họ tên nhân viên (ví dụ: `Chuyên Viên Sales Team 1 - STG-SALE-01`).
  4. Bấm **Xác nhận chốt hợp đồng**.
* **Kết quả mong đợi:** Deal chuyển trạng thái sang **Đã chốt** (WON). Tự động tạo Đơn hàng ở trạng thái **Dự thảo (DRAFT)** gắn đúng Sale chốt.

### Task SALE-04: Thêm dịch vụ vào đơn hàng và trình duyệt
* **Phân loại:** `VALID`
* **Mục đích:** Hoàn thiện bảng giá đơn hàng trước khi gửi Boss duyệt.
* **Dữ liệu mẫu:** Dịch vụ: Thiết kế website, Đơn giá: `30.000.000 ₫`.
* **Các bước thao tác:**
  1. Mở đơn hàng DRAFT vừa được sinh ra.
  2. Bấm nút **Thêm dịch vụ**.
  3. Chọn dịch vụ từ dropdown (ví dụ: `Thiết kế Website Doanh nghiệp`).
  4. Kiểm tra đơn giá hiển thị bằng tiền Việt (`30.000.000 ₫`).
  5. Bấm **Lưu dịch vụ**.
  6. Bấm nút **Gửi duyệt đơn hàng**.
* **Kết quả mong đợi:** Đơn hàng cập nhật danh mục dịch vụ, tổng giá trị đơn hàng tính toán chính xác, chuyển sang trạng thái **Chờ duyệt**.

### Task SALE-05: Nộp báo cáo công việc hàng ngày (Daily Report)
* **Phân loại:** `VALID`
* **Mục đích:** Ghi nhận các đầu việc và khách hàng đã tư vấn trong ngày.
* **Các bước thao tác:**
  1. Truy cập menu **Báo cáo** (`/reports`).
  2. Bấm **Tạo báo cáo ngày**.
  3. Nhập số cuộc gọi đã thực hiện, số khách hàng đã gửi báo giá, ghi chú nội dung công việc.
  4. Bấm **Gửi báo cáo**.
* **Kết quả mong đợi:** Báo cáo được lưu trữ; hiển thị dấu tích hoàn thành báo cáo ngày; Trưởng nhóm xem được ngay.

### Task SALE-06: Theo dõi hoa hồng và điều kiện giải phóng
* **Phân loại:** `VALID (FROZEN COMMISSION RULE)`
* **Mục đích:** Minh bạch số tiền hoa hồng được hưởng khi thỏa mãn đồng thời cả 2 điều kiện: thu đủ tiền VÀ nghiệm thu xong.
* **Các bước thao tác:**
  1. Truy cập menu **Hoa hồng** (`/commissions`).
  2. Quan sát danh sách hoa hồng theo từng đơn hàng:
     - Trạng thái `Chờ giải phóng`: Khi đơn hàng chưa nghiệm thu HOẶC chưa thu đủ tiền (`FULLY_PAID`).
     - Trạng thái `Đã giải phóng`: Khi đơn hàng đã thanh toán đủ (`FULLY_PAID`) VÀ dự án đã hoàn tất nghiệm thu (`COMPLETED`).
* **Kết quả mong đợi:** Hoa hồng chỉ chuyển sang **Đã giải phóng** khi cả 2 điều kiện đều thỏa mãn.

---

## 6. VAI TRÒ: DEV_TEAM_LEADER (TRƯỞNG NHÓM KỸ THUẬT)

### Task DTL-01: Tiếp nhận dự án kỹ thuật được sinh tự động
* **Phân loại:** `VALID (NOTE: PROJECT DEADLINE LÀ SCHEMA GAP)`
* **Mục đích:** Quản lý các dự án phần mềm phát sinh sau khi Boss duyệt đơn hàng.
* **Lưu ý đặc biệt:** Cột hạn bàn giao cấp Dự án (`project.deadline_at`) hiện là **OPEN SCHEMA GAP** trong CSDL, hệ thống quản lý thời hạn qua Task và Milestone kỹ thuật.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_dev_leader`.
  2. Truy cập menu **Dự án** (`/projects`).
  3. Kiểm tra danh sách dự án thuộc **Team Lập Trình Web**.
  4. Bấm vào một dự án mới có trạng thái `Khởi tạo` hoặc `Đang thực hiện`.
* **Kết quả mong đợi:** Hiển thị thông tin dịch vụ, yêu cầu kỹ thuật và tiến độ thực hiện.

### Task DTL-02: Phân công Lập trình viên chính (Primary Dev Assignment)
* **Phân loại:** `VALID (CANONICAL RULE: TỐI ĐA 2 ACTIVE PRIMARY)`
* **Mục đích:** Giao trách nhiệm chính triển khai dự án cho thành viên nhóm theo đúng quy tắc tối đa 2 PRIMARY.
* **Dữ liệu mẫu:** Nhân viên: `Lập Trình Viên Team 1 (STG-DEV-01)`.
* **Các bước thao tác:**
  1. Tại chi tiết dự án, bấm nút **Phân công nhân sự**.
  2. Chọn vai trò: `Kỹ thuật viên chính (PRIMARY)`.
  3. Chọn nhân viên `Lập Trình Viên Team 1` từ dropdown $\rightarrow$ Bấm Lưu.
  4. Tiếp tục phân công nhân sự PRIMARY thứ hai $\rightarrow$ Hệ thống cho phép thành công.
  5. Thử phân công nhân sự PRIMARY thứ ba $\rightarrow$ Hệ thống hiển thị thông báo chặn lỗi.
  6. Phân công thêm nhân sự vai trò `SUPPORT` $\rightarrow$ Hệ thống cho phép thành công (không bị giới hạn).
* **Kết quả mong đợi:** Dự án cho phép tối đa 2 nhân sự `PRIMARY` cùng active; người thứ 3 bị chặn; nhân sự `SUPPORT` không bị giới hạn.

### Task DTL-03: Tạo Giai đoạn (Milestone) và phân rã Công việc (Task)
* **Phân loại:** `VALID`
* **Mục đích:** Chia nhỏ tiến độ dự án để quản lý.
* **Dữ liệu mẫu:** Milestone: `Giai đoạn 1 - Thiết kế giao diện & CSDL`.
* **Các bước thao tác:**
  1. Chuyển sang tab **Công việc & Tiến độ** trong chi tiết dự án.
  2. Bấm **Tạo công việc mới (Add Task)**.
  3. Nhập tên task (ví dụ: *"Cắt giao diện Figma sang HTML/CSS"*), chọn người thực hiện: `Lập Trình Viên Team 1`, ước lượng giờ làm: `16`.
  4. Bấm **Tạo Task**.
* **Kết quả mong đợi:** Task mới hiển thị trong danh sách công việc của dự án; Lập trình viên nhận được thông báo.

### Task DTL-04: Cập nhật tiến độ dự án tự động (Progress Auto-derivation)
* **Phân loại:** `VALID`
* **Mục đích:** Xác minh % tiến độ dự án được tính toán tự động dựa trên số task hoàn thành, không cho phép gõ bừa số %.
* **Các bước thao tác:**
  1. Quan sát % tiến độ ban đầu của dự án (ví dụ: 0%).
  2. Khi lập trình viên đánh dấu hoàn thành 1 trong 2 task.
  3. Tải lại trang chi tiết dự án.
* **Kết quả mong đợi:** Tiến độ tự động nhảy lên **50%** dựa trên công thức trọng số task; không có ô nhập tay % tiến độ.

### Task DTL-05: Kiểm tra phân quyền cách ly với Team Mobile
* **Phân loại:** `VALID`
* **Mục đích:** Đảm bảo Trưởng nhóm Web không can thiệp vào các dự án của Team Mobile.
* **Các bước thao tác:**
  1. Mở danh sách dự án.
  2. Kiểm tra không xuất hiện dự án nào của Team Mobile (`Team Lập Trình Mobile`).
  3. Thử mở URL dự án của Team Mobile.
* **Kết quả mong đợi:** Bị chặn với thông báo lỗi **403 Forbidden**.

---

## 7. VAI TRÒ: DEV (LẬP TRÌNH VIÊN)

### Task DEV-01: Nhận thông báo và xem danh sách Task được giao
* **Phân loại:** `VALID`
* **Mục đích:** Tiếp nhận công việc kỹ thuật nhanh chóng từ hệ thống.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_dev`.
  2. Quan sát biểu tượng chuông thông báo trên thanh Header: xuất hiện badge đỏ.
  3. Bấm vào chuông thông báo, chọn thông báo *"Bạn được phân công làm task..."*.
  4. Hệ thống deep-link trực tiếp đến trang chi tiết dự án chứa task đó.
* **Kết quả mong đợi:** Xem được nội dung task, mô tả yêu cầu kỹ thuật.

### Task DEV-02: Cập nhật trạng thái công việc kỹ thuật
* **Phân loại:** `VALID`
* **Mục đích:** Cập nhật tiến độ thực tế khi bắt đầu và hoàn thành công việc.
* **Các bước thao tác:**
  1. Tại danh sách task của mình, chuyển trạng thái task từ `TODO` sang `IN_PROGRESS`.
  2. Sau khi hoàn thành code, chuyển trạng thái sang `COMPLETED` (hoặc `DONE`).
  3. Nhập ghi chú kết quả (ví dụ: *"Đã hoàn thành cắt giao diện và test responsive"*).
* **Kết quả mong đợi:** Task chuyển trạng thái hoàn thành; tiến độ dự án chung tự động tăng tương ứng.

### Task DEV-03: Nộp báo cáo ngày công việc kỹ thuật
* **Phân loại:** `VALID`
* **Mục đích:** Ghi nhận số giờ làm việc và nội dung code trong ngày.
* **Các bước thao tác:**
  1. Truy cập menu **Báo cáo** (`/reports`).
  2. Bấm **Tạo báo cáo ngày**.
  3. Chọn dự án đang làm, ghi số giờ làm việc thực tế, mô tả module đã hoàn thành.
  4. Bấm **Gửi báo cáo**.
* **Kết quả mong đợi:** Báo cáo được gửi lên Trưởng nhóm Dev thành công.

### Task DEV-04: Xác minh chặn quyền truy cập dữ liệu tài chính
* **Phân loại:** `VALID (SECURITY CONSTRAINT)`
* **Mục đích:** Đảm bảo lập trình viên không xem được dữ liệu nhạy cảm của phòng tài chính/kinh doanh.
* **Các bước thao tác:**
  1. Thử bấm vào các menu tài chính hoặc gõ URL: `/payments`, `/expenses`, `/deals`.
* **Kết quả mong đợi:** Menu không hiển thị trên Sidebar; nếu gõ trực tiếp URL sẽ hiển thị trang **403 Không có quyền**.

---

## 8. VAI TRÒ: SEO_TEAM_LEADER (TRƯỞNG NHÓM SEO)

### Task STL-SEO-01: Tiếp nhận dự án SEO và phân công chuyên viên
* **Phân loại:** `VALID`
* **Mục đích:** Quản lý các dự án dịch vụ SEO Website từ hợp đồng đã ký.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_seo_leader`.
  2. Truy cập menu **Dự án** (`/projects`).
  3. Chọn dự án dịch vụ SEO (thuộc **Team Nội Dung & SEO 1**).
  4. Bấm **Phân công nhân sự**, chọn `Chuyên Viên SEO Team 1 (STG-SEO-01)`.
  5. Bấm **Lưu phân công**.
* **Kết quả mong đợi:** Dự án ghi nhận chuyên viên SEO phụ trách; chuyên viên nhận được thông báo in-app.

### Task STL-SEO-02: Phân bổ task công việc SEO cho thành viên
* **Phân loại:** `VALID (NOTE: PROJECT TASK BOARD TIÊU CHUẨN, KHÔNG CÓ CMS RIÊNG)`
* **Mục đích:** Phân rã kế hoạch bài viết và công việc tối ưu qua task board dự án tiêu chuẩn.
* **Các bước thao tác:**
  1. Trong trang dự án SEO, bấm **Thêm công việc**.
  2. Tạo các task kỹ thuật SEO:
     - Task 1: *"Nghiên cứu bộ từ khóa ngành"*
     - Task 2: *"Tối ưu Onpage 20 bài viết chuẩn SEO"*
  3. Gán hạn hoàn thành, trọng số và chuyên viên thực hiện.
* **Kết quả mong đợi:** Danh sách task hiển thị rõ ràng trên task board của dự án, chuyên viên SEO nhìn thấy ngay trong dashboard cá nhân.

### Task STL-SEO-03: Xem và giám sát báo cáo ngày nhóm SEO
* **Phân loại:** `VALID (CHỈ XEM/GIÁM SÁT, KHÔNG CÓ WORKFLOW DUYỆT)`
* **Mục đích:** Kiểm soát sản lượng công việc hàng ngày của nhân viên.
* **Các bước thao tác:**
  1. Truy cập menu **Báo cáo** (`/reports`).
  2. Xem báo cáo ngày của các thành viên trong nhóm SEO 1.
  3. Kiểm tra số giờ làm việc và nội dung công việc nộp.
* **Kết quả mong đợi:** Xem được đầy đủ báo cáo của thành viên nhóm; chặn không xem được nhóm SEO 2.

---

## 9. VAI TRÒ: SEO (CHUYÊN VIÊN SEO)

### Task SEO-01: Xem nhiệm vụ SEO được phân công trong dự án
* **Phân loại:** `VALID`
* **Mục đích:** Nắm bắt công việc tối ưu cần thực hiện trên task board dự án.
* **Các bước thao tác:**
  1. Đăng nhập bằng tài khoản `staging_seo`.
  2. Truy cập menu **Dự án** (`/projects`).
  3. Mở dự án SEO được gán.
* **Kết quả mong đợi:** Chỉ thấy các dự án và task được phân công cho chính mình hoặc nhóm SEO 1.

### Task SEO-02: Cập nhật kết quả triển khai task SEO
* **Phân loại:** `VALID`
* **Mục đích:** Báo cáo hoàn thành các đầu việc SEO.
* **Các bước thao tác:**
  1. Chọn task SEO đang làm.
  2. Cập nhật trạng thái sang `COMPLETED` (hoặc `DONE`).
  3. Nhập ghi chú kết quả công việc.
* **Kết quả mong đợi:** Trạng thái task chuyển thành Hoàn thành; tiến độ dự án SEO tăng lên tương ứng.

### Task SEO-03: Nộp báo cáo ngày hoạt động SEO
* **Phân loại:** `VALID`
* **Mục đích:** Báo cáo công việc hàng ngày cho Trưởng nhóm SEO.
* **Các bước thao tác:**
  1. Truy cập menu **Báo cáo** (`/reports`).
  2. Điền số giờ làm việc và tóm tắt kết quả công việc trong ngày.
  3. Bấm **Gửi báo cáo**.
* **Kết quả mong đợi:** Báo cáo được gửi thành công, hiển thị trong danh sách báo cáo cá nhân.

### Task SEO-04: Kiểm tra chặn quyền truy cập hợp đồng/tài chính
* **Phân loại:** `VALID (SECURITY CONSTRAINT)`
* **Mục đích:** Đảm bảo phân quyền bảo mật chặt chẽ cho nhân sự SEO.
* **Các bước thao tác:**
  1. Thử truy cập menu Đơn hàng, Hóa đơn hoặc Bảng lương.
* **Kết quả mong đợi:** Không có menu hiển thị; bị chặn 403 nếu truy cập URL trực tiếp.
