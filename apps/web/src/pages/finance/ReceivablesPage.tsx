import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Typography,
  Space,
  Input,
  Select,
  Row,
  Col,
  Statistic,
  Button,
  App,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  DollarCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getReceivablesApi, getFinanceOverviewApi, ReceivableItem, FinanceOverviewData } from '../../api/finance';

const { Title, Text } = Typography;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}

export const ReceivablesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = App.useApp();

  const initialStatus = searchParams.get('status') || 'ALL';
  const [status, setStatus] = useState<string>(initialStatus);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(20);

  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<ReceivableItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recRes, ovRes] = await Promise.all([
        getReceivablesApi({
          status: status !== 'ALL' ? status : undefined,
          search: search.trim() || undefined,
          page,
          limit,
        }),
        getFinanceOverviewApi(),
      ]);
      setItems(recRes.data);
      setTotal(recRes.meta.total);
      setOverview(ovRes);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải danh sách công nợ phải thu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [status, page]);

  const handleSearch = () => {
    setPage(1);
    loadData();
  };

  const handleStatusChange = (val: string) => {
    setStatus(val);
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    if (val === 'ALL') {
      newParams.delete('status');
    } else {
      newParams.set('status', val);
    }
    setSearchParams(newParams);
  };

  const columns = [
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_: any, r: ReceivableItem) => (
        <div>
          <Text strong style={{ color: '#1e293b' }}>{r.companyName}</Text>
          {r.contactName && (
            <div style={{ fontSize: 12, color: '#64748b' }}>LH: {r.contactName}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Đơn hàng / Dịch vụ',
      key: 'order',
      render: (_: any, r: ReceivableItem) => (
        <div>
          <a
            onClick={() => navigate(`/orders/${r.orderId}`)}
            style={{ fontWeight: 600, color: '#0C6B37' }}
          >
            {r.orderCode}
          </a>
          <div style={{ fontSize: 12, color: '#64748b' }}>{r.serviceName}</div>
        </div>
      ),
    },
    {
      title: 'Đợt',
      dataIndex: 'installmentNumber',
      key: 'installmentNumber',
      align: 'center' as const,
      render: (num: number) => <Tag color="blue">Đợt {num}</Tag>,
    },
    {
      title: 'Số tiền đợt',
      dataIndex: 'grossAmountDue',
      key: 'grossAmountDue',
      align: 'right' as const,
      render: (val: number) => <Text>{formatCurrency(val)}</Text>,
    },
    {
      title: 'Đã thanh toán',
      dataIndex: 'allocatedPaid',
      key: 'allocatedPaid',
      align: 'right' as const,
      render: (val: number) => (
        <Text style={{ color: val > 0 ? '#0C6B37' : '#94a3b8' }}>
          {formatCurrency(val)}
        </Text>
      ),
    },
    {
      title: 'Còn nợ phải thu',
      dataIndex: 'remainingAmount',
      key: 'remainingAmount',
      align: 'right' as const,
      render: (val: number) => (
        <Text strong style={{ color: '#2563eb' }}>
          {formatCurrency(val)}
        </Text>
      ),
    },
    {
      title: 'Hạn thanh toán',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date: string, r: ReceivableItem) => (
        <div>
          <div>{date}</div>
          {r.overdueDays > 0 ? (
            <Tag color="error">Quá hạn {r.overdueDays} ngày</Tag>
          ) : (
            <Tag color="default">Trong hạn</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      align: 'center' as const,
      render: (st: string) => {
        if (st === 'OVERDUE') return <Tag color="error">Quá hạn</Tag>;
        if (st === 'PARTIALLY_PAID') return <Tag color="warning">Thanh toán một phần</Tag>;
        return <Tag color="processing">Chưa thanh toán</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      align: 'center' as const,
      render: (_: any, r: ReceivableItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/orders/${r.orderId}`)}
          >
            Đơn hàng
          </Button>
          <Button
            type="link"
            size="small"
            style={{ color: '#0C6B37' }}
            onClick={() => navigate(`/payments`)}
          >
            Thu tiền
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <div className="vmax-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản Lý Công Nợ Phải Thu (Accounts Receivable)
          </Title>
          <Text type="secondary">
            Theo dõi chi tiết các đợt thanh toán đến hạn, nợ quá hạn và tiến độ thanh toán của khách hàng
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Làm mới
          </Button>
        </Space>
      </div>

      {/* SUMMARY STATS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title="Tổng công nợ phải thu"
              value={overview?.receivables.total || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#2563eb', fontWeight: 700 }}
              prefix={<DollarCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title="Nợ chưa đến hạn"
              value={overview?.receivables.notDue || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#16a34a', fontWeight: 700 }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title="Đến hạn trong 7 ngày tới"
              value={overview?.receivables.nearDue7Days || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#d97706', fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title={`Nợ quá hạn (${overview?.receivables.overdueCount || 0} đợt)`}
              value={overview?.receivables.overdue || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#dc2626', fontWeight: 700 }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* FILTER CONTROLS */}
      <Card className="vmax-card" style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12}>
            <Input.Search
              placeholder="Tìm theo tên công ty khách hàng hoặc mã đơn hàng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onSearch={handleSearch}
              allowClear
              enterButton={<SearchOutlined />}
            />
          </Col>
          <Col xs={24} md={12} style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Select
              style={{ width: 220 }}
              value={status}
              onChange={handleStatusChange}
              options={[
                { label: 'Tất cả trạng thái nợ', value: 'ALL' },
                { label: `Nợ quá hạn (${overview?.receivables.overdueCount || 0})`, value: 'OVERDUE' },
                { label: 'Sắp đến hạn (7 ngày)', value: 'NEAR_DUE' },
                { label: 'Chưa đến hạn', value: 'NOT_DUE' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* RECEIVABLES TABLE */}
      <Card className="vmax-card">
        <Table
          rowKey="installmentId"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showTotal: (tot) => `Tổng cộng ${tot} đợt công nợ`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>
    </div>
  );
};
