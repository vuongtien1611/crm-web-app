import React, { useState, useEffect } from 'react';
import {
  Tag,
  Button,
  Spin,
  Alert,
  Space,
  Typography,
  Result,
} from 'antd';
import {
  ArrowLeftOutlined,
  BankOutlined,
  ShoppingOutlined,
  DollarOutlined,
  CalendarOutlined,
  UserOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getExpenseById, ExpenseItem, ExpenseSourceType } from '../../api/expenses';
import { DetailPageHeader } from '../../components/common/detail/DetailPageHeader';
import { DetailSummaryCard, DetailSummaryGrid } from '../../components/common/detail/DetailSummaryCard';
import { DetailInfoCard } from '../../components/common/detail/DetailInfoCard';

const { Text } = Typography;

export const ExpenseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [expense, setExpense] = useState<ExpenseItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRead =
    user?.permissions?.includes('EXPENSE_READ') || user?.roles?.includes('ADMIN');

  useEffect(() => {
    if (!id || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getExpenseById(id)
      .then((data) => {
        setExpense(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || `Không thể tải chi tiết khoản chi #${id}`);
      })
      .finally(() => setLoading(false));
  }, [id, canRead]);

  if (!canRead) {
    return (
      <div className="vmax-detail-page">
        <Result
          status="403"
          title="403 - Không có quyền truy cập"
          subTitle="Tài khoản của bạn không có quyền EXPENSE_READ để truy cập chi tiết khoản chi."
          extra={
            <Button
              type="primary"
              onClick={() => navigate('/dashboard')}
              style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
            >
              Quay lại Trang chủ
            </Button>
          }
        />
      </div>
    );
  }

  const formatCurrency = (val: number | string) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(Number(val || 0));
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const [y, m, d] = cleanDate.split('-');
    return d && m && y ? `${d}/${m}/${y}` : dateStr;
  };

  const getSourceTag = (source: ExpenseSourceType) => {
    switch (source) {
      case 'PAYROLL':
        return (
          <Tag color="green" icon={<BankOutlined />}>
            Bảng lương (Payroll)
          </Tag>
        );
      case 'DIRECT_PURCHASE':
        return (
          <Tag color="blue" icon={<ShoppingOutlined />}>
            Mua sắm trực tiếp
          </Tag>
        );
      case 'ADS':
        return <Tag color="orange">Quảng cáo (Ads)</Tag>;
      case 'INFRASTRUCTURE':
        return <Tag color="purple">Hạ tầng máy chủ</Tag>;
      default:
        return <Tag>{source}</Tag>;
    }
  };

  const getSourceLabel = (source: ExpenseSourceType) => {
    switch (source) {
      case 'PAYROLL':
        return 'Bảng lương';
      case 'DIRECT_PURCHASE':
        return 'Mua sắm trực tiếp';
      case 'ADS':
        return 'Chi phí quảng cáo';
      case 'INFRASTRUCTURE':
        return 'Hạ tầng hệ thống';
      default:
        return source;
    }
  };

  if (loading) {
    return (
      <div className="vmax-detail-page">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <Spin size="large" />
        </div>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="vmax-detail-page">
        <div style={{ marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/expenses')}>
            Quay lại danh sách
          </Button>
        </div>
        <Alert
          type="error"
          showIcon
          message="Lỗi tải dữ liệu"
          description={error || 'Khoản chi không tồn tại hoặc đã bị xóa'}
        />
      </div>
    );
  }

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={`Khoản chi #${expense.id}`}
        code={expense.category_code}
        icon={<DollarOutlined />}
        status={getSourceTag(expense.source_type)}
        onBack={() => navigate('/expenses')}
        backLabel="Danh sách chi phí"
        metaTags={
          <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
            <span>Danh mục: <Text strong>{expense.category_name}</Text></span>
            <span>Ngày chi: <Text strong>{formatDate(expense.expense_date)}</Text></span>
            <span>
              Thời gian lập: <Text strong>{expense.created_at ? new Date(expense.created_at).toLocaleDateString('vi-VN') : '—'}</Text>
            </span>
          </Space>
        }
        actions={
          expense.source_type === 'PAYROLL' && expense.source_payroll_period_id ? (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => navigate(`/payroll/${expense.source_payroll_period_id}`)}
              style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
            >
              Mở kỳ lương #{expense.source_payroll_period_id}
            </Button>
          ) : undefined
        }
      />

      {/* Summary Grid */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="Số tiền chi thực tế"
          value={formatCurrency(expense.amount)}
          subtitle={`Danh mục: ${expense.category_name}`}
          icon={<DollarOutlined />}
          valueColor="#D82C0D"
        />
        <DetailSummaryCard
          title="Nguồn phát sinh"
          value={getSourceLabel(expense.source_type)}
          subtitle={expense.category_code}
          icon={<BankOutlined />}
        />
        <DetailSummaryCard
          title="Ngày hạch toán chi"
          value={formatDate(expense.expense_date)}
          subtitle="Ngày chứng từ ghi nhận"
          icon={<CalendarOutlined />}
        />
        <DetailSummaryCard
          title="Trạng thái phê duyệt"
          value={expense.approved_by_employee_id ? 'Đã phê duyệt' : 'Chưa duyệt'}
          subtitle={
            expense.approved_by_employee_id
              ? `Duyệt bởi NV #${expense.approved_by_employee_id}`
              : 'Đang chờ hạch toán'
          }
          icon={expense.approved_by_employee_id ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          valueColor={expense.approved_by_employee_id ? '#0C6B37' : '#E67E22'}
        />
      </DetailSummaryGrid>

      {/* 2-Column Responsive Layout */}
      <div className="vmax-detail-grid">
        {/* Main Column */}
        <div className="vmax-detail-main">
          <DetailInfoCard
            title="Chi tiết khoản chi"
            columns={2}
            items={[
              { label: 'Mã khoản chi', value: <Text strong>#{expense.id}</Text> },
              {
                label: 'Số tiền chi',
                value: (
                  <Text strong style={{ color: '#D82C0D', fontSize: 16 }}>
                    {formatCurrency(expense.amount)}
                  </Text>
                ),
              },
              {
                label: 'Danh mục chi phí',
                value: (
                  <Space>
                    <Text strong>{expense.category_name}</Text>
                    <Tag>{expense.category_code}</Tag>
                  </Space>
                ),
              },
              { label: 'Nguồn phát sinh', value: getSourceTag(expense.source_type) },
              {
                label: 'Ngày chi thực tế',
                value: (
                  <Space>
                    <CalendarOutlined style={{ color: 'var(--vmax-green)' }} />
                    <Text>{formatDate(expense.expense_date)}</Text>
                  </Space>
                ),
              },
              {
                label: 'Ngày tạo chứng từ',
                value: expense.created_at ? new Date(expense.created_at).toLocaleString('vi-VN') : '—',
              },
              {
                label: 'Mô tả / Diễn giải',
                value: expense.note ? (
                  <Text>{expense.note}</Text>
                ) : (
                  <Text italic style={{ color: 'var(--vmax-text-muted)' }}>
                    Không có ghi chú
                  </Text>
                ),
                span: 2,
              },
            ]}
          />

          {/* Reference Card if from Payroll */}
          {expense.source_type === 'PAYROLL' && expense.source_payroll_period_id && (
            <DetailInfoCard
              title="Chứng từ tham chiếu: Bảng lương nhân viên"
              columns={1}
              items={[
                {
                  label: 'Nguồn gốc chứng từ',
                  value: (
                    <div>
                      <p style={{ color: 'var(--vmax-text-muted)', marginBottom: 12 }}>
                        Khoản chi phí này được trích xuất tự động và hạch toán trực tiếp từ Bảng lương đã duyệt và chốt khóa của doanh nghiệp.
                      </p>
                      <Button
                        type="primary"
                        icon={<LinkOutlined />}
                        onClick={() => navigate(`/payroll/${expense.source_payroll_period_id}`)}
                        style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
                      >
                        Mở chi tiết kỳ lương #{expense.source_payroll_period_id}
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        {/* Side Column */}
        <div className="vmax-detail-side">
          <DetailInfoCard
            title="Nhân sự thực hiện & Phê duyệt"
            columns={1}
            items={[
              {
                label: 'Nhân sự lập phiếu',
                value: (
                  <Space>
                    <UserOutlined style={{ color: 'var(--vmax-text-muted)' }} />
                    <Text strong>Nhân viên #{expense.created_by_employee_id}</Text>
                  </Space>
                ),
              },
              {
                label: 'Nhân sự phê duyệt',
                value: expense.approved_by_employee_id ? (
                  <Space>
                    <CheckCircleOutlined style={{ color: '#0C6B37' }} />
                    <Text strong>Nhân viên #{expense.approved_by_employee_id}</Text>
                  </Space>
                ) : (
                  <Text italic style={{ color: 'var(--vmax-text-muted)' }}>
                    Chưa ghi nhận người duyệt
                  </Text>
                ),
              },
              {
                label: 'Thời gian lập phiếu',
                value: expense.created_at ? new Date(expense.created_at).toLocaleString('vi-VN') : '—',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
};
