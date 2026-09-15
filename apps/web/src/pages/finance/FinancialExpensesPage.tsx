import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Typography,
  Space,
  Row,
  Col,
  Statistic,
  Button,
  Select,
  Progress,
  App,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarCircleOutlined,
  PieChartOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getFinanceOverviewApi, FinanceOverviewData } from '../../api/finance';
import { getExpenses, ExpenseItem } from '../../api/expenses';

const { Title, Text } = Typography;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}

export const FinancialExpensesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = App.useApp();

  const initialStatus = searchParams.get('status') || 'ALL';
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [period, setPeriod] = useState<string>('2026-09');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(20);

  const [loading, setLoading] = useState<boolean>(false);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [expRes, ovRes] = await Promise.all([
        getExpenses({
          page,
          limit,
        }),
        getFinanceOverviewApi(period),
      ]);
      setExpenses(expRes.data);
      setTotal(expRes.meta.total);
      setOverview(ovRes);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải phân tích chi phí');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, page]);

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    const newParams = new URLSearchParams(searchParams);
    if (val === 'ALL') {
      newParams.delete('status');
    } else {
      newParams.set('status', val);
    }
    setSearchParams(newParams);
  };

  const filteredExpenses = expenses.filter((e) => {
    if (statusFilter === 'APPROVED') return e.approved_by_employee_id !== null;
    if (statusFilter === 'PENDING') return e.approved_by_employee_id === null;
    return true;
  });

  const columns = [
    {
      title: 'Mã & Danh mục',
      key: 'category',
      render: (_: any, r: ExpenseItem) => (
        <div>
          <a
            onClick={() => navigate(`/expenses/${r.id}`)}
            style={{ fontWeight: 600, color: '#0C6B37' }}
          >
            EXP-{r.id}
          </a>
          <div style={{ fontSize: 13, color: '#1e293b' }}>{r.category_name}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Mã: {r.category_code}</div>
        </div>
      ),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (val: number) => (
        <Text strong style={{ fontSize: 14, color: '#7c3aed' }}>
          {formatCurrency(Number(val))}
        </Text>
      ),
    },
    {
      title: 'Ngày phát sinh',
      dataIndex: 'expense_date',
      key: 'expense_date',
      render: (val: string) => (val ? new Date(val).toLocaleDateString('vi-VN') : '—'),
    },
    {
      title: 'Loại nguồn',
      dataIndex: 'source_type',
      key: 'source_type',
      render: (st: string) => {
        if (st === 'PAYROLL') return <Tag color="volcano">Bảng lương (Payroll)</Tag>;
        if (st === 'DIRECT_PURCHASE') return <Tag color="orange">Mua trực tiếp</Tag>;
        if (st === 'INFRASTRUCTURE') return <Tag color="cyan">Hạ tầng</Tag>;
        return <Tag>{st}</Tag>;
      },
    },
    {
      title: 'Trạng thái phê duyệt',
      key: 'approval',
      render: (_: any, r: ExpenseItem) =>
        r.approved_by_employee_id ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Đã phê duyệt
          </Tag>
        ) : (
          <Tag color="warning" icon={<ClockCircleOutlined />}>
            Chờ phê duyệt
          </Tag>
        ),
    },
    {
      title: 'Nội dung / Ghi chú',
      dataIndex: 'note',
      key: 'note',
      render: (note: string | null) => note || <Text type="secondary">—</Text>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      align: 'center' as const,
      render: (_: any, r: ExpenseItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/expenses/${r.id}`)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <div className="vmax-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản Lý & Phân Tích Chi Phí (Financial Expenses)
          </Title>
          <Text type="secondary">
            Kiểm soát nghĩa vụ chi phí theo danh mục, trạng thái phê duyệt hạn mức và chi tiết khoản chi
          </Text>
        </div>
        <Space>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 150 }}
            options={[
              { label: 'Tháng 09/2026', value: '2026-09' },
              { label: 'Tháng 08/2026', value: '2026-08' },
              { label: 'Tháng 07/2026', value: '2026-07' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/expenses')}
          >
            Tạo khoản chi
          </Button>
        </Space>
      </div>

      {/* SUMMARY STATS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title="Tổng chi phí phát sinh trong kỳ"
              value={overview?.expenses.totalInPeriod || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#1e293b', fontWeight: 700 }}
              prefix={<DollarCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Toàn bộ {overview?.expenses.categoryBreakdown.length || 0} nhóm danh mục
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title={`Chi phí đã duyệt (${overview?.expenses.approvedCount || 0} khoản)`}
              value={overview?.expenses.approvedInPeriod || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#16a34a', fontWeight: 700 }}
              prefix={<CheckCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Hạn mức cấp quản lý đã duyệt
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title={`Chi phí chờ duyệt (${overview?.expenses.pendingCount || 0} khoản)`}
              value={overview?.expenses.pendingInPeriod || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#d97706', fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Nghĩa vụ đang chờ Boss phê duyệt
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title="Nhóm chi lớn nhất"
              value={overview?.expenses.categoryBreakdown[0]?.categoryName || '—'}
              valueStyle={{ color: '#7c3aed', fontSize: 16, fontWeight: 700 }}
              prefix={<PieChartOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {overview?.expenses.categoryBreakdown[0]
                ? `${formatCurrency(overview.expenses.categoryBreakdown[0].amount)} (${overview.expenses.categoryBreakdown[0].percent}%)`
                : ''}
            </Text>
          </Card>
        </Col>
      </Row>

      {/* CATEGORY BREAKDOWN BARS */}
      <Card className="vmax-card" title="Phân bổ chi phí theo danh mục thực tế trong DB" style={{ marginBottom: 20 }}>
        <Row gutter={[24, 16]}>
          {(overview?.expenses.categoryBreakdown || []).map((cat) => (
            <Col xs={24} sm={12} key={cat.categoryId}>
              <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>{cat.categoryName}</Text>
                <Text strong style={{ color: '#7c3aed' }}>
                  {formatCurrency(cat.amount)} ({cat.percent}%)
                </Text>
              </div>
              <Progress
                percent={cat.percent}
                strokeColor="#7c3aed"
                showInfo={false}
              />
            </Col>
          ))}
        </Row>
      </Card>

      {/* FILTER BUTTONS & LIST */}
      <Card className="vmax-card" style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12}>
            <Space size="middle">
              <Text strong>Lọc trạng thái duyệt:</Text>
              <Select
                value={statusFilter}
                onChange={handleStatusFilterChange}
                style={{ width: 220 }}
                options={[
                  { label: 'Tất cả chi phí', value: 'ALL' },
                  { label: `Đã phê duyệt (${overview?.expenses.approvedCount || 0})`, value: 'APPROVED' },
                  { label: `Chờ phê duyệt (${overview?.expenses.pendingCount || 0})`, value: 'PENDING' },
                ]}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* TABLE */}
      <Card className="vmax-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredExpenses}
          loading={loading}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showTotal: (tot) => `Tổng cộng ${tot} khoản chi`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>
    </div>
  );
};
