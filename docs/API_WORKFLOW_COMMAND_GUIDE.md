# TÀI LIỆU CHUẨN HÓA API COMMAND / ACTION (AUD-017)

## 1. Tổng quan & Triết lý thiết kế

Hệ thống CRM VMAX được thiết kế theo kiến trúc Workflow State Machine kết hợp RESTful Resource Model. Các hành vi thay đổi trạng thái nghiệp vụ (State Transitions) được chuẩn hóa thành các Command / Action Endpoints có tính chất kiểm soát chuyển trạng thái chặt chẽ.

Quy tắc bất biến:
- Giữ nguyên toàn bộ URL hiện tại của các action để bảo đảm 100% tương thích ngược với Frontend và Third-party integrations.
- Phương thức HTTP chuẩn cho mọi Command / Action: **POST**.
- Kết quả thành công trả về: **HTTP 200 OK** (hoặc **201 Created** khi sinh bản ghi mới).
- Mã lỗi chuẩn hóa theo NestJS Exceptions và `AllExceptionsFilter`:
  - `400 Bad Request`: Chuyển trạng thái không hợp lệ (sai State Machine transition), thiếu dữ liệu bắt buộc hoặc vi phạm ràng buộc nghiệp vụ.
  - `401 Unauthorized`: Chưa xác thực hoặc Token/Session hết hạn / bị thu hồi.
  - `403 Forbidden`: Người dùng không có Role hoặc Permission để kích hoạt Action này.
  - `404 Not Found`: Thực thể (Entity) không tồn tại.
  - `409 Conflict`: Xung đột đồng thời hoặc trạng thái đã bị thay đổi trước đó.

---

## 2. Bảng ma trận Workflow State Machine & Action Endpoints

| Module | Action Endpoint | Method | Trạng thái nguồn | Trạng thái đích | Quyền tối thiểu / Role | Mô tả nghiệp vụ |
|---|---|---|---|---|---|---|
| **Deals** | `/api/deals/:id/start-negotiation` | POST | PROPOSAL | NEGOTIATION | Sale / Sales Leader / Boss | Chuyển Deal sang giai đoạn đàm phán |
| **Deals** | `/api/deals/:id/win` | POST | NEGOTIATION / ANY ACTIVE | WON | Sale / Sales Leader / Boss | Đánh dấu Deal thành công, tự động tạo Order DRAFT |
| **Deals** | `/api/deals/:id/lose` | POST | ANY ACTIVE | LOST | Sale / Sales Leader / Boss | Đánh dấu Deal thất bại (kèm lý do) |
| **Orders** | `/api/orders/:id/submit` | POST | DRAFT | SUBMITTED | Sale (Owner) / Leader / Boss | Gửi đơn hàng lên cấp quản lý xét duyệt |
| **Orders** | `/api/orders/:id/approve` | POST | SUBMITTED | APPROVED | Sales Leader / Boss | Phê duyệt đơn hàng, chốt kế hoạch thanh toán |
| **Orders** | `/api/orders/:id/reject` | POST | SUBMITTED | REJECTED | Sales Leader / Boss | Từ chối đơn hàng (kèm lý do từ chối) |
| **Orders** | `/api/orders/:id/request-more-info` | POST | SUBMITTED | DRAFT | Sales Leader / Boss | Yêu cầu Sale bổ sung thông tin |
| **Orders** | `/api/orders/:id/resubmit` | POST | DRAFT | SUBMITTED | Sale (Owner) / Leader / Boss | Gửi lại đơn hàng sau khi chỉnh sửa |
| **Orders** | `/api/orders/:id/cancel` | POST | DRAFT / SUBMITTED | CANCELLED | Sale Leader / Boss | Hủy bỏ đơn hàng |
| **Order Items** | `/api/order-items/:id/submit` | POST | DRAFT | SUBMITTED | Sale / Leader / Boss | Gửi hạng mục duyệt riêng |
| **Order Items** | `/api/order-items/:id/approve` | POST | SUBMITTED | APPROVED | Sales Leader / Boss | Phê duyệt hạng mục, tự động tạo Dự án Tech |
| **Order Items** | `/api/order-items/:id/reject` | POST | SUBMITTED | REJECTED | Sales Leader / Boss | Từ chối hạng mục dịch vụ |
| **Order Items** | `/api/order-items/:id/cancel` | POST | DRAFT / SUBMITTED | CANCELLED | Sales Leader / Boss | Hủy hạng mục dịch vụ |
| **Change Requests** | `/api/change-requests/:id/approve` | POST | PENDING | APPROVED | Tech Leader / Boss | Phê duyệt yêu cầu thay đổi scope dự án |
| **Change Requests** | `/api/change-requests/:id/reject` | POST | PENDING | REJECTED | Tech Leader / Boss | Từ chối yêu cầu thay đổi |
| **Change Requests** | `/api/change-requests/:id/implement` | POST | APPROVED | IMPLEMENTED | Dev / Tech Leader / Boss | Xác nhận đã hoàn tất triển khai thay đổi |
| **Projects** | `/api/projects/:id/start` | POST | NOT_STARTED | IN_PROGRESS | Dev Leader / SEO Leader / Boss | Bắt đầu triển khai dự án |
| **Projects** | `/api/projects/:id/block` | POST | IN_PROGRESS | BLOCKED | Assignee / Leader / Boss | Đánh dấu dự án bị nghẽn (kèm lý do) |
| **Projects** | `/api/projects/:id/review` | POST | IN_PROGRESS | REVIEW | Assignee / Leader / Boss | Chuyển dự án sang nghiệm thu / review |
| **Projects** | `/api/projects/:id/approve` | POST | REVIEW | COMPLETED | Tech Leader / Boss | Nghiệm thu bàn giao dự án |
| **Projects** | `/api/projects/:id/cancel` | POST | ANY EXCEPT COMPLETED | CANCELLED | Boss | Hủy dự án |
| **Payments** | `/api/payments/:id/confirm` | POST | PENDING | CONFIRMED | Accountant / Boss | Xác nhận thu tiền, phân bổ vào đợt thanh toán, kích hoạt KPI/Hoa hồng |
| **Payments** | `/api/payments/:id/reject` | POST | PENDING | REJECTED | Accountant / Boss | Từ chối chứng từ thanh toán |
| **Subscriptions** | `/api/subscriptions/:id/cancel` | POST | ACTIVE | CANCELLED | Sales Leader / Boss | Hủy gói thuê bao gia hạn định kỳ |
| **Subscriptions** | `/api/subscriptions/:id/generate-periods` | POST | ACTIVE | ACTIVE | System / Boss | Sinh chu kỳ thực hiện mới cho subscription |
| **Weekly Reports** | `/api/weekly-reports/:id/complete` | POST | DRAFT | COMPLETED | Team Leader (Owner) | Hoàn thành và khóa báo cáo tuần của team |

---

## 3. Cấu trúc Response chuẩn hóa

### 3.1. Phản hồi thành công (Action Thành Công)
```json
{
  "id": "123",
  "status": "APPROVED",
  "updatedAt": "2026-11-10T14:50:00.000Z",
  "message": "Phê duyệt đơn hàng thành công"
}
```

### 3.2. Phản hồi lỗi chuẩn hóa (`AllExceptionsFilter`)
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Không thể chuyển trạng thái đơn hàng từ DRAFT sang APPROVED. Yêu cầu SUBMITTED trước.",
  "timestamp": "2026-11-10T14:50:00.000Z",
  "path": "/api/orders/123/approve",
  "correlationId": "4bf8ef68-9a67-466d-8877-94a50099ef87",
  "success": false
}
```

