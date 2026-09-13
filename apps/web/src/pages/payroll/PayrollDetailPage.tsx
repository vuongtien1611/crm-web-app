import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  LockOutlined,
  PlusOutlined,
  FileSearchOutlined,
  CalendarOutlined,
  DollarOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  fetchPayrollPeriodById,
  fetchPeriodEmployees,
  calculatePayrollPeriod,
  submitPayrollReview,
  approvePayrollPeriod,
  lockPayrollPeriod,
  addPayrollAdjustment,
  PayrollPeriod,
  EmployeePayrollItem,
} from '../../api/payroll';
import { getStatusLabel, formatCurrency, formatDate } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';
import { DetailPageHeader } from '../../components/common/detail/DetailPageHeader';
import { DetailSummaryCard, DetailSummaryGrid } from '../../components/common/detail/DetailSummaryCard';
import { DetailInfoCard } from '../../components/common/detail/DetailInfoCard';
import { DetailRelatedList } from '../../components/common/detail/DetailRelatedList';

const { Text } = Typography;

export const PayrollDetailPage: React.FC = () => {
  const { periodId } = useParams<{ periodId: string }>();
  const navigate = useNavigate();
  // Chỉ loading toàn màn hình ở lần đầu mở trang
  const [loading, setLoading] = useState<boolean>(true);
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [employees, setEmployees] = useState<EmployeePayrollItem[]>([]);
  // Quản lý trạng thái đang xử lý theo từng nút bấm
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState<boolean>(false);
  const [adjForm] = Form.useForm();

  // Tải chi tiết bảng lương - không unmount giao diện khi refresh ngầm
  const loadData = async (isInitial = false) => {
    if (!periodId) return;
    if (isInitial) setLoading(true);
    try {
      const [periodData, empList] = await Promise.all([
        fetchPayrollPeriodById(periodId),
        fetchPeriodEmployees(periodId),
      ]);
      setPeriod(periodData);
      setEmployees(empList);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải chi tiết kỳ tính lương');
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [periodId]);

  // Tính toán lại bảng lương
  const handleCalculate = async () => {
    if (!periodId || actionLoading) return;
    setActionLoading('calc');
    try {
      await calculatePayrollPeriod(periodId);
      message.success('Tính lương thành công');
      await loadData(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể tính toán bảng lương');
    } finally {
      setActionLoading(null);
    }
  };

  // Gửi duyệt bảng lương
  const handleSubmitReview = async () => {
    if (!periodId || actionLoading) return;
    setActionLoading('submit');
    try {
      await submitPayrollReview(periodId);
      message.success('Đã gửi duyệt bảng lương');
      await loadData(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể gửi duyệt bảng lương');
    } finally {
      setActionLoading(null);
    }
  };

  // Duyệt bảng lương
  const handleApprove = async () => {
    if (!periodId || actionLoading) return;
    setActionLoading('approve');
    try {
      await approvePayrollPeriod(periodId);
      message.success('Đã duyệt bảng lương');
      await loadData(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể duyệt bảng lương');
    } finally {
      setActionLoading(null);
    }
  };

  // Khóa chốt bảng lương
  const handleLock = async () => {
    if (!periodId || actionLoading) return;
    setActionLoading('lock');
    try {
      await lockPayrollPeriod(periodId);
      message.success('Đã khóa chốt bảng lương (không thể chỉnh sửa)');
      await loadData(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể khóa bảng lương');
    } finally {
      setActionLoading(null);
    }
  };

  // Thêm điều chỉnh lương
  const handleAddAdjustment = async (values: any) => {
    if (!periodId || actionLoading) return;
    setActionLoading('adjust');
    try {
      await addPayrollAdjustment(periodId, {
        employeeId: values.employeeId,
        amount: values.amount,
        reason: values.reason,
      });
      message.success('Đã thêm khoản điều chỉnh');
      setIsAdjModalOpen(false);
      adjForm.resetFields();
      await loadData(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể thêm điều chỉnh lương');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || !period) {
    return (
      <div className="vmax-detail-page">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <Spin size="large" />
        </div>
      </div>
    );
  }

  const isLocked = period.status === 'LOCKED';

  const getStatusBadge = (status: string) => {
    const color = isLocked ? 'green' : status === 'APPROVED' ? 'cyan' : 'gold';
    return (
      <Tag color={color} style={{ fontWeight: 600, padding: '2px 10px', borderRadius: 12 }}>
        {getStatusLabel(status)}
      </Tag>
    );
  };

  const columns = [
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      key: 'employee_code',
      width: 100,
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Tên nhân viên',
      dataIndex: 'employee_name',
      key: 'employee_name',
      render: (name: string, record: EmployeePayrollItem) => (
        <a
          onClick={() => navigate(`/payroll/${periodId}/employees/${record.employee_id}`)}
          style={{ color: 'var(--vmax-green)', fontWeight: 600 }}
        >
          {name}
        </a>
      ),
    },
    {
      title: 'Lương cơ bản',
      dataIndex: 'base_salary',
      key: 'base_salary',
      render: (val: number) => formatCurrency(val || 0),
    },
    {
      title: 'Hoa hồng nhận',
      dataIndex: 'released_commission_amount',
      key: 'released_commission_amount',
      render: (val: number) => (
        <Text style={{ color: val > 0 ? 'var(--vmax-green)' : undefined }}>
          {formatCurrency(val || 0)}
        </Text>
      ),
    },
    {
      title: 'Thưởng KPI',
      dataIndex: 'kpi_bonus_amount',
      key: 'kpi_bonus_amount',
      render: (val: number) => formatCurrency(val || 0),
    },
    {
      title: 'HH Quản lý (TL)',
      dataIndex: 'team_override_amount',
      key: 'team_override_amount',
      render: (val: number) => formatCurrency(val || 0),
    },
    {
      title: 'Điều chỉnh',
      dataIndex: 'adjustment_amount',
      key: 'adjustment_amount',
      render: (val: number) => (
        <Text type={val < 0 ? 'danger' : val > 0 ? 'success' : undefined}>
          {formatCurrency(val || 0)}
        </Text>
      ),
    },
    {
      title: 'Lương thực nhận (Net)',
      dataIndex: 'net_salary_amount',
      key: 'net_salary_amount',
      render: (val: number) => (
        <Text strong style={{ color: '#0C6B37', fontSize: 15 }}>
          {formatCurrency(val || 0)}
        </Text>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: EmployeePayrollItem) => (
        <Button
          type="link"
          onClick={() => navigate(`/payroll/${periodId}/employees/${record.employee_id}`)}
        >
          Phiếu lương
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={`Kỳ tính lương #${period.period_key}`}
        code={period.period_key}
        icon={<CalendarOutlined />}
        status={getStatusBadge(period.status)}
        onBack={() => navigate('/payroll')}
        backLabel="Danh sách kỳ lương"
        metaTags={
          <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
            <span>
              Thời gian: <strong>{formatDate(period.start_date)}</strong> → <strong>{formatDate(period.end_date)}</strong>
            </span>
            <span>
              Quy mô: <strong>{period.stats?.employee_count || employees.length} nhân sự</strong>
            </span>
          </Space>
        }
        actions={
          <Space wrap>
            {!isLocked && (
              <>
                <Button
                  icon={<SyncOutlined />}
                  loading={actionLoading === 'calc'}
                  disabled={!!actionLoading}
                  onClick={handleCalculate}
                >
                  Tính lại lương
                </Button>
                {period.status === 'CALCULATING' && (
                  <Button
                    icon={<FileSearchOutlined />}
                    loading={actionLoading === 'submit'}
                    disabled={!!actionLoading}
                    onClick={handleSubmitReview}
                  >
                    Gửi duyệt
                  </Button>
                )}
                {period.status === 'REVIEW' && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={actionLoading === 'approve'}
                    disabled={!!actionLoading}
                    onClick={handleApprove}
                    style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
                  >
                    Duyệt bảng lương
                  </Button>
                )}
                {period.status === 'APPROVED' && (
                  <Button
                    danger
                    icon={<LockOutlined />}
                    loading={actionLoading === 'lock'}
                    disabled={!!actionLoading}
                    onClick={handleLock}
                  >
                    Khóa chốt bảng lương
                  </Button>
                )}
                <Button
                  icon={<PlusOutlined />}
                  disabled={!!actionLoading}
                  onClick={() => setIsAdjModalOpen(true)}
                >
                  Thêm điều chỉnh
                </Button>
              </>
            )}
            {isLocked && (
              <Tag
                icon={<LockOutlined />}
                color="red"
                style={{ padding: '6px 12px', fontSize: 13, borderRadius: 6, fontWeight: 700 }}
              >
                ĐÃ KHÓA CHỐT BẢNG LƯƠNG
              </Tag>
            )}
          </Space>
        }
      />

      {/* Summary Grid */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="Tổng thực nhận (Net Salary)"
          value={formatCurrency(period.stats?.total_net_salary || 0)}
          subtitle="Tổng ngân sách chi trả nhân sự"
          icon={<DollarOutlined />}
          valueColor="#0C6B37"
        />
        <DetailSummaryCard
          title="Tổng lương cơ bản"
          value={formatCurrency(period.stats?.total_base_salary || 0)}
          subtitle="Lương ngạch bậc cố định"
          icon={<DollarOutlined />}
        />
        <DetailSummaryCard
          title="Tổng hoa hồng chi trả"
          value={formatCurrency(period.stats?.total_commissions || 0)}
          subtitle="Bao gồm HH kinh doanh & quản lý"
          icon={<SafetyCertificateOutlined />}
        />
        <DetailSummaryCard
          title="Số lượng nhân sự"
          value={`${period.stats?.employee_count || employees.length} người`}
          subtitle={`Trạng thái: ${getStatusLabel(period.status)}`}
          icon={<TeamOutlined />}
        />
      </DetailSummaryGrid>

      {/* 2-Column Responsive Layout */}
      <div className="vmax-detail-grid">
        {/* Main Column */}
        <div className="vmax-detail-main">
          <DetailRelatedList
            title="Bảng lương chi tiết theo nhân viên"
            count={employees.length}
            extra={
              !isLocked ? (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setIsAdjModalOpen(true)}
                >
                  Điều chỉnh lương
                </Button>
              ) : undefined
            }
          >
            <Table
              rowKey="id"
              columns={columns}
              dataSource={employees}
              loading={loading}
              pagination={{ pageSize: 15, showSizeChanger: true }}
              scroll={{ x: 'max-content' }}
              onRow={createRowNavigateHandler(
                navigate,
                (record) => `/payroll/${periodId}/employees/${record.employee_id}`
              )}
            />
          </DetailRelatedList>
        </div>

        {/* Side Column */}
        <div className="vmax-detail-side">
          <DetailInfoCard
            title="Thông tin kỳ tính lương"
            columns={1}
            items={[
              { label: 'Mã kỳ lương', value: <Text strong>#{period.period_key}</Text> },
              { label: 'Trạng thái', value: getStatusBadge(period.status) },
              { label: 'Ngày bắt đầu kỳ', value: formatDate(period.start_date) },
              { label: 'Ngày kết thúc kỳ', value: formatDate(period.end_date) },
              {
                label: 'Tổng nhân viên tính lương',
                value: <Text strong>{period.stats?.employee_count || employees.length}</Text>,
              },
              {
                label: 'Chốt khóa bảng lương',
                value: isLocked ? (
                  <Tag color="error">Đã khóa chốt (Read-only)</Tag>
                ) : (
                  <Tag color="processing">Đang mở hiệu chỉnh</Tag>
                ),
              },
            ]}
          />

          <DetailInfoCard
            title="Cơ cấu ngân sách lương"
            columns={1}
            items={[
              {
                label: 'Lương cơ bản',
                value: formatCurrency(period.stats?.total_base_salary || 0),
              },
              {
                label: 'Hoa hồng trích xuất',
                value: formatCurrency(period.stats?.total_commissions || 0),
              },
              {
                label: 'Thực nhận (Net Payroll)',
                value: (
                  <Text strong style={{ color: '#0C6B37', fontSize: 16 }}>
                    {formatCurrency(period.stats?.total_net_salary || 0)}
                  </Text>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Modal Add Adjustment */}
      <Modal
        title="Thêm khoản điều chỉnh lương thủ công"
        open={isAdjModalOpen}
        onCancel={() => setIsAdjModalOpen(false)}
        onOk={() => adjForm.submit()}
        confirmLoading={actionLoading === 'adjust'}
        okText="Lưu điều chỉnh"
        cancelText="Hủy"
      >
        <Form className="vmax-form" form={adjForm} layout="vertical" onFinish={handleAddAdjustment}>
          <Form.Item
            name="employeeId"
            label="ID nhân viên"
            rules={[{ required: true, message: 'Vui lòng nhập ID nhân viên' }]}
          >
            <Input placeholder="Nhập ID nhân viên" />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Số tiền điều chỉnh (+ hoặc - VND)"
            rules={[{ required: true, message: 'Vui lòng nhập số tiền điều chỉnh' }]}
          >
            <InputNumber style={{ width: '100%' }} placeholder="Ví dụ: 500000 hoặc -200000" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Lý do điều chỉnh"
            rules={[{ required: true, message: 'Vui lòng nhập lý do điều chỉnh' }]}
          >
            <Input.TextArea placeholder="Nhập lý do bắt buộc cho khoản điều chỉnh" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PayrollDetailPage;
