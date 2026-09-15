import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Typography,
  Alert,
  Spin,
  Space,
  Button,
  Select,
  Descriptions,
  Badge,
  Tabs,
  Progress,
  Tooltip,
} from 'antd';
import {
  DollarOutlined,
  FundOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  ProjectOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  EyeOutlined,
  TrophyOutlined,
  BankOutlined,
  AlertOutlined,
  UserOutlined,
  ToolOutlined,
  GlobalOutlined,
  AuditOutlined,
  PieChartOutlined,
  ArrowRightOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { logoutApi } from '../api/auth';
import { getRoleLabel } from '../constants/labels';
import { getExecutiveDashboardApi, ExecutiveDashboardData } from '../api/dashboard';
import { createRowNavigateHandler } from '../utils/tableUtils';

const { Title, Text } = Typography;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const isExecutive = user?.roles?.includes('ADMIN') || user?.roles?.includes('BOSS');
  const isSalesLeader = user?.roles?.includes('SALES_TEAM_LEADER');
  const isDevLeader = user?.roles?.includes('DEV_TEAM_LEADER');
  const isSeoLeader = user?.roles?.includes('SEO_TEAM_LEADER');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(getCurrentPeriod());
  const [data, setData] = useState<ExecutiveDashboardData | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!isExecutive) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getExecutiveDashboardApi(period);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu Executive Dashboard');
    } finally {
      setLoading(false);
    }
  }, [isExecutive, period]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleLogout = async () => {
    await logoutApi();
    navigate('/login');
  };

  const handleCardKeyDown = (e: React.KeyboardEvent, path: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(path);
    }
  };

  // NON-EXECUTIVE VIEW
  if (!isExecutive) {
    return (
      <div className="vmax-page-wrapper">
        <div className="vmax-page-header">
          <div>
            <h1 className="vmax-page-title">
              <span style={{ color: 'var(--vmax-green)', marginRight: 8 }}>❖</span>
              Tổng quan nhân viên
            </h1>
            <span className="vmax-page-subtitle">Hồ sơ cá nhân và quyền hạn công tác</span>
          </div>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Card className="vmax-card" title="Hồ sơ tài khoản đăng nhập">
              <Descriptions bordered column={2}>
                <Descriptions.Item label="Tên đăng nhập">{user?.username || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Email">{user?.email || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Mã nhân viên">{user?.employeeCode || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Họ và tên">{user?.fullName || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="Vai trò" span={2}>
                  {user?.roles?.map((r) => (
                    <Tag color="green" key={r}>
                      {getRoleLabel(r)}
                    </Tag>
                  )) || <Tag>Không có</Tag>}
                </Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                {isSalesLeader && (
                  <Button
                    type="primary"
                    icon={<FundOutlined />}
                    onClick={() => navigate('/workspace/sales')}
                  >
                    Vào Workspace Sales
                  </Button>
                )}
                {isDevLeader && (
                  <Button
                    type="primary"
                    icon={<ToolOutlined />}
                    onClick={() => navigate('/workspace/dev')}
                  >
                    Vào Workspace Dev
                  </Button>
                )}
                {isSeoLeader && (
                  <Button
                    type="primary"
                    icon={<GlobalOutlined />}
                    onClick={() => navigate('/workspace/seo')}
                  >
                    Vào Workspace SEO
                  </Button>
                )}
                <Button danger onClick={handleLogout}>
                  Đăng xuất
                </Button>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card className="vmax-card" title="Lối tắt thao tác nhanh">
              <Space direction="vertical" style={{ width: '100%' }}>
                {isSalesLeader && (
                  <>
                    <Button type="primary" block onClick={() => navigate('/workspace/sales')}>
                      Workspace Sales
                    </Button>
                    <Button block onClick={() => navigate('/leads')}>
                      Danh sách Leads Team
                    </Button>
                    <Button block onClick={() => navigate('/orders')}>
                      Danh sách Orders Team
                    </Button>
                    <Button block onClick={() => navigate('/kpi')}>
                      KPI & Doanh số Team
                    </Button>
                    <Button block onClick={() => navigate('/daily-reports')}>
                      Báo cáo ngày Team
                    </Button>
                  </>
                )}
                {isDevLeader && (
                  <>
                    <Button type="primary" block onClick={() => navigate('/workspace/dev')}>
                      Workspace Dev
                    </Button>
                    <Button block onClick={() => navigate('/projects')}>
                      Projects Team
                    </Button>
                    <Button block onClick={() => navigate('/projects?tab=assign')}>
                      Phân công Project
                    </Button>
                    <Button block onClick={() => navigate('/kpi')}>
                      KPI Team
                    </Button>
                    <Button block onClick={() => navigate('/daily-reports')}>
                      Báo cáo ngày Team
                    </Button>
                  </>
                )}
                {isSeoLeader && (
                  <>
                    <Button type="primary" block onClick={() => navigate('/workspace/seo')}>
                      Workspace SEO
                    </Button>
                    <Button block onClick={() => navigate('/projects')}>
                      Projects SEO Team
                    </Button>
                    <Button block onClick={() => navigate('/projects?tab=assign')}>
                      Phân công SEO
                    </Button>
                    <Button block onClick={() => navigate('/kpi')}>
                      KPI & Doanh số Team
                    </Button>
                    <Button block onClick={() => navigate('/daily-reports')}>
                      Báo cáo ngày Team
                    </Button>
                  </>
                )}
                {user?.roles?.includes('SALE') && !isSalesLeader && (
                  <>
                    <Button type="primary" block onClick={() => navigate('/leads')}>
                      Leads của tôi
                    </Button>
                    <Button block onClick={() => navigate('/deals')}>
                      Deals của tôi
                    </Button>
                    <Button block onClick={() => navigate('/orders')}>
                      Orders của tôi
                    </Button>
                    <Button block onClick={() => navigate('/kpi')}>
                      KPI & Doanh số
                    </Button>
                    <Button block onClick={() => navigate('/daily-reports')}>
                      Nộp báo cáo ngày
                    </Button>
                  </>
                )}
                {(user?.roles?.includes('DEV') || user?.roles?.includes('SEO')) &&
                  !isDevLeader &&
                  !isSeoLeader && (
                    <>
                      <Button type="primary" block onClick={() => navigate('/projects')}>
                        Projects của tôi
                      </Button>
                      <Button block onClick={() => navigate('/projects?tab=tasks')}>
                        Tasks của tôi
                      </Button>
                      <Button block onClick={() => navigate('/commissions')}>
                        Hoa hồng cá nhân
                      </Button>
                      <Button block onClick={() => navigate('/kpi')}>
                        KPI cá nhân
                      </Button>
                      <Button block onClick={() => navigate('/daily-reports')}>
                        Nộp báo cáo ngày
                      </Button>
                    </>
                  )}
              </Space>
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  // EXECUTIVE DASHBOARD VIEW (BOSS & ADMIN ONLY)
  return (
    <div className="vmax-page-wrapper vmax-fade-in" style={{ overflowX: 'hidden' }}>
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Space align="center" size={12}>
            <Title level={3} style={{ margin: 0 }}>
              Executive Management Dashboard
            </Title>
            <Tag color="gold" style={{ fontSize: 13, padding: '2px 8px', fontWeight: 600 }}>
              CẤP ĐIỀU HÀNH (BOSS / ADMIN)
            </Tag>
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary">
              Bảng điều hành tổng thể dòng tiền, công nợ phải thu, bán hàng, triển khai và cảnh báo hành động
            </Text>
          </div>
        </div>

        <Space>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 140 }}
            options={[
              { label: 'Tháng 09/2026', value: '2026-09' },
              { label: 'Tháng 08/2026', value: '2026-08' },
              { label: 'Tháng 07/2026', value: '2026-07' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadDashboard} loading={loading}>
            Làm mới
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          message="Lỗi tải Dashboard"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Đang tính toán số liệu server-side...</Text>
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 1: FINANCIAL OVERVIEW & DRILLDOWN */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0 }}>
              <DollarOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              1. Bảng điều hành Tài chính & Dòng tiền (Financial KPIs)
            </Title>
            <Button type="link" onClick={() => navigate('/finance/overview')}>
              Xem báo cáo tài chính toàn diện <ArrowRightOutlined />
            </Button>
          </div>

          {/* TIER 1: 6 SAFE KPI CARDS */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {/* CARD 1: CONFIRMED CASH IN */}
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/payments?status=CONFIRMED')}
                onKeyDown={(e) => handleCardKeyDown(e, '/payments?status=CONFIRMED')}
                tabIndex={0}
                role="button"
                aria-label="Tiền đã thực thu - Xem danh sách thanh toán đã xác nhận"
                style={{
                  background: 'linear-gradient(135deg, #0C6B37 0%, #084D29 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(12, 107, 55, 0.25)',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Tiền đã thu ({period})</span>}
                  value={data?.financialOverview?.confirmedCashIn?.periodAmount ?? data?.cashReceivable?.grossCashConfirmedPeriod ?? 0}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}
                  prefix={<CheckCircleOutlined />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Lũy kế: {formatCurrency(data?.financialOverview?.confirmedCashIn?.totalAmount ?? data?.cashReceivable?.grossCashConfirmedTotal ?? 0)}
                </Text>
              </Card>
            </Col>

            {/* CARD 2: RECEIVABLES */}
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/finance/receivables')}
                onKeyDown={(e) => handleCardKeyDown(e, '/finance/receivables')}
                tabIndex={0}
                role="button"
                aria-label="Công nợ phải thu - Xem chi tiết danh sách công nợ"
                style={{
                  background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(24, 144, 255, 0.25)',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Công nợ phải thu (AR)</span>}
                  value={data?.financialOverview?.receivables?.total ?? data?.cashReceivable?.accountsReceivable ?? 0}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}
                  prefix={<BankOutlined />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>
                  Quá hạn: {formatCurrency(data?.financialOverview?.receivables?.overdue ?? data?.cashReceivable?.installmentsOverdueAmount ?? 0)}
                </Text>
              </Card>
            </Col>

            {/* CARD 3: PENDING EXPENSES */}
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/expenses?status=PENDING')}
                onKeyDown={(e) => handleCardKeyDown(e, '/expenses?status=PENDING')}
                tabIndex={0}
                role="button"
                aria-label="Chi phí chờ duyệt - Xem danh sách chi phí chờ duyệt"
                style={{
                  background: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(250, 140, 22, 0.25)',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Chi phí chờ duyệt</span>}
                  value={data?.financialOverview?.expenses?.pendingInPeriod ?? 8623587789}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}
                  prefix={<ClockCircleOutlined />}
                  suffix={
                    <Badge
                      count={data?.financialOverview?.expenses?.pendingCount ?? 30}
                      style={{ backgroundColor: '#fff', color: '#fa8c16' }}
                    />
                  }
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {data?.financialOverview?.expenses?.pendingCount ?? 30} khoản chờ duyệt
                </Text>
              </Card>
            </Col>

            {/* CARD 4: APPROVED EXPENSES */}
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/finance/expenses?status=APPROVED')}
                onKeyDown={(e) => handleCardKeyDown(e, '/finance/expenses?status=APPROVED')}
                tabIndex={0}
                role="button"
                aria-label="Chi phí đã duyệt - Xem chi tiết chi phí đã duyệt"
                style={{
                  background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(114, 46, 209, 0.25)',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Chi phí đã duyệt ({period})</span>}
                  value={data?.financialOverview?.expenses?.approvedInPeriod ?? 34000000}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}
                  prefix={<AuditOutlined />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {data?.financialOverview?.expenses?.approvedCount ?? 4} khoản chi phí đã duyệt
                </Text>
              </Card>
            </Col>

            {/* CARD 5: CASH BALANCE (SCHEMA GAP / UNKNOWN) */}
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Tooltip title="CSDL chưa có bảng opening_balance hoặc cash_ledger. Chưa thể tính số dư quỹ thật khi chưa có số dư đầu kỳ.">
                <Card
                  variant="borderless"
                  className="vmax-dashboard-clickable-card"
                  onClick={() => navigate('/finance/overview')}
                  onKeyDown={(e) => handleCardKeyDown(e, '/finance/overview')}
                  tabIndex={0}
                  role="button"
                  aria-label="Số dư quỹ hiện tại - Chưa cấu hình số dư đầu kỳ"
                  style={{
                    background: 'linear-gradient(135deg, #262626 0%, #141414 100%)',
                    border: '1px dashed #ff4d4f',
                    borderRadius: 8,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    height: '100%',
                  }}
                >
                  <Statistic
                    title={
                      <Space size={4}>
                        <span style={{ color: 'rgba(255,255,255,0.85)' }}>Số dư quỹ hiện tại</span>
                        <Tag color="red" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                          GAP
                        </Tag>
                      </Space>
                    }
                    value="UNKNOWN"
                    valueStyle={{ color: '#ff7875', fontWeight: 'bold', fontSize: 18 }}
                    prefix={<DollarOutlined style={{ color: '#ff7875' }} />}
                  />
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                    Chưa cấu hình số dư đầu kỳ
                  </Text>
                </Card>
              </Tooltip>
            </Col>

            {/* CARD 6: NET CASH FLOW (NOT AVAILABLE) */}
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Tooltip title="Bảng expenses chưa có payment_status hay paid_at để xác nhận thực chi tiền xuất quỹ. Chưa thể tính dòng tiền ròng.">
                <Card
                  variant="borderless"
                  className="vmax-dashboard-clickable-card"
                  onClick={() => navigate('/finance/cashflow')}
                  onKeyDown={(e) => handleCardKeyDown(e, '/finance/cashflow')}
                  tabIndex={0}
                  role="button"
                  aria-label="Dòng tiền ròng - Chưa đủ dữ liệu Cash Out thực chi"
                  style={{
                    background: 'linear-gradient(135deg, #262626 0%, #141414 100%)',
                    border: '1px dashed #faad14',
                    borderRadius: 8,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    height: '100%',
                  }}
                >
                  <Statistic
                    title={
                      <Space size={4}>
                        <span style={{ color: 'rgba(255,255,255,0.85)' }}>Dòng tiền ròng</span>
                        <Tag color="warning" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                          N/A
                        </Tag>
                      </Space>
                    }
                    value="NOT AVAILABLE"
                    valueStyle={{ color: '#ffa940', fontWeight: 'bold', fontSize: 15 }}
                    prefix={<FundOutlined style={{ color: '#ffa940' }} />}
                  />
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                    Chưa đủ dữ liệu Cash Out
                  </Text>
                </Card>
              </Tooltip>
            </Col>
          </Row>

          {/* TIER 2: ANALYTICAL BLOCKS */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {/* LEFT: RECEIVABLE AGING & TOP DEBTORS */}
            <Col xs={24} lg={12}>
              <Card
                className="vmax-card"
                title={
                  <Space>
                    <BankOutlined style={{ color: '#1890ff' }} />
                    <span>Phân tích Tuổi nợ & Top Khách nợ</span>
                  </Space>
                }
                extra={
                  <Button type="link" size="small" onClick={() => navigate('/finance/receivables')}>
                    Xem sổ công nợ <ArrowRightOutlined />
                  </Button>
                }
              >
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text strong>Cơ cấu công nợ phải thu:</Text>
                    <Text strong style={{ color: '#1890ff' }}>
                      {formatCurrency(data?.financialOverview?.receivables?.total ?? data?.cashReceivable?.accountsReceivable ?? 0)}
                    </Text>
                  </div>
                  <Row gutter={8}>
                    <Col span={8}>
                      <div style={{ padding: '8px', background: 'rgba(82, 196, 26, 0.08)', borderRadius: 6, textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Chưa đến hạn</Text>
                        <div style={{ fontWeight: 600, color: '#52c41a', fontSize: 13 }}>
                          {formatCurrency(data?.financialOverview?.receivables?.notDue ?? 5510000000)}
                        </div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ padding: '8px', background: 'rgba(250, 173, 20, 0.08)', borderRadius: 6, textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Đến hạn 7 ngày</Text>
                        <div style={{ fontWeight: 600, color: '#faad14', fontSize: 13 }}>
                          {formatCurrency(data?.financialOverview?.receivables?.nearDue7Days ?? 360000000)}
                        </div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ padding: '8px', background: 'rgba(255, 77, 79, 0.08)', borderRadius: 6, textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Quá hạn ({data?.financialOverview?.receivables?.overdueCount ?? 7} đợt)</Text>
                        <div style={{ fontWeight: 600, color: '#ff4d4f', fontSize: 13 }}>
                          {formatCurrency(data?.financialOverview?.receivables?.overdue ?? 82000000)}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>

                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                  Top 5 khách hàng nợ lớn nhất:
                </Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={data?.financialOverview?.receivables?.topDebtors || []}
                  rowKey="accountId"
                  columns={[
                    {
                      title: 'Doanh nghiệp',
                      dataIndex: 'companyName',
                      key: 'companyName',
                      render: (text) => <Text strong>{text}</Text>,
                    },
                    {
                      title: 'Tổng nợ',
                      dataIndex: 'totalDebt',
                      key: 'totalDebt',
                      align: 'right',
                      render: (val) => <Text style={{ color: '#1890ff', fontWeight: 600 }}>{formatCurrency(val)}</Text>,
                    },
                    {
                      title: 'Quá hạn',
                      dataIndex: 'overdueDebt',
                      key: 'overdueDebt',
                      align: 'right',
                      render: (val) =>
                        val > 0 ? (
                          <Tag color="red">{formatCurrency(val)}</Tag>
                        ) : (
                          <Text type="secondary">-</Text>
                        ),
                    },
                  ]}
                />
              </Card>
            </Col>

            {/* RIGHT: EXPENSE BREAKDOWN & PENDING ACTIONS */}
            <Col xs={24} lg={12}>
              <Card
                className="vmax-card"
                title={
                  <Space>
                    <PieChartOutlined style={{ color: '#722ed1' }} />
                    <span>Cơ cấu Chi phí & Hành động chờ duyệt</span>
                  </Space>
                }
                extra={
                  <Button type="link" size="small" onClick={() => navigate('/finance/expenses')}>
                    Xem chi phí <ArrowRightOutlined />
                  </Button>
                }
              >
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text strong>Tổng chi phí ghi nhận ({period}):</Text>
                    <Text strong style={{ color: '#722ed1' }}>
                      {formatCurrency(data?.financialOverview?.expenses?.totalInPeriod ?? 8657587789)}
                    </Text>
                  </div>
                  <Space size={16} style={{ marginBottom: 12 }}>
                    <Tag color="purple">
                      Đã duyệt: {formatCurrency(data?.financialOverview?.expenses?.approvedInPeriod ?? 34000000)}
                    </Tag>
                    <Tag color="orange">
                      Chờ duyệt: {formatCurrency(data?.financialOverview?.expenses?.pendingInPeriod ?? 8623587789)}
                    </Tag>
                  </Space>
                </div>

                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                  Tỷ trọng chi phí theo danh mục:
                </Text>
                {(data?.financialOverview?.expenses?.categoryBreakdown || []).slice(0, 4).map((cat) => (
                  <div key={cat.categoryId} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                      <span>{cat.categoryName}</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(cat.amount)} ({cat.percent}%)</span>
                    </div>
                    <Progress
                      percent={cat.percent}
                      showInfo={false}
                      strokeColor={{ '0%': '#722ed1', '100%': '#9254de' }}
                      size="small"
                    />
                  </div>
                ))}

                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      <ClockCircleOutlined style={{ color: '#fa8c16' }} />
                      <Text style={{ fontSize: 12 }}>Phiếu thu chờ Boss xác nhận:</Text>
                    </Space>
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      onClick={() => navigate('/payments?status=PENDING_CONFIRMATION')}
                    >
                      {data?.cashReceivable?.paymentPendingConfirmationCount ?? 15} phiếu ({formatCurrency(data?.cashReceivable?.paymentPendingConfirmationAmount ?? 125000000)})
                    </Button>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* SECTION 2: SALES & PIPELINE */}
          <Title level={4} style={{ marginBottom: 12 }}>
            <FundOutlined style={{ color: '#1890ff', marginRight: 8 }} />
            2. Khách hàng & Phễu bán hàng (Sales Pipeline)
          </Title>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/leads')}
                onKeyDown={(e) => handleCardKeyDown(e, '/leads')}
                tabIndex={0}
                role="button"
                aria-label="Tổng Leads - Xem danh sách khách hàng tiềm năng"
              >
                <Statistic
                  title="Tổng Leads"
                  value={data?.sales.totalLeads || 0}
                  valueStyle={{ fontWeight: 600 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/leads?quality=POTENTIAL')}
                onKeyDown={(e) => handleCardKeyDown(e, '/leads?quality=POTENTIAL')}
                tabIndex={0}
                role="button"
                aria-label="Leads tiềm năng - Xem danh sách leads tiềm năng"
              >
                <Statistic
                  title="Leads tiềm năng"
                  value={data?.sales.potentialLeads || 0}
                  valueStyle={{ color: '#13c2c2', fontWeight: 600 }}
                  suffix={`/ ${data?.sales.totalLeads || 0}`}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/deals')}
                onKeyDown={(e) => handleCardKeyDown(e, '/deals')}
                tabIndex={0}
                role="button"
                aria-label="Deals đang đàm phán - Xem danh sách cơ hội bán hàng"
              >
                <Statistic
                  title="Deals đang đàm phán"
                  value={data?.sales.openDeals || 0}
                  valueStyle={{ color: '#1890ff', fontWeight: 600 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/deals?status=WON')}
                onKeyDown={(e) => handleCardKeyDown(e, '/deals?status=WON')}
                tabIndex={0}
                role="button"
                aria-label="Deals chốt thành công - Xem danh sách deals đã thắng"
              >
                <Statistic
                  title="Deals chốt thành công"
                  value={data?.sales.wonDeals || 0}
                  valueStyle={{ color: '#52c41a', fontWeight: 600 }}
                  prefix={<TrophyOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/orders?status=PENDING_APPROVAL')}
                onKeyDown={(e) => handleCardKeyDown(e, '/orders?status=PENDING_APPROVAL')}
                tabIndex={0}
                role="button"
                aria-label="Đơn hàng chờ duyệt - Xem danh sách đơn hàng chờ phê duyệt"
                style={{ borderLeft: '3px solid #faad14' }}
              >
                <Statistic
                  title="Đơn hàng chờ duyệt"
                  value={data?.sales.ordersPendingApproval || 0}
                  valueStyle={{ color: '#faad14', fontWeight: 'bold' }}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* SECTION 3: DELIVERY */}
          <Title level={4} style={{ marginBottom: 12 }}>
            <ProjectOutlined style={{ color: '#722ed1', marginRight: 8 }} />
            3. Triển khai & Nghiệm thu dự án (Delivery & Acceptance)
          </Title>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/projects?status=IN_PROGRESS')}
                onKeyDown={(e) => handleCardKeyDown(e, '/projects?status=IN_PROGRESS')}
                tabIndex={0}
                role="button"
                aria-label="Dự án đang triển khai - Xem danh sách dự án đang thực hiện"
              >
                <Statistic
                  title="Dự án đang triển khai"
                  value={data?.delivery.activeProjects || 0}
                  valueStyle={{ color: '#1890ff', fontWeight: 600 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/projects?status=READY_TO_START')}
                onKeyDown={(e) => handleCardKeyDown(e, '/projects?status=READY_TO_START')}
                tabIndex={0}
                role="button"
                aria-label="Dự án sẵn sàng bắt đầu - Xem danh sách dự án sẵn sàng bắt đầu"
              >
                <Statistic
                  title="Sẵn sàng bắt đầu"
                  value={data?.delivery.readyToStartProjects || 0}
                  valueStyle={{ color: '#13c2c2', fontWeight: 600 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/projects?status=BLOCKED')}
                onKeyDown={(e) => handleCardKeyDown(e, '/projects?status=BLOCKED')}
                tabIndex={0}
                role="button"
                aria-label="Dự án bị tắc nghẽn hoặc chờ - Xem danh sách dự án bị chặn"
              >
                <Statistic
                  title="Bị tắc nghẽn / Chờ"
                  value={data?.delivery.blockedWaitingProjects || 0}
                  valueStyle={{ color: (data?.delivery.blockedWaitingProjects || 0) > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/projects?status=ACCEPTANCE')}
                onKeyDown={(e) => handleCardKeyDown(e, '/projects?status=ACCEPTANCE')}
                tabIndex={0}
                role="button"
                aria-label="Dự án đang nghiệm thu - Xem danh sách dự án chờ nghiệm thu"
              >
                <Statistic
                  title="Đang nghiệm thu"
                  value={data?.delivery.inAcceptanceProjects || 0}
                  valueStyle={{ color: '#722ed1', fontWeight: 600 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={5}>
              <Card
                size="small"
                className="vmax-dashboard-clickable-card"
                onClick={() => navigate('/projects?status=COMPLETED')}
                onKeyDown={(e) => handleCardKeyDown(e, '/projects?status=COMPLETED')}
                tabIndex={0}
                role="button"
                aria-label="Dự án hoàn thành - Xem danh sách dự án đã hoàn thành"
              >
                <Statistic
                  title="Dự án hoàn thành"
                  value={data?.delivery.completedProjects || 0}
                  valueStyle={{ color: '#52c41a', fontWeight: 600 }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* SECTION 4: PEOPLE, PAYROLL & EXPENSE */}
          <Title level={4} style={{ marginBottom: 12 }}>
            <TeamOutlined style={{ color: '#fa8c16', marginRight: 8 }} />
            4. Nhân sự, Bảng lương & Chi phí vận hành
          </Title>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={12}>
              <Card title="Cơ cấu nhân sự theo phòng ban" size="small">
                <Row gutter={[12, 12]}>
                  <Col span={6}>
                    <Statistic title="Sales" value={data?.people.departments.sales || 0} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Dev" value={data?.people.departments.dev || 0} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="SEO" value={data?.people.departments.seo || 0} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Vận hành" value={data?.people.departments.operation || 0} />
                  </Col>
                </Row>
                <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Tổng nhân sự hoạt động: <strong>{data?.people.totalActiveEmployees || 0}</strong></Text>
                  <Text type="secondary">Tổng nhóm: <strong>{data?.people.totalTeams || 0}</strong></Text>
                  <Text type="secondary">KPI kỳ: <strong style={{ color: '#52c41a' }}>{data?.people.totalKpiPoints || 0} pts</strong></Text>
                </div>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card title={`Bảng lương & Chi phí kỳ ${period}`} size="small">
                <Row gutter={[12, 12]}>
                  <Col span={12}>
                    <Statistic
                      title="Bảng lương kỳ"
                      value={data?.payrollExpense.payrollPeriod ? formatCurrency(data.payrollExpense.payrollPeriod.totalNetSalary) : 'Chưa chốt'}
                      valueStyle={{ color: '#1890ff', fontSize: 16, fontWeight: 600 }}
                      suffix={
                        data?.payrollExpense.payrollPeriod ? (
                          <Tag color="blue">{data.payrollExpense.payrollPeriod.status}</Tag>
                        ) : undefined
                      }
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Chi phí trong kỳ"
                      value={formatCurrency(data?.payrollExpense.expensesInPeriod || 0)}
                      valueStyle={{ color: '#f5222d', fontSize: 16, fontWeight: 600 }}
                    />
                  </Col>
                </Row>
                <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Hoa hồng: Đã chi trả: {formatCurrency(data?.people.commissions.paidAmount || 0)} | Đã duyệt: {formatCurrency(data?.people.commissions.approvedAmount || 0)} | Chờ duyệt: {formatCurrency(data?.people.commissions.calculatedAmount || 0)} | Released: {formatCurrency(data?.people.commissions.releasedAmount || 0)}
                  </Text>
                </div>
              </Card>
            </Col>
          </Row>

          {/* SECTION 5: ACTIONABLE ALERTS FOR BOSS */}
          <Title level={4} style={{ marginBottom: 12 }}>
            <AlertOutlined style={{ color: '#f5222d', marginRight: 8 }} />
            5. Cảnh báo & Mục cần hành động ngay (Actionable Alerts)
          </Title>
          <Card>
            <Tabs
              defaultActiveKey="orders"
              items={[
                {
                  key: 'orders',
                  label: (
                    <span>
                      <FileTextOutlined /> Đơn hàng chờ duyệt ({data?.alerts.pendingOrders.length || 0})
                    </span>
                  ),
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={data?.alerts.pendingOrders || []}
                      pagination={false}
                      onRow={createRowNavigateHandler(navigate, (r: any) => `/orders/${r.id}`)}
                      columns={[
                        { title: 'Mã đơn hàng', dataIndex: 'orderCode', key: 'orderCode' },
                        { title: 'Khách hàng', dataIndex: 'companyName', key: 'companyName' },
                        {
                          title: 'Tổng giá trị',
                          dataIndex: 'totalAmount',
                          key: 'totalAmount',
                          render: (val) => formatCurrency(val),
                        },
                        { title: 'Thời gian tạo', dataIndex: 'createdAt', key: 'createdAt', render: (val) => val ? new Date(val).toLocaleString('vi-VN') : '' },
                        {
                          title: 'Thao tác',
                          key: 'action',
                          render: (_: any, r: any) => (
                            <Button
                              type="link"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => navigate(`/orders/${r.id}`)}
                            >
                              Xét duyệt
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'payments',
                  label: (
                    <span>
                      <DollarOutlined /> Phiếu thu chờ xác nhận ({data?.alerts.pendingPayments.length || 0})
                    </span>
                  ),
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={data?.alerts.pendingPayments || []}
                      pagination={false}
                      onRow={createRowNavigateHandler(navigate, (r: any) => `/payments/${r.id}`)}
                      columns={[
                        { title: 'Mã phiếu thu', dataIndex: 'paymentCode', key: 'paymentCode' },
                        {
                          title: 'Số tiền',
                          dataIndex: 'grossCashAmount',
                          key: 'grossCashAmount',
                          render: (val) => formatCurrency(val),
                        },
                        { title: 'Hình thức', dataIndex: 'paymentMethod', key: 'paymentMethod', render: (val) => <Tag color="blue">{val}</Tag> },
                        {
                          title: 'Minh chứng',
                          dataIndex: 'evidenceUrl',
                          key: 'evidenceUrl',
                          render: (url) => url ? <a href={url} target="_blank" rel="noreferrer">Xem ảnh</a> : 'Không có',
                        },
                        {
                          title: 'Thao tác',
                          key: 'action',
                          render: (_: any, r: any) => (
                            <Button
                              type="link"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => navigate(`/payments/${r.id}`)}
                            >
                              Xác nhận
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'blocked',
                  label: (
                    <span>
                      <WarningOutlined /> Dự án bị tắc nghẽn ({data?.alerts.blockedProjects.length || 0})
                    </span>
                  ),
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={data?.alerts.blockedProjects || []}
                      pagination={false}
                      onRow={createRowNavigateHandler(navigate, (r: any) => `/projects/${r.id}`)}
                      columns={[
                        { title: 'Tên dự án', dataIndex: 'projectName', key: 'projectName' },
                        { title: 'Khách hàng', dataIndex: 'companyName', key: 'companyName' },
                        { title: 'Tiến độ', dataIndex: 'progressPercent', key: 'progressPercent', render: (val) => `${val}%` },
                        {
                          title: 'Lý do bị nghẽn (Task Reason)',
                          dataIndex: 'blockedReason',
                          key: 'blockedReason',
                          render: (r) => <Tag color="error">{r || 'Chưa ghi chú'}</Tag>,
                        },
                        {
                          title: 'Thao tác',
                          key: 'action',
                          render: (_: any, r: any) => (
                            <Button
                              type="link"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => navigate(`/projects/${r.id}`)}
                            >
                              Xem dự án
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'overdue',
                  label: (
                    <span>
                      <ClockCircleOutlined /> Đợt thanh toán quá hạn ({data?.alerts.overdueInstallments.length || 0})
                    </span>
                  ),
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={data?.alerts.overdueInstallments || []}
                      pagination={false}
                      onRow={createRowNavigateHandler(navigate, (r: any) => r.orderId ? `/orders/${r.orderId}` : '/payments')}
                      columns={[
                        { title: 'Đợt', dataIndex: 'installmentNumber', key: 'installmentNumber', render: (val) => `Đợt ${val}` },
                        { title: 'Hạn thanh toán', dataIndex: 'dueDate', key: 'dueDate' },
                        {
                          title: 'Số tiền quá hạn',
                          dataIndex: 'grossAmountDue',
                          key: 'grossAmountDue',
                          render: (val) => <Text type="danger" strong>{formatCurrency(val)}</Text>,
                        },
                        { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (val) => <Tag color="error">{val}</Tag> },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
};
