import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Typography,
  Space,
  Button,
  Alert,
  Progress,
  Table,
  App,
} from 'antd';
import {
  DollarCircleOutlined,
  BankOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  ArrowRightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getFinanceOverviewApi, FinanceOverviewData } from '../../api/finance';

const { Title, Text, Paragraph } = Typography;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}

export const FinancialOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [period, setPeriod] = useState<string>('2026-09');
  const [loading, setLoading] = useState<boolean>(false);
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getFinanceOverviewApi(period);
      setOverview(res);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải tổng quan tài chính');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period]);

  return (
    <div className="vmax-page-wrapper">
      <div className="vmax-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Tổng Quan Quản Trị Tài Chính (Financial Overview)
          </Title>
          <Text type="secondary">
            Báo cáo đối soát thực thu, công nợ phải thu, phân tích hạn mức chi phí và hiện trạng ngân quỹ
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Làm mới
          </Button>
        </Space>
      </div>

      {/* SCHEMA GAP ALERT */}
      <Alert
        message="Báo Cáo Khoảng Trống CSDL: Quản Lý Số Dư Quỹ & Sổ Cái Tiền Mặt"
        description={
          <div>
            <Paragraph style={{ margin: 0, fontSize: 13 }}>
              Hệ thống hiện tại <strong>chưa có cấu hình số dư ban đầu (Opening Balance)</strong> và bảng <strong>Sổ cái dòng tiền (Cash Ledger)</strong>. Theo nguyên tắc kế toán an toàn, số dư quỹ được xác định ở trạng thái <code>UNKNOWN</code>, tuyệt đối không gán 0 để tránh phản ánh sai lệch năng lực tài chính thực tế của doanh nghiệp.
            </Paragraph>
          </div>
        }
        type="warning"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 20 }}
      />

      {/* 6 SAFE KPI CARDS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* 1. CASH BALANCE (UNKNOWN) */}
        <Col xs={24} sm={12} md={8}>
          <Card className="vmax-card" style={{ borderLeft: '4px solid #64748b' }}>
            <Statistic
              title="Số dư quỹ hiện tại (Current Cash Balance)"
              value="UNKNOWN"
              valueStyle={{ color: '#475569', fontWeight: 800 }}
              prefix={<BankOutlined />}
              suffix={<Tag color="default">SCHEMA GAP</Tag>}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Chưa cấu hình số dư đầu kỳ (Opening Balance)
            </Text>
          </Card>
        </Col>

        {/* 2. CONFIRMED CASH IN */}
        <Col xs={24} sm={12} md={8}>
          <Card
            className="vmax-card vmax-dashboard-clickable-card"
            style={{ borderLeft: '4px solid #0C6B37', cursor: 'pointer' }}
            onClick={() => navigate('/payments?status=CONFIRMED')}
          >
            <Statistic
              title="Tiền đã thực thu trong kỳ (Confirmed Cash In)"
              value={overview?.confirmedCashIn.periodAmount || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#0C6B37', fontWeight: 800 }}
              prefix={<DollarCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Lũy kế toàn bộ thời gian: {formatCurrency(overview?.confirmedCashIn.totalAmount || 0)}
            </Text>
          </Card>
        </Col>

        {/* 3. RECEIVABLES */}
        <Col xs={24} sm={12} md={8}>
          <Card
            className="vmax-card vmax-dashboard-clickable-card"
            style={{ borderLeft: '4px solid #2563eb', cursor: 'pointer' }}
            onClick={() => navigate('/finance/receivables')}
          >
            <Statistic
              title="Công nợ phải thu (Receivables - AR)"
              value={overview?.receivables.total || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#2563eb', fontWeight: 800 }}
              prefix={<CheckCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Nợ quá hạn: {formatCurrency(overview?.receivables.overdue || 0)} ({overview?.receivables.overdueCount || 0} đợt)
            </Text>
          </Card>
        </Col>

        {/* 4. APPROVED EXPENSES */}
        <Col xs={24} sm={12} md={8}>
          <Card
            className="vmax-card vmax-dashboard-clickable-card"
            style={{ borderLeft: '4px solid #16a34a', cursor: 'pointer' }}
            onClick={() => navigate('/finance/expenses?status=APPROVED')}
          >
            <Statistic
              title={`Chi phí đã duyệt (${overview?.expenses.approvedCount || 0} khoản)`}
              value={overview?.expenses.approvedInPeriod || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#16a34a', fontWeight: 800 }}
              prefix={<SafetyCertificateOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Hạn mức quản lý đã phê duyệt
            </Text>
          </Card>
        </Col>

        {/* 5. PENDING EXPENSES */}
        <Col xs={24} sm={12} md={8}>
          <Card
            className="vmax-card vmax-dashboard-clickable-card"
            style={{ borderLeft: '4px solid #d97706', cursor: 'pointer' }}
            onClick={() => navigate('/expenses')}
          >
            <Statistic
              title={`Chi phí chờ duyệt (${overview?.expenses.pendingCount || 0} khoản)`}
              value={overview?.expenses.pendingInPeriod || 0}
              formatter={(val) => formatCurrency(Number(val))}
              valueStyle={{ color: '#d97706', fontWeight: 800 }}
              prefix={<ClockCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Nghĩa vụ đang chờ Boss phê duyệt
            </Text>
          </Card>
        </Col>

        {/* 6. NET CASH FLOW (NOT AVAILABLE) */}
        <Col xs={24} sm={12} md={8}>
          <Card className="vmax-card" style={{ borderLeft: '4px solid #94a3b8' }}>
            <Statistic
              title="Dòng tiền ròng thực tế (Net Cash Flow)"
              value="N/A"
              valueStyle={{ color: '#64748b', fontWeight: 800 }}
              suffix={<Tag color="default">Chưa khả dụng</Tag>}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Chưa đủ dữ liệu thực chi xuất quỹ
            </Text>
          </Card>
        </Col>
      </Row>

      {/* DRILLDOWN SHORTCUTS & ACTION BLOCKS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card
            className="vmax-card"
            title="Tuổi Nợ Công Nợ Phải Thu (Aging Breakdown)"
            extra={
              <Button type="link" onClick={() => navigate('/finance/receivables')}>
                Xem chi tiết <ArrowRightOutlined />
              </Button>
            }
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text>Chưa đến hạn (&gt; 7 ngày):</Text>
                <Text strong style={{ color: '#16a34a' }}>
                  {formatCurrency(overview?.receivables.notDue || 0)}
                </Text>
              </div>
              <Progress
                percent={
                  overview?.receivables.total
                    ? Math.round(((overview?.receivables.notDue || 0) / overview.receivables.total) * 100)
                    : 0
                }
                strokeColor="#16a34a"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text>Đến hạn trong 7 ngày tới:</Text>
                <Text strong style={{ color: '#d97706' }}>
                  {formatCurrency(overview?.receivables.nearDue7Days || 0)}
                </Text>
              </div>
              <Progress
                percent={
                  overview?.receivables.total
                    ? Math.round(((overview?.receivables.nearDue7Days || 0) / overview.receivables.total) * 100)
                    : 0
                }
                strokeColor="#d97706"
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text>Quá hạn cần thu hồi:</Text>
                <Text strong style={{ color: '#dc2626' }}>
                  {formatCurrency(overview?.receivables.overdue || 0)}
                </Text>
              </div>
              <Progress
                percent={
                  overview?.receivables.total
                    ? Math.round(((overview?.receivables.overdue || 0) / overview.receivables.total) * 100)
                    : 0
                }
                strokeColor="#dc2626"
              />
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card
            className="vmax-card"
            title="Cơ Cấu Chi Phí Theo Danh Mục"
            extra={
              <Button type="link" onClick={() => navigate('/finance/expenses')}>
                Xem chi tiết <ArrowRightOutlined />
              </Button>
            }
          >
            {(overview?.expenses.categoryBreakdown || []).map((c) => (
              <div key={c.categoryId} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text>{c.categoryName}:</Text>
                  <Text strong style={{ color: '#7c3aed' }}>
                    {formatCurrency(c.amount)} ({c.percent}%)
                  </Text>
                </div>
                <Progress percent={c.percent} strokeColor="#7c3aed" />
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      {/* TOP DEBTORS */}
      <Card
        className="vmax-card"
        title="Top Khách Hàng Nợ Lớn Nhất"
        extra={
          <Button type="link" onClick={() => navigate('/finance/receivables')}>
            Tất cả công nợ <ArrowRightOutlined />
          </Button>
        }
      >
        <Table
          rowKey="accountId"
          pagination={false}
          dataSource={overview?.receivables.topDebtors || []}
          columns={[
            {
              title: 'Khách hàng',
              dataIndex: 'companyName',
              key: 'companyName',
              render: (name: string) => <Text strong>{name}</Text>,
            },
            {
              title: 'Số đơn hàng',
              dataIndex: 'ordersCount',
              key: 'ordersCount',
              align: 'center' as const,
              render: (count: number) => <Tag color="blue">{count} đơn hàng</Tag>,
            },
            {
              title: 'Nợ quá hạn',
              dataIndex: 'overdueDebt',
              key: 'overdueDebt',
              align: 'right' as const,
              render: (val: number) => (
                <Text style={{ color: val > 0 ? '#dc2626' : '#64748b' }}>
                  {formatCurrency(val)}
                </Text>
              ),
            },
            {
              title: 'Tổng nợ còn lại',
              dataIndex: 'totalDebt',
              key: 'totalDebt',
              align: 'right' as const,
              render: (val: number) => (
                <Text strong style={{ color: '#2563eb' }}>
                  {formatCurrency(val)}
                </Text>
              ),
            },
            {
              title: 'Thao tác',
              key: 'action',
              align: 'center' as const,
              render: (_: any, r: any) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => navigate(`/finance/receivables?search=${encodeURIComponent(r.companyName)}`)}
                >
                  Xem đợt nợ
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
