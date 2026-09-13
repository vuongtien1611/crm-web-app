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
          {/* SECTION 1: CASH & RECEIVABLE */}
          <Title level={4} style={{ marginBottom: 12 }}>
            <DollarOutlined style={{ color: '#52c41a', marginRight: 8 }} />
            1. Dòng tiền thực tế & Công nợ phải thu (Cash & Receivable)
          </Title>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} md={6}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/payments')}
                onKeyDown={(e) => handleCardKeyDown(e, '/payments')}
                tabIndex={0}
                role="button"
                aria-label="Gross Cash đã thu - Xem chi tiết danh sách thanh toán"
                style={{
                  background: 'linear-gradient(135deg, #0C6B37 0%, #084D29 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(12, 107, 55, 0.25)',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Gross Cash đã thu ({period})</span>}
                  value={data?.cashReceivable.grossCashConfirmedPeriod || 0}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 20 }}
                  prefix={<CheckCircleOutlined />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Lũy kế: {formatCurrency(data?.cashReceivable.grossCashConfirmedTotal || 0)}
                </Text>
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/payments')}
                onKeyDown={(e) => handleCardKeyDown(e, '/payments')}
                tabIndex={0}
                role="button"
                aria-label="Phải thu khách hàng (AR) - Xem chi tiết danh sách thanh toán"
                style={{
                  background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(24, 144, 255, 0.25)',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Phải thu khách hàng (AR)</span>}
                  value={data?.cashReceivable.accountsReceivable || 0}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 20 }}
                  prefix={<BankOutlined />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Tính theo payment plan đã duyệt
                </Text>
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/payments?status=PENDING_CONFIRMATION')}
                onKeyDown={(e) => handleCardKeyDown(e, '/payments?status=PENDING_CONFIRMATION')}
                tabIndex={0}
                role="button"
                aria-label="Phiếu thu chờ Boss xác nhận - Xem danh sách phiếu thu chờ xác nhận"
                style={{
                  background: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(250, 140, 22, 0.25)',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Phiếu thu chờ Boss xác nhận</span>}
                  value={data?.cashReceivable.paymentPendingConfirmationAmount || 0}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 20 }}
                  suffix={<Badge count={data?.cashReceivable.paymentPendingConfirmationCount || 0} style={{ backgroundColor: '#fff', color: '#fa8c16' }} />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {data?.cashReceivable.paymentPendingConfirmationCount || 0} phiếu thu chưa duyệt
                </Text>
              </Card>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Card
                variant="borderless"
                className="vmax-dashboard-clickable-card gradient-card"
                onClick={() => navigate('/payments')}
                onKeyDown={(e) => handleCardKeyDown(e, '/payments')}
                tabIndex={0}
                role="button"
                aria-label="Đợt thanh toán quá hạn - Xem chi tiết thanh toán"
                style={{
                  background: (data?.cashReceivable.installmentsOverdueCount || 0) > 0
                    ? 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)'
                    : 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Đợt thanh toán quá hạn</span>}
                  value={data?.cashReceivable.installmentsOverdueAmount || 0}
                  formatter={(val) => formatCurrency(Number(val))}
                  valueStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 20 }}
                  prefix={<WarningOutlined />}
                  suffix={<Badge count={data?.cashReceivable.installmentsOverdueCount || 0} style={{ backgroundColor: '#fff', color: '#ff4d4f' }} />}
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {data?.cashReceivable.installmentsOverdueCount || 0} đợt trễ hạn thanh toán
                </Text>
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
