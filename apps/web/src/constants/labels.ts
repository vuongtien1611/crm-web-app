/**
 * Centralized labels, status mappings, and formatters for CRM Web App (vi-VN)
 */

export const STATUS_LABELS: Record<string, string> = {
  // Common / General
  ALL: 'Tất cả trạng thái',
  ACTIVE: 'Hoạt động',
  DISABLED: 'Vô hiệu hóa',
  SUSPENDED: 'Tạm ngưng',
  TODO: 'Cần làm',
  DONE: 'Hoàn thành',

  // Lead Lifecycle
  NEW: 'Mới',
  CALLED: 'Đã gọi',
  CONSULTED: 'Đã tư vấn',
  FOLLOWING: 'Đang theo dõi',
  CONVERTED: 'Đã chuyển đổi',
  FAILED: 'Thất bại',

  // Lead Quality
  POTENTIAL: 'Tiềm năng',
  NOT_POTENTIAL: 'Không tiềm năng',
  UNCLASSIFIED: 'Chưa phân loại',

  // Deal Pipeline
  OPEN: 'Đang mở',
  NEGOTIATING: 'Đang đàm phán',
  WON: 'Thắng deal',
  LOST: 'Thất bại',

  // Order & Order Item Workflow
  DRAFT: 'Nháp',
  PENDING: 'Chờ xử lý',
  PENDING_APPROVAL: 'Chờ duyệt',
  NEED_MORE_INFO: 'Cần bổ sung thông tin',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành',
  IMPLEMENTED: 'Đã áp dụng',

  // Payment Terms & Installment Status
  UNPAID: 'Chưa thanh toán',
  PARTIALLY_PAID: 'Thanh toán một phần',
  FULLY_PAID: 'Đã thanh toán đủ',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',

  // Project Delivery Lifecycle
  ASSIGNED: 'Đã phân công',
  READY_TO_START: 'Sẵn sàng bắt đầu',
  WAITING_CUSTOMER: 'Chờ khách hàng',
  WAITING_SALE: 'Chờ Sale',
  WAITING_INTERNAL: 'Chờ nội bộ',
  BLOCKED: 'Bị chặn',
  REVIEW: 'Đang kiểm tra',
  ACCEPTANCE: 'Chờ nghiệm thu',

  // Commission Lifecycle
  UNEARNED: 'Chưa ghi nhận',
  RELEASED: 'Đã giải ngân',
  CALCULATED: 'Đã tính toán',
  ADJUSTED: 'Đã điều chỉnh',
  PAID: 'Đã thanh toán',

  // Payroll Period Lifecycle
  CALCULATING: 'Đang tính toán',
  LOCKED: 'Đã khóa bảo lưu',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  BOSS: 'Giám đốc',
  SALE: 'Nhân viên kinh doanh',
  SALES_TEAM_LEADER: 'Trưởng nhóm kinh doanh',
  DEV: 'Lập trình viên',
  SEO: 'Nhân viên SEO',
  ACCOUNTANT: 'Kế toán',
};

export const MODULE_LABELS: Record<string, string> = {
  Dashboard: 'Tổng quan',
  Employees: 'Nhân viên',
  Leads: 'Khách hàng tiềm năng',
  Deals: 'Cơ hội bán hàng',
  Customers: 'Khách hàng',
  Orders: 'Đơn hàng',
  Projects: 'Dự án',
  Payments: 'Thanh toán',
  Commissions: 'Hoa hồng',
  KPI: 'KPI',
  Payroll: 'Bảng lương',
  Subscriptions: 'Dịch vụ định kỳ',
  Expenses: 'Chi phí',
  Reports: 'Báo cáo',
  Settings: 'Cài đặt',
  Profile: 'Hồ sơ cá nhân',
  Acquisition: 'Kênh tiếp thị & Thu hút',
};

export const ACTION_LABELS: Record<string, string> = {
  Create: 'Tạo mới',
  Add: 'Thêm',
  Edit: 'Chỉnh sửa',
  Update: 'Cập nhật',
  Save: 'Lưu',
  Delete: 'Xóa',
  Cancel: 'Hủy',
  Confirm: 'Xác nhận',
  Approve: 'Duyệt',
  Reject: 'Từ chối',
  Submit: 'Gửi duyệt',
  Search: 'Tìm kiếm',
  Filter: 'Lọc',
  Reset: 'Đặt lại',
  View: 'Xem',
  Detail: 'Chi tiết',
  Close: 'Đóng',
  Back: 'Quay lại',
  Next: 'Tiếp theo',
  Previous: 'Trước',
  Refresh: 'Làm mới',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Chuyển khoản ngân hàng',
  CASH: 'Tiền mặt',
  CREDIT_CARD: 'Thẻ tín dụng',
  E_WALLET: 'Ví điện tử',
};

export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  SALE: 'Kinh doanh (Sale)',
  PROJECT_DELIVERY: 'Triển khai dự án',
  TEAM_OVERRIDE: 'Hoa hồng quản lý đội nhóm',
};

export const KPI_SOURCE_TYPE_LABELS: Record<string, string> = {
  PAYMENT_ALLOCATION: 'Dòng tiền thực thu',
  PROJECT_ACCEPTANCE: 'Nghiệm thu dự án',
  SEO_ARTICLE: 'Bài viết SEO',
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CALL: 'Cuộc gọi',
  MEETING: 'Gặp mặt',
  ZALO: 'Zalo',
  EMAIL: 'Email',
  NOTE: 'Ghi chú',
  FOLLOW_UP: 'Theo dõi lại',
  QUOTATION: 'Gửi báo giá',
  TASK: 'Công việc',
};

export function getStatusLabel(status?: string | null): string {
  if (!status) return '';
  return STATUS_LABELS[status] || status;
}

export function getRoleLabel(role?: string | null): string {
  if (!role) return '';
  return ROLE_LABELS[role] || role;
}

export function getPaymentMethodLabel(method?: string | null): string {
  if (!method) return '';
  return PAYMENT_METHOD_LABELS[method] || method;
}

export function getCommissionTypeLabel(type?: string | null): string {
  if (!type) return '';
  return COMMISSION_TYPE_LABELS[type] || type;
}

export function getKpiSourceTypeLabel(source?: string | null): string {
  if (!source) return '';
  return KPI_SOURCE_TYPE_LABELS[source] || source;
}

export function getActivityTypeLabel(act?: string | null): string {
  if (!act) return '';
  return ACTIVITY_TYPE_LABELS[act] || act;
}

/**
 * Format currency in VND with format e.g. 13.000.000 ₫
 */
export function formatCurrency(amount?: number | string | null): string {
  if (amount === undefined || amount === null || amount === '') return '0 ₫';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0 ₫';
  return `${num.toLocaleString('vi-VN')} ₫`;
}

/**
 * Format date in dd/MM/yyyy
 */
export function formatDate(date?: string | Date | null): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format date time in dd/MM/yyyy HH:mm
 */
export function formatDateTime(date?: string | Date | null): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
