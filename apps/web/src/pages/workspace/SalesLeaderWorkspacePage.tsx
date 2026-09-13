import React, { useEffect, useState, useCallback } from 'react';
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
  Badge,
  Space,
  Button,
  Tooltip,
  Avatar,
} from 'antd';
import {
  TeamOutlined,
  RiseOutlined,
  TrophyOutlined,
  DollarOutlined,
  FireOutlined,
  EyeOutlined,
  UserOutlined,
  CrownOutlined,
  ReloadOutlined,
  FundOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  getSalesWorkspaceSummaryApi,
  SalesWorkspaceMemberSummary,
} from '../../api/teams';
import { getLeadsApi, LeadItem } from '../../api/leads';
import { getDealsApi, DealItem } from '../../api/deals';
import {
  formatCurrency,
  formatDate,
  getStatusLabel,
} from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

// ─── Helpers ────────────────────────────────────────────────────────────────

const LEAD_STATUS_COLOR: Record<string, string> = {
  NEW: 'blue',
  CALLED: 'geekblue',
  CONSULTED: 'purple',
  FOLLOWING: 'cyan',
  CONVERTED: 'green',
  FAILED: 'red',
};

const DEAL_STATUS_COLOR: Record<string, string> = {
  OPEN: 'blue',
  NEGOTIATING: 'orange',
  WON: 'green',
  LOST: 'red',
};

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const SalesLeaderWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const isSalesLeader = user?.roles?.includes('SALES_TEAM_LEADER');

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');
  const [teamCode, setTeamCode] = useState<string>('');
  const [memberSummaries, setMemberSummaries] = useState<SalesWorkspaceMemberSummary[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [totalCommission, setTotalCommission] = useState(0);
  const [wonRevenue, setWonRevenue] = useState(0);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [openDealsTotal, setOpenDealsTotal] = useState(0);

  // ── Fetch ──
  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch real aggregate database summary (true totals, not sliced by pagination)
      const period = getCurrentPeriod();
      const summary = await getSalesWorkspaceSummaryApi(period);

      setTeamId(summary.team.id);
      setTeamName(summary.team.name);
      setTeamCode(summary.team.code);
      setMemberSummaries(summary.members ?? []);

      // Real Database Totals
      setLeadsTotal(summary.metrics.totalLeads);
      setOpenDealsTotal(summary.metrics.openDealsCount);
      setWonRevenue(summary.metrics.wonRevenue);
      setTotalCommission(summary.metrics.totalCommission);

      // 2. Fetch Recent Leads & Deals for table preview
      const [leadsRes, dealsRes] = await Promise.all([
        getLeadsApi({ limit: 10, page: 1 }),
        getDealsApi({ limit: 10, page: 1 }),
      ]);
      setLeads(leadsRes.data ?? []);
      setDeals(dealsRes.data ?? []);
    } catch (e: any) {
      setError(e?.message || 'Không thể tải dữ liệu Workspace. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSalesLeader) {
      loadWorkspace();
    }
  }, [isSalesLeader, loadWorkspace]);

  // ── Not authorized ──
  if (!isSalesLeader) {
    return (
      <div className="vmax-page-wrapper">
        <Alert
          type="warning"
          showIcon
          message="Không có quyền truy cập"
          description="Trang Workspace này chỉ dành cho Trưởng nhóm Kinh doanh (Sales Team Leader). Bạn sẽ được chuyển về Tổng quan."
          action={
            <Button size="small" onClick={() => navigate('/dashboard')}>
              Về Tổng quan
            </Button>
          }
          style={{ maxWidth: 640, margin: '60px auto' }}
        />
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="vmax-page-wrapper">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
          <Space direction="vertical" align="center">
            <Spin size="large" />
            <Text style={{ color: 'var(--vmax-text-muted)' }}>Đang tải Workspace của bạn...</Text>
          </Space>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="vmax-page-wrapper">
        <Alert
          type="error"
          showIcon
          message="Lỗi tải Workspace"
          description={error}
          action={
            <Button size="small" type="primary" onClick={loadWorkspace}>
              Thử lại
            </Button>
          }
        />
      </div>
    );
  }

  // ── Tables ──
  const leadsColumns = [
    {
      title: 'Khách hàng',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (name: string, row: LeadItem) => (
        <Button type="link" onClick={() => navigate(`/leads/${row.id}`)} style={{ padding: 0 }}>
          {name}
        </Button>
      ),
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={LEAD_STATUS_COLOR[s] || 'default'}>{getStatusLabel(s)}</Tag>
      ),
    },
    {
      title: 'Sale phụ trách',
      dataIndex: 'assigned_sale_name',
      key: 'assigned_sale_name',
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => formatDate(v),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, row: LeadItem) => (
        <Tooltip title="Xem chi tiết">
          <Button
            type="text"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => navigate(`/leads/${row.id}`)}
          />
        </Tooltip>
      ),
    },
  ];

  const openDeals = deals.filter((d) => d.status === 'OPEN' || d.status === 'NEGOTIATING');

  const dealsColumns = [
    {
      title: 'Deal',
      dataIndex: 'deal_name',
      key: 'deal_name',
      render: (name: string, row: DealItem) => (
        <Button type="link" onClick={() => navigate(`/deals/${row.id}`)} style={{ padding: 0 }}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Khách hàng',
      dataIndex: 'company_name',
      key: 'company_name',
    },
    {
      title: 'Giá trị',
      dataIndex: 'expected_value',
      key: 'expected_value',
      render: (v: number) => formatCurrency(v),
      align: 'right' as const,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={DEAL_STATUS_COLOR[s] || 'default'}>{getStatusLabel(s)}</Tag>
      ),
    },
    {
      title: 'Sale phụ trách',
      dataIndex: 'assigned_sale_name',
      key: 'assigned_sale_name',
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, row: DealItem) => (
        <Tooltip title="Xem chi tiết">
          <Button
            type="text"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => navigate(`/deals/${row.id}`)}
          />
        </Tooltip>
      ),
    },
  ];

  const membersColumns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: any, row: SalesWorkspaceMemberSummary) => (
        <Space>
          <Avatar
            size={32}
            icon={<UserOutlined />}
            style={{
              background: row.isLeader ? 'var(--vmax-green)' : 'var(--vmax-green-soft)',
              color: row.isLeader ? '#fff' : 'var(--vmax-green)',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {(row.fullName || 'X').charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--vmax-text)' }}>
              {row.fullName}
              {row.isLeader && (
                <CrownOutlined
                  style={{ marginLeft: 6, color: '#f7b731', fontSize: 13 }}
                />
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--vmax-text-muted)' }}>
              {row.employeeCode}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Chức vụ',
      dataIndex: 'positionName',
      key: 'positionName',
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Tổng Leads',
      key: 'leadsCount',
      align: 'center' as const,
      render: (_: any, row: SalesWorkspaceMemberSummary) => {
        return <Badge count={row.leadsCount} showZero style={{ backgroundColor: row.leadsCount > 0 ? 'var(--vmax-green)' : '#d9d9d9' }} />;
      },
    },
    {
      title: 'Tổng Deals',
      key: 'dealsCount',
      align: 'center' as const,
      render: (_: any, row: SalesWorkspaceMemberSummary) => {
        return <Badge count={row.dealsCount} showZero style={{ backgroundColor: row.dealsCount > 0 ? '#1677ff' : '#d9d9d9' }} />;
      },
    },
    {
      title: 'Deals chốt (Tháng)',
      key: 'wonDealsCount',
      align: 'center' as const,
      render: (_: any, row: SalesWorkspaceMemberSummary) => {
        return <Badge count={row.wonDealsCount} showZero style={{ backgroundColor: row.wonDealsCount > 0 ? '#52c41a' : '#d9d9d9' }} />;
      },
    },
    {
      title: 'Doanh số chốt (Tháng)',
      key: 'wonRevenue',
      align: 'right' as const,
      render: (_: any, row: SalesWorkspaceMemberSummary) => formatCurrency(row.wonRevenue),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, row: SalesWorkspaceMemberSummary) => (
        <Tooltip title="Xem hồ sơ nhân viên">
          <Button
            type="text"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => navigate(`/employees/${row.employeeId}`)}
          />
        </Tooltip>
      ),
    },
  ];

  // ── Render ──
  return (
    <div className="vmax-page-wrapper">
      {/* ── Header ── */}
      <div className="vmax-page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #0C6B37 0%, #167A45 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(12, 107, 55, 0.25)',
                }}
              >
                <FundOutlined style={{ color: '#fff', fontSize: 20 }} />
              </div>
              <div>
                <h1 className="vmax-page-title" style={{ margin: 0 }}>
                  Workspace Trưởng nhóm Kinh doanh
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <Tag color="green" style={{ margin: 0, fontWeight: 600 }}>
                    <TeamOutlined style={{ marginRight: 4 }} />
                    {teamName}
                  </Tag>
                  <Text style={{ color: 'var(--vmax-text-muted)', fontSize: 12 }}>
                    ({teamCode}) · Tháng {getCurrentPeriod()}
                  </Text>
                </div>
              </div>
            </div>
          </div>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadWorkspace}
            style={{ borderRadius: 10 }}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            className="vmax-card"
            style={{
              background: 'linear-gradient(135deg, #e6f7f0 0%, #f0fff8 100%)',
              border: '1px solid #b7eb8f',
            }}
          >
            <Statistic
              title={
                <Text style={{ color: 'var(--vmax-green)', fontWeight: 600, fontSize: 13 }}>
                  <RiseOutlined style={{ marginRight: 6 }} />
                  Tổng Leads nhóm
                </Text>
              }
              value={leadsTotal}
              suffix="leads"
              valueStyle={{ color: 'var(--vmax-green)', fontWeight: 800, fontSize: 28 }}
            />
            <Text style={{ fontSize: 11, color: 'var(--vmax-text-muted)' }}>
              Hiển thị {leads.length} gần nhất
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            className="vmax-card"
            style={{
              background: 'linear-gradient(135deg, #e6f0ff 0%, #f0f5ff 100%)',
              border: '1px solid #91caff',
            }}
          >
            <Statistic
              title={
                <Text style={{ color: '#1677ff', fontWeight: 600, fontSize: 13 }}>
                  <FireOutlined style={{ marginRight: 6 }} />
                  Deals đang mở
                </Text>
              }
              value={openDealsTotal}
              suffix="deals"
              valueStyle={{ color: '#1677ff', fontWeight: 800, fontSize: 28 }}
            />
            <Text style={{ fontSize: 11, color: 'var(--vmax-text-muted)' }}>
              OPEN + NEGOTIATING
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            className="vmax-card"
            style={{
              background: 'linear-gradient(135deg, #fff7e6 0%, #fffbe6 100%)',
              border: '1px solid #ffd591',
            }}
          >
            <Statistic
              title={
                <Text style={{ color: '#fa8c16', fontWeight: 600, fontSize: 13 }}>
                  <TrophyOutlined style={{ marginRight: 6 }} />
                  Doanh số WON tháng này
                </Text>
              }
              value={wonRevenue}
              formatter={(v) => formatCurrency(Number(v))}
              valueStyle={{ color: '#fa8c16', fontWeight: 800, fontSize: 22 }}
            />
            <Text style={{ fontSize: 11, color: 'var(--vmax-text-muted)' }}>
              Kỳ {getCurrentPeriod()}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            className="vmax-card"
            style={{
              background: 'linear-gradient(135deg, #fff0f6 0%, #fff5f0 100%)',
              border: '1px solid #ffadd2',
            }}
          >
            <Statistic
              title={
                <Text style={{ color: '#eb2f96', fontWeight: 600, fontSize: 13 }}>
                  <DollarOutlined style={{ marginRight: 6 }} />
                  Hoa hồng nhóm (tích lũy)
                </Text>
              }
              value={totalCommission}
              formatter={(v) => formatCurrency(Number(v))}
              valueStyle={{ color: '#eb2f96', fontWeight: 800, fontSize: 22 }}
            />
            <Text style={{ fontSize: 11, color: 'var(--vmax-text-muted)' }}>
              CALCULATED → PAID
            </Text>
          </Card>
        </Col>
      </Row>

      {/* ── Members Table ── */}
      <Card
        className="vmax-card"
        style={{ marginBottom: 24 }}
        title={
          <Space>
            <TeamOutlined style={{ color: 'var(--vmax-green)' }} />
            <Title level={5} style={{ margin: 0 }}>
              Thành viên nhóm ({memberSummaries.length} người)
            </Title>
          </Space>
        }
        extra={
          <Button type="link" onClick={() => teamId && navigate(`/teams/${teamId}`)}>
            Quản lý nhóm →
          </Button>
        }
      >
        <Table
          dataSource={memberSummaries}
          columns={membersColumns}
          rowKey="employeeId"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Nhóm chưa có thành viên nào' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/employees/${record.employeeId}`)}
        />
      </Card>

      {/* ── Leads & Deals side by side ── */}
      <Row gutter={[16, 16]}>
        {/* Leads */}
        <Col xs={24} xl={12}>
          <Card
            className="vmax-card"
            title={
              <Space>
                <RiseOutlined style={{ color: 'var(--vmax-green)' }} />
                <Title level={5} style={{ margin: 0 }}>
                  Leads nhóm gần đây
                </Title>
                <Tag>{leadsTotal} tổng</Tag>
              </Space>
            }
            extra={
              <Button type="link" onClick={() => navigate('/leads')}>
                Xem tất cả →
              </Button>
            }
          >
            <Table
              dataSource={leads.slice(0, 10)}
              columns={leadsColumns}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 600 }}
              locale={{ emptyText: 'Chưa có lead nào' }}
              onRow={createRowNavigateHandler(navigate, (record) => `/leads/${record.id}`)}
            />
          </Card>
        </Col>

        {/* Open Deals */}
        <Col xs={24} xl={12}>
          <Card
            className="vmax-card"
            title={
              <Space>
                <FireOutlined style={{ color: '#fa8c16' }} />
                <Title level={5} style={{ margin: 0 }}>
                  Deals đang mở của nhóm
                </Title>
                <Tag color="orange">{openDealsTotal} deals</Tag>
              </Space>
            }
            extra={
              <Button type="link" onClick={() => navigate('/deals')}>
                Xem tất cả →
              </Button>
            }
          >
            <Table
              dataSource={openDeals.slice(0, 10)}
              columns={dealsColumns}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 600 }}
              locale={{ emptyText: 'Không có deal nào đang mở' }}
              onRow={createRowNavigateHandler(navigate, (record) => `/deals/${record.id}`)}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
