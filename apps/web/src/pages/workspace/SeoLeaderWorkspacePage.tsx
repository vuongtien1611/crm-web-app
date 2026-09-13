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
  Space,
  Button,
  Avatar,
  Progress,
  Tabs,
  Select,
} from 'antd';
import {
  TeamOutlined,
  ProjectOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  CrownOutlined,
  EyeOutlined,
  GlobalOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  getSeoWorkspaceSummaryApi,
  SeoWorkspaceSummaryResponse,
  SeoWorkspaceMemberSummary,
  SeoWorkspaceRecentProject,
} from '../../api/teams';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

const PROJECT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ASSIGNED: { label: 'Đã phân công', color: 'blue' },
  READY_TO_START: { label: 'Sẵn sàng bắt đầu', color: 'cyan' },
  IN_PROGRESS: { label: 'Đang triển khai', color: 'processing' },
  WAITING_CUSTOMER: { label: 'Chờ khách hàng', color: 'orange' },
  WAITING_SALE: { label: 'Chờ Sale', color: 'gold' },
  WAITING_INTERNAL: { label: 'Chờ nội bộ', color: 'volcano' },
  BLOCKED: { label: 'Bị nghẽn / Blocked', color: 'error' },
  REVIEW: { label: 'Đang kiểm tra nội bộ', color: 'purple' },
  ACCEPTANCE: { label: 'Chờ nghiệm thu', color: 'magenta' },
  COMPLETED: { label: 'Hoàn thành', color: 'success' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export const SeoLeaderWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(getCurrentPeriod());
  const [data, setData] = useState<SeoWorkspaceSummaryResponse | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSeoWorkspaceSummaryApi(period);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu SEO Team Workspace');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Table Columns: SEO Members & Workload
  const memberColumns = [
    {
      title: 'Chuyên viên SEO',
      key: 'fullName',
      render: (_: any, record: SeoWorkspaceMemberSummary) => (
        <Space direction="horizontal" size={12}>
          <Avatar
            style={{
              backgroundColor: record.isLeader ? '#722ed1' : '#13c2c2',
            }}
          >
            {record.fullName.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{record.fullName}</span>
              {record.isLeader && (
                <Tag color="purple" icon={<CrownOutlined />}>
                  Trưởng nhóm SEO
                </Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.employeeCode} {record.positionName ? `• ${record.positionName}` : ''}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Dự án chính (Primary)',
      dataIndex: 'activePrimaryProjectsCount',
      key: 'activePrimaryProjectsCount',
      align: 'center' as const,
      render: (val: number) => (
        <Tag color="blue" style={{ fontWeight: 600, fontSize: 13, padding: '2px 10px' }}>
          {val} dự án
        </Tag>
      ),
    },
    {
      title: 'Hỗ trợ (Support)',
      dataIndex: 'activeSupportProjectsCount',
      key: 'activeSupportProjectsCount',
      align: 'center' as const,
      render: (val: number) => (
        <Tag color="default" style={{ fontSize: 12 }}>
          {val} dự án
        </Tag>
      ),
    },
    {
      title: 'Tổng dự án active',
      dataIndex: 'totalActiveProjects',
      key: 'totalActiveProjects',
      align: 'center' as const,
      render: (val: number) => (
        <Text strong style={{ fontSize: 14 }}>
          {val}
        </Text>
      ),
    },
    {
      title: 'Tasks đang phụ trách',
      dataIndex: 'activeTasksCount',
      key: 'activeTasksCount',
      align: 'center' as const,
      render: (val: number) => (
        <Tag color={val > 5 ? 'volcano' : 'cyan'}>
          {val} tasks
        </Tag>
      ),
    },
    {
      title: 'KPI kỳ này',
      dataIndex: 'kpiPoints',
      key: 'kpiPoints',
      align: 'right' as const,
      render: (val: number) => (
        <Text strong style={{ color: '#52c41a', fontSize: 14 }}>
          {val} pts
        </Text>
      ),
    },
  ];

  // Table Columns: Recent Projects
  const projectColumns = [
    {
      title: 'Dự án SEO',
      key: 'project_name',
      render: (_: any, record: SeoWorkspaceRecentProject) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{record.project_name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.company_name} • Đơn hàng: {record.order_code}
          </Text>
        </div>
      ),
    },
    {
      title: 'Dịch vụ',
      dataIndex: 'service_name',
      key: 'service_name',
      render: (val: string) => <Tag color="blue">{val || 'SEO'}</Tag>,
    },
    {
      title: 'Tiến độ vật lý',
      dataIndex: 'materialized_progress_percent',
      key: 'materialized_progress_percent',
      width: 180,
      render: (val: number) => {
        const percent = Number(val || 0);
        return (
          <Progress
            percent={percent}
            size="small"
            status={percent === 100 ? 'success' : 'active'}
            strokeColor={percent >= 80 ? '#52c41a' : percent >= 40 ? '#1890ff' : '#faad14'}
          />
        );
      },
    },
    {
      title: 'Phân công nhân sự',
      key: 'assignees',
      render: (_: any, record: SeoWorkspaceRecentProject) => (
        <Space direction="vertical" size={2}>
          {record.primaryAssignees?.length > 0 && (
            <Text style={{ fontSize: 12 }}>
              <span style={{ color: '#1890ff', fontWeight: 600 }}>Primary:</span>{' '}
              {record.primaryAssignees.join(', ')}
            </Text>
          )}
          {record.supportAssignees?.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <span>Support:</span> {record.supportAssignees.join(', ')}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const conf = PROJECT_STATUS_CONFIG[status] || { label: status, color: 'default' };
        return <Tag color={conf.color}>{conf.label}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      align: 'center' as const,
      render: (_: any, record: SeoWorkspaceRecentProject) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/projects/${record.id}`)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Đang tải số liệu SEO Team Workspace...</Text>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalProjects: 0,
    activeProjectsCount: 0,
    blockedProjectsCount: 0,
    completedProjectsCount: 0,
    reviewAcceptanceCount: 0,
    totalAcceptances: 0,
    totalKpiPoints: 0,
  };

  const tasksSummary = data?.tasksSummary || {
    todo: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    total: 0,
  };

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
          <Space align="center" size={12} wrap>
            <Title level={3} style={{ margin: 0 }}>
              {data?.team ? `${data.team.name}` : 'SEO Team Leader Workspace'}
            </Title>
            {data?.team && (
              <Tag color="cyan" style={{ fontSize: 13, padding: '2px 8px' }}>
                {data.team.code} • PHÒNG SEO
              </Tag>
            )}
            <Tag color="purple" icon={<CrownOutlined />}>
              Trưởng nhóm SEO: {user?.fullName}
            </Tag>
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary">
              Bảng quản trị vận hành nội bộ, tải công việc và tiến độ dự án của nhóm SEO
            </Text>
          </div>
        </div>

        <Space wrap style={{ maxWidth: '100%' }}>
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
          <Button icon={<ReloadOutlined />} onClick={loadWorkspace} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<ProjectOutlined />}
            onClick={() => navigate('/projects')}
          >
            Quản lý tất cả dự án
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          message="Lỗi tải dữ liệu"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      {/* METRIC CARDS: PROJECTS & PERFORMANCE */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(19, 194, 194, 0.25)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Dự án đang triển khai</span>}
              value={metrics.activeProjectsCount}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<ProjectOutlined />}
              suffix={`/ ${metrics.totalProjects} tổng`}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background:
                metrics.blockedProjectsCount > 0
                  ? 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)'
                  : 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Dự án bị nghẽn (Blocked/Wait)</span>}
              value={metrics.blockedProjectsCount}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(114, 46, 209, 0.25)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Dự án hoàn thành</span>}
              value={metrics.completedProjectsCount}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(250, 140, 22, 0.25)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>Tổng điểm KPI Team ({period})</span>}
              value={metrics.totalKpiPoints}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<TrophyOutlined />}
              suffix="pts"
            />
          </Card>
        </Col>
      </Row>

      {/* TASKS OVERVIEW BAR */}
      <Card
        className="vmax-card"
        title={
          <Space>
            <ClockCircleOutlined />
            <span>Tổng hợp nhiệm vụ kỹ thuật & Onpage/Offpage của nhóm</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={12} sm={6} md={3}>
            <Statistic
              title="Tổng tasks"
              value={tasksSummary.total}
              valueStyle={{ fontWeight: 600 }}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Statistic
              title="TODO (Chưa làm)"
              value={tasksSummary.todo}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Statistic
              title="Đang làm"
              value={tasksSummary.inProgress}
              valueStyle={{ color: '#1890ff', fontWeight: 600 }}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Statistic
              title="Bị nghẽn (Blocked)"
              value={tasksSummary.blocked}
              valueStyle={{ color: '#ff4d4f', fontWeight: 600 }}
              prefix={tasksSummary.blocked > 0 ? <WarningOutlined /> : undefined}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Statistic
              title="Hoàn thành (Done)"
              value={tasksSummary.done}
              valueStyle={{ color: '#52c41a', fontWeight: 600 }}
            />
          </Col>
          <Col xs={24} sm={12} md={9}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Tỷ lệ hoàn thành công việc:
            </Text>
            <Progress
              percent={
                tasksSummary.total > 0
                  ? Math.round((tasksSummary.done / tasksSummary.total) * 100)
                  : 0
              }
              status="active"
              strokeColor="#52c41a"
            />
          </Col>
        </Row>
      </Card>

      {/* MAIN WORKSPACE TABS */}
      <Card>
        <Tabs
          defaultActiveKey="workload"
          items={[
            {
              key: 'workload',
              label: (
                <span>
                  <TeamOutlined /> Tải công việc từng chuyên viên SEO ({data?.members?.length || 0})
                </span>
              ),
              children: (
                <div>
                  <Alert
                    message="Nguyên tắc phân công & trách nhiệm"
                    description="Mỗi dự án SEO chỉ cho phép tối đa 2 chuyên viên đảm nhiệm vai trò PRIMARY chịu trách nhiệm chính. Nhân sự SUPPORT hỗ trợ triển khai kỹ thuật và phối hợp."
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                  <Table
                    rowKey="employeeId"
                    columns={memberColumns}
                    dataSource={data?.members || []}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'Chưa có dữ liệu chuyên viên' }}
                    onRow={createRowNavigateHandler(navigate, (record) => `/employees/${record.employeeId}`)}
                  />
                </div>
              ),
            },
            {
              key: 'projects',
              label: (
                <span>
                  <ProjectOutlined /> Dự án SEO đang phụ trách ({data?.recentProjects?.length || 0})
                </span>
              ),
              children: (
                <Table
                  rowKey="id"
                  columns={projectColumns}
                  dataSource={data?.recentProjects || []}
                  pagination={{ pageSize: 5 }}
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'Chưa có dự án nào' }}
                  onRow={createRowNavigateHandler(navigate, (record) => `/projects/${record.id}`)}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
