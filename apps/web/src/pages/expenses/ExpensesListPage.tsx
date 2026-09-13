import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  Empty,
  Typography,
  Result,
} from 'antd';
import {
  PlusOutlined,
  DollarOutlined,
  ReloadOutlined,
  FileTextOutlined,
  BankOutlined,
  ShoppingOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  getExpenses,
  getExpenseCategories,
  ExpenseItem,
  ExpenseCategory,
  ExpenseSourceType,
} from '../../api/expenses';
import { CreateExpenseModal } from '../../components/expenses/CreateExpenseModal';
import { PayrollExpenseModal } from '../../components/expenses/PayrollExpenseModal';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

export const ExpensesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 });

  // Filters
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('ALL');
  const [categoryIdFilter, setCategoryIdFilter] = useState<string>('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [payrollModalOpen, setPayrollModalOpen] = useState(false);

  const canRead =
    user?.permissions?.includes('EXPENSE_READ') || user?.roles?.includes('ADMIN');

  const canCreate =
    user?.permissions?.includes('EXPENSE_CREATE') || user?.roles?.includes('ADMIN');

  const loadCategories = async () => {
    try {
      const data = await getExpenseCategories();
      setCategories(data);
    } catch {
      // Handled silently
    }
  };

  const loadExpenses = async (page = 1, limit = 10) => {
    setLoading(true);
    try {
      const res = await getExpenses({
        page,
        limit,
        sourceType: sourceTypeFilter,
        categoryId: categoryIdFilter,
      });
      setExpenses(res.data);
      setMeta(res.meta);
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      loadCategories();
    }
  }, [canRead]);

  useEffect(() => {
    if (canRead) {
      loadExpenses(1, meta.limit);
    }
  }, [canRead, sourceTypeFilter, categoryIdFilter]);

  if (!canRead) {
    return (
      <div className="vmax-page-wrapper" style={{ padding: '40px 24px' }}>
        <Result
          status="403"
          title="403 - Không có quyền truy cập"
          subTitle="Tài khoản của bạn không có quyền EXPENSE_READ để truy cập phân hệ Quản lý chi phí."
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

  const handleResetFilters = () => {
    setSourceTypeFilter('ALL');
    setCategoryIdFilter('ALL');
  };

  // Safe client-side metrics calculation for current view
  const currentPageTotalAmount = useMemo(() => {
    return expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  }, [expenses]);

  const payrollCount = useMemo(() => {
    return expenses.filter((e) => e.source_type === 'PAYROLL').length;
  }, [expenses]);

  const manualCount = useMemo(() => {
    return expenses.filter((e) => e.source_type !== 'PAYROLL').length;
  }, [expenses]);

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
        return <Tag color="green" icon={<BankOutlined />}>Bảng lương</Tag>;
      case 'DIRECT_PURCHASE':
        return <Tag color="blue" icon={<ShoppingOutlined />}>Mua sắm trực tiếp</Tag>;
      case 'ADS':
        return <Tag color="orange">Quảng cáo (Ads)</Tag>;
      case 'INFRASTRUCTURE':
        return <Tag color="purple">Hạ tầng & Tool</Tag>;
      default:
        return <Tag>{source}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Mã khoản chi',
      dataIndex: 'id',
      key: 'id',
      width: 110,
      render: (id: string) => <Text strong>#{id}</Text>,
    },
    {
      title: 'Ngày chi',
      dataIndex: 'expense_date',
      key: 'expense_date',
      width: 120,
      render: (dateStr: string) => formatDate(dateStr),
    },
    {
      title: 'Danh mục chi phí',
      dataIndex: 'category_name',
      key: 'category_name',
      width: 220,
      render: (catName: string, record: ExpenseItem) => (
        <div>
          <Text strong>{catName || 'Khác'}</Text>
          <div style={{ fontSize: 12, color: 'var(--vmax-text-muted)' }}>
            Mã: {record.category_code}
          </div>
        </div>
      ),
    },
    {
      title: 'Nguồn phát sinh',
      dataIndex: 'source_type',
      key: 'source_type',
      width: 170,
      render: (source: ExpenseSourceType) => getSourceTag(source),
    },
    {
      title: 'Số tiền chi',
      dataIndex: 'amount',
      key: 'amount',
      width: 160,
      align: 'right' as const,
      render: (amt: number | string) => (
        <Text strong style={{ color: 'var(--vmax-red-orange)', fontSize: 15 }}>
          {formatCurrency(amt)}
        </Text>
      ),
    },
    {
      title: 'Mô tả / Diễn giải',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
      render: (note: string | null, record: ExpenseItem) => {
        if (!note && record.source_type === 'PAYROLL') {
          return <Text italic style={{ color: 'var(--vmax-text-muted)' }}>Hạch toán chi phí lương tự động</Text>;
        }
        return note || '—';
      },
    },
    {
      title: 'Người tạo',
      dataIndex: 'created_by_employee_id',
      key: 'created_by_employee_id',
      width: 120,
      render: (empId: string) => <Tag>NV #{empId}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: any, record: ExpenseItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/expenses/${record.id}`)}
          style={{ padding: 0 }}
        >
          Xem chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      {/* Header */}
      <div className="vmax-page-header">
        <div>
          <h1 className="vmax-page-title">
            <span style={{ color: 'var(--vmax-green)', marginRight: 8 }}>❖</span>
            Quản lý chi phí
          </h1>
          <span className="vmax-page-subtitle">
            Theo dõi chi phí vận hành, chi phí thủ công và chi phí phát sinh từ bảng lương
          </span>
        </div>
        {canCreate && (
          <Space wrap>
            <Button
              icon={<BankOutlined />}
              onClick={() => setPayrollModalOpen(true)}
              style={{
                borderColor: 'var(--vmax-green)',
                color: 'var(--vmax-green)',
                fontWeight: 600,
              }}
            >
              Hạch toán chi phí lương
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
              className="btn-primary"
            >
              Tạo khoản chi
            </Button>
          </Space>
        )}
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card" style={{ height: '100%' }}>
            <Statistic
              title={<span style={{ color: 'var(--vmax-text-muted)' }}>Tổng số khoản chi</span>}
              value={meta.total}
              prefix={<FileTextOutlined style={{ color: 'var(--vmax-green)' }} />}
              valueStyle={{ fontWeight: 700, color: 'var(--vmax-text)' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card" style={{ height: '100%' }}>
            <Statistic
              title={<span style={{ color: 'var(--vmax-text-muted)' }}>Tổng chi trang hiện tại</span>}
              value={currentPageTotalAmount}
              formatter={(val) => formatCurrency(Number(val))}
              prefix={<DollarOutlined style={{ color: 'var(--vmax-red-orange)' }} />}
              valueStyle={{ fontWeight: 700, color: 'var(--vmax-red-orange)', fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card" style={{ height: '100%' }}>
            <Statistic
              title={<span style={{ color: 'var(--vmax-text-muted)' }}>Chi phí từ Bảng lương (trang này)</span>}
              value={payrollCount}
              prefix={<BankOutlined style={{ color: 'var(--vmax-green)' }} />}
              valueStyle={{ fontWeight: 700, color: 'var(--vmax-green)' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card" style={{ height: '100%' }}>
            <Statistic
              title={<span style={{ color: 'var(--vmax-text-muted)' }}>Chi phí Thủ công & Khác (trang này)</span>}
              value={manualCount}
              prefix={<ShoppingOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontWeight: 700, color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filter Bar */}
      <Card className="vmax-card" style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: 4 }}>
              <Text strong style={{ fontSize: 13 }}>
                Nguồn phát sinh:
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              value={sourceTypeFilter}
              onChange={setSourceTypeFilter}
              options={[
                { label: 'Tất cả nguồn chi', value: 'ALL' },
                { label: 'Bảng lương (Payroll)', value: 'PAYROLL' },
                { label: 'Mua sắm trực tiếp (Direct Purchase)', value: 'DIRECT_PURCHASE' },
                { label: 'Chi phí quảng cáo (Ads)', value: 'ADS' },
                { label: 'Hạ tầng máy chủ (Infrastructure)', value: 'INFRASTRUCTURE' },
              ]}
            />
          </Col>

          <Col xs={24} sm={12} md={10}>
            <div style={{ marginBottom: 4 }}>
              <Text strong style={{ fontSize: 13 }}>
                Danh mục chi phí:
              </Text>
            </div>
            <Select
              style={{ width: '100%' }}
              value={categoryIdFilter}
              onChange={setCategoryIdFilter}
              showSearch
              optionFilterProp="label"
              options={[
                { label: 'Tất cả danh mục', value: 'ALL' },
                ...categories.map((c) => ({
                  label: `${c.name} (${c.code})`,
                  value: c.id,
                })),
              ]}
            />
          </Col>

          <Col xs={24} sm={24} md={6} style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
            <Space style={{ marginTop: 22 }}>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleResetFilters}
              >
                Đặt lại
              </Button>
              <Button
                type="primary"
                onClick={() => loadExpenses(1, meta.limit)}
              >
                Lọc dữ liệu
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Table List */}
      <Card className="vmax-card" style={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={expenses}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          onRow={createRowNavigateHandler(navigate, (record) => `/expenses/${record.id}`)}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có khoản chi nào phù hợp với bộ lọc."
              />
            ),
          }}
          pagination={{
            current: meta.page,
            pageSize: meta.limit,
            total: meta.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `${range[0]}-${range[1]} trong tổng số ${total} khoản chi`,
            onChange: (page, pageSize) => loadExpenses(page, pageSize),
          }}
        />
      </Card>

      {/* Modals */}
      {createModalOpen && (
        <CreateExpenseModal
          open={createModalOpen}
          categories={categories}
          onCancel={() => setCreateModalOpen(false)}
          onSuccess={() => {
            setCreateModalOpen(false);
            loadExpenses(1, meta.limit);
          }}
        />
      )}

      {payrollModalOpen && (
        <PayrollExpenseModal
          open={payrollModalOpen}
          onCancel={() => setPayrollModalOpen(false)}
          onSuccess={() => {
            setPayrollModalOpen(false);
            loadExpenses(1, meta.limit);
          }}
        />
      )}
    </div>
  );
};
