import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Typography,
  Space,
  Select,
  Row,
  Col,
  Statistic,
  Button,
  Alert,
  App,
} from 'antd';
import {
  ReloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  InfoCircleOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCashflowApi, getFinanceOverviewApi, CashflowItem, FinanceOverviewData } from '../../api/finance';

const { Title, Text } = Typography;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}

export const CashflowPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = App.useApp();

  const initialType = (searchParams.get('type') as any) || 'ALL';
  const [type, setType] = useState<'IN' | 'OUT' | 'ALL'>(initialType);
  const [period, setPeriod] = useState<string>('2026-09');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(25);

  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<CashflowItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [flowRes, ovRes] = await Promise.all([
        getCashflowApi({
          type,
          period: period || undefined,
          page,
          limit,
        }),
        getFinanceOverviewApi(period),
      ]);
      setItems(flowRes.data);
      setTotal(flowRes.meta.total);
      setOverview(ovRes);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải sổ cái dòng tiền');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [type, period, page]);

  const handleTypeChange = (val: 'IN' | 'OUT' | 'ALL') => {
    setType(val);
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    if (val === 'ALL') {
      newParams.delete('type');
    } else {
      newParams.set('type', val);
    }
    setSearchParams(newParams);
  };

  const columns = [
    {
      title: 'Chiều tiền',
      dataIndex: 'direction',
      key: 'direction',
      width: 120,
      render: (dir: 'IN' | 'OUT') =>
        dir === 'IN' ? (
          <Tag color="success" icon={<ArrowUpOutlined />} style={{ fontWeight: 600 }}>
            TIỀN VÀO
          </Tag>
        ) : (
          <Tag color="purple" icon={<ArrowDownOutlined />} style={{ fontWeight: 600 }}>
            CHI PHÍ
          </Tag>
        ),
    },
    {
      title: 'Thời gian',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 170,
      render: (val: string) => (val ? new Date(val).toLocaleString('vi-VN') : '—'),
    },
    {
      title: 'Nguồn nghiệp vụ',
      dataIndex: 'sourceType',
      key: 'sourceType',
      render: (src: string) => {
        if (src === 'CUSTOMER_PAYMENT') return <Tag color="blue">Thu tiền khách hàng</Tag>;
        if (src === 'PAYROLL') return <Tag color="volcano">Chi lương nhân sự</Tag>;
        if (src === 'DIRECT_PURCHASE') return <Tag color="orange">Mua sắm trực tiếp</Tag>;
        if (src === 'INFRASTRUCTURE') return <Tag color="cyan">Hạ tầng & Dịch vụ</Tag>;
        return <Tag>{src}</Tag>;
      },
    },
    {
      title: 'Mã chứng từ',
      key: 'reference',
      render: (_: any, r: CashflowItem) => (
        <a
          onClick={() => navigate(r.linkUrl)}
          style={{ fontWeight: 600, color: '#0C6B37' }}
        >
          {r.referenceCode}
        </a>
      ),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (val: number, r: CashflowItem) => (
        <Text
          strong
          style={{
            fontSize: 14,
            color: r.direction === 'IN' ? '#0C6B37' : '#7c3aed',
          }}
        >
          {r.direction === 'IN' ? '+' : '-'} {formatCurrency(val)}
        </Text>
      ),
    },
    {
      title: 'Người phụ trách / Duyệt',
      dataIndex: 'actorName',
      key: 'actorName',
      render: (name: string | null) => name || <Text type="secondary">—</Text>,
    },
    {
      title: 'Ghi chú & Minh chứng',
      key: 'note',
      render: (_: any, r: CashflowItem) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.note || <Text type="secondary">—</Text>}</div>
          {r.evidenceUrl && (
            <a
              href={r.evidenceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <FileTextOutlined /> Xem ảnh chứng từ
            </a>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái kế toán',
      dataIndex: 'accountingStatus',
      key: 'accountingStatus',
      render: (st: string) => {
        if (st === 'CONFIRMED_IN') return <Tag color="success">Đã vào quỹ</Tag>;
        if (st === 'APPROVED_EXPENSE') return <Tag color="purple">Đã duyệt chi</Tag>;
        return <Tag color="warning">Chờ duyệt</Tag>;
      },
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <div className="vmax-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Sổ Cái Dòng Tiền (Cashflow Journal)
          </Title>
          <Text type="secondary">
            Nhật ký kiểm soát các khoản Tiền thực thu (Confirmed Payments) và Nghĩa vụ chi phí đã phê duyệt (Approved Expenses)
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
        </Space>
      </div>

      <Alert
        message="Thông Báo Giới Hạn Nghiệp Vụ Sổ Quỹ (Schema Gap Notice)"
        description="Bảng chi phí hiện tại chỉ ghi nhận trạng thái phê duyệt hạn mức (Approved Expenses). Khi chưa có trường xác nhận thực chi xuất quỹ (Paid Expenses) và số dư ban đầu (Opening Balance), hệ thống không tự suy diễn số dư quỹ hay dòng tiền ròng mà hiển thị đối chiếu riêng biệt giữa Tiền thực thu và Chi phí đã duyệt."
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 20 }}
      />

      {/* SUMMARY STATS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title="Tiền đã thực thu (Kỳ này)"
              value={overview?.confirmedCashIn.periodAmount || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#0C6B37', fontWeight: 700 }}
              prefix={<ArrowUpOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Lũy kế toàn bộ: {formatCurrency(overview?.confirmedCashIn.totalAmount || 0)}
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title={`Chi phí đã duyệt (${overview?.expenses.approvedCount || 0} khoản)`}
              value={overview?.expenses.approvedInPeriod || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#7c3aed', fontWeight: 700 }}
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
              Đề xuất chi phí đang chờ duyệt
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="vmax-card">
            <Statistic
              title="Dòng tiền ròng thực tế"
              value="N/A"
              valueStyle={{ color: '#64748b', fontWeight: 700 }}
              suffix={<Tag color="default">Chưa đủ dữ liệu thực chi</Tag>}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cần ghi nhận xuất quỹ thực tế
            </Text>
          </Card>
        </Col>
      </Row>

      {/* FILTER BUTTONS */}
      <Card className="vmax-card" style={{ marginBottom: 20 }}>
        <Space size="middle">
          <Text strong>Lọc dòng tiền:</Text>
          <Button
            type={type === 'ALL' ? 'primary' : 'default'}
            onClick={() => handleTypeChange('ALL')}
          >
            Tất cả giao dịch
          </Button>
          <Button
            type={type === 'IN' ? 'primary' : 'default'}
            icon={<ArrowUpOutlined />}
            style={type === 'IN' ? { backgroundColor: '#0C6B37' } : undefined}
            onClick={() => handleTypeChange('IN')}
          >
            Tiền vào (Thu tiền)
          </Button>
          <Button
            type={type === 'OUT' ? 'primary' : 'default'}
            icon={<ArrowDownOutlined />}
            style={type === 'OUT' ? { backgroundColor: '#7c3aed' } : undefined}
            onClick={() => handleTypeChange('OUT')}
          >
            Khoản chi (Nghĩa vụ)
          </Button>
        </Space>
      </Card>

      {/* CASHFLOW TABLE */}
      <Card className="vmax-card">
        <Table
          rowKey={(r) => `${r.direction}-${r.id}`}
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showTotal: (tot) => `Tổng cộng ${tot} bản ghi dòng tiền`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>
    </div>
  );
};
