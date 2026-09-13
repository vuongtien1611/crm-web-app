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
  ToolOutlined,
  AuditOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  getDevWorkspaceSummaryApi,
  DevWorkspaceSummaryResponse,
  DevWorkspaceMemberSummary,
  DevWorkspaceRecentProject,
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
  REVIEW: { label: 'Đang nghiệm thu nội bộ', color: 'purple' },
  ACCEPTANCE: { label: 'Chờ khách nghiệm thu', color: 'magenta' },
  COMPLETED: { label: 'Hoàn thành', color: 'success' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export const DevLeaderWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(getCurrentPeriod());
  const [data, setData] = useState<DevWorkspaceSummaryResponse | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDevWorkspaceSummaryApi(period);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu Dev Team Workspace');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Table Columns: Dev Members & Workload
  const memberColumns = [
    {
      title: 'Thành viên',
      key: 'fullName',
      render: (_: any, record: DevWorkspaceMemberSummary) => (
        <Space direction="horizontal" size={12}>
          <Avatar
            style={{
              backgroundColor: record.isLeader ? '#722ed1' : '#1890ff',
            }}
          >
            {record.fullName.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text strong>{record.fullName}</Text>
              {record.isLeader && (
                <Tag color="purple" icon={<CrownOutlined />}>
                  Trưởng nhóm
                </Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.employeeCode} • {record.positionName || 'Lập trình viên'}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Dự án chính (PRIMARY)',
      dataIndex: 'activePrimaryProjectsCount',
      key: 'activePrimaryProjectsCount',
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px', fontWeight: 600 }}>
          {count}
        </Tag>
      ),
    },
    {
      title: 'Dự án hỗ trợ (SUPPORT)',
      dataIndex: 'activeSupportProjectsCount',
      key: 'activeSupportProjectsCount',
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="cyan" style={{ fontSize: 13, padding: '2px 10px', fontWeight: 600 }}>
          {count}
        </Tag>
      ),
    },
    {
      title: 'Tổng Workload Dự án',
      dataIndex: 'totalActiveProjects',
      key: 'totalActiveProjects',
      align: 'center' as const,
      render: (total: number) => (
        <Tag
          color={total > 4 ? 'volcano' : total > 2 ? 'orange' : 'green'}
          style={{ fontSize: 13, padding: '2px 10px', fontWeight: 600 }}
        >
          {total} dự án
        </Tag>
      ),
    },
    {
      title: 'Tasks đang làm',
      dataIndex: 'activeTasksCount',
      key: 'activeTasksCount',
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="geekblue" style={{ fontWeight: 600 }}>
          {count} tasks
        </Tag>
      ),
    },
    {
      title: `Điểm KPI (${period})`,
      dataIndex: 'kpiPoints',
      key: 'kpiPoints',
      align: 'right' as const,
      render: (pts: number) => (
        <Text strong style={{ color: pts > 0 ? '#52c41a' : '#bfbfbf', fontSize: 14 }}>
          {pts} điểm
        </Text>
      ),
    },
  ];

  // Table Columns: Team Projects
  const projectColumns = [
    {
      title: 'Tên dự án',
      dataIndex: 'project_name',
      key: 'project_name',
      render: (name: string, record: DevWorkspaceRecentProject) => (
        <div>
          <Text strong>{name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Đơn: {record.order_code} • KH: {record.company_name}
          </Text>
        </div>
      ),
    },
    {
      title: 'Dịch vụ',
      dataIndex: 'service_name',
      key: 'service_name',
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: 'Tiến độ',
      dataIndex: 'materialized_progress_percent',
      key: 'materialized_progress_percent',
      width: 180,
      render: (percent: number) => (
        <Progress
          percent={percent || 0}
          size="small"
          status={percent === 100 ? 'success' : 'active'}
        />
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
      title: 'Phụ trách chính (PRIMARY)',
      dataIndex: 'primaryAssignees',
      key: 'primaryAssignees',
      render: (assignees: string[]) => (
        <div>
          {assignees && assignees.length > 0 ? (
            assignees.map((name, idx) => (
              <Tag color="geekblue" key={idx}>
                {name}
              </Tag>
            ))
          ) : (
            <Text type="secondary">—</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Hỗ trợ (SUPPORT)',
      dataIndex: 'supportAssignees',
      key: 'supportAssignees',
      render: (assignees: string[]) => (
        <div>
          {assignees && assignees.length > 0 ? (
            assignees.map((name, idx) => (
              <Tag color="cyan" key={idx}>
                {name}
              </Tag>
            ))
          ) : (
            <Text type="secondary">—</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      align: 'center' as const,
      render: (_: any, record: DevWorkspaceRecentProject) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/projects/${record.id}`)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Header */}
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
          <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ToolOutlined style={{ color: '#1890ff' }} />
            <span>Workspace Trưởng Nhóm Kỹ Thuật (DEV)</span>
          </Title>
          <Text type="secondary">
            {data?.team
              ? `Nhóm: ${data.team.name} (${data.team.code}) • Chỉ hiển thị dữ liệu thuộc quyền phụ trách`
              : 'Đang đồng bộ dữ liệu nhóm...'}
          </Text>
        </div>

        <Space direction="horizontal" size={12}>
          <Select
            value={period}
            onChange={(val) => setPeriod(val)}
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
        </Space>
      </div>

      {error && (
        <Alert
          message="Lỗi tải Workspace"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 20 }}
        />
      )}

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: 'var(--vmax-text-muted)' }}>Đang tải dữ liệu nhóm kỹ thuật...</div>
        </div>
      ) : data ? (
        <>
          {/* Top KPI Metrics Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card variant="outlined" hoverable style={{ borderRadius: 8 }}>
                <Statistic
                  title="Dự án Đang Chạy"
                  value={data.metrics.activeProjectsCount}
                  prefix={<ProjectOutlined style={{ color: '#1890ff' }} />}
                  suffix={`/ ${data.metrics.totalProjects}`}
                  valueStyle={{ color: '#1890ff', fontWeight: 700 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ASSIGNED, READY, IN_PROGRESS
                </Text>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <Card variant="outlined" hoverable style={{ borderRadius: 8 }}>
                <Statistic
                  title="Dự án Bị Chặn / Đang Chờ"
                  value={data.metrics.blockedProjectsCount}
                  prefix={<WarningOutlined style={{ color: '#fa8c16' }} />}
                  valueStyle={{ color: '#fa8c16', fontWeight: 700 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  BLOCKED, WAITING (Khách / Sale / Nội bộ)
                </Text>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <Card variant="outlined" hoverable style={{ borderRadius: 8 }}>
                <Statistic
                  title="Tiến Độ Tasks Nhóm"
                  value={data.tasksSummary.done}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  suffix={`/ ${data.tasksSummary.total}`}
                  valueStyle={{ color: '#52c41a', fontWeight: 700 }}
                />
                <div style={{ marginTop: 4 }}>
                  <Progress
                    percent={
                      data.tasksSummary.total > 0
                        ? Math.round((data.tasksSummary.done / data.tasksSummary.total) * 100)
                        : 0
                    }
                    size="small"
                    status="active"
                  />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <Card variant="outlined" hoverable style={{ borderRadius: 8 }}>
                <Statistic
                  title={`Tổng Điểm KPI Nhóm (${period})`}
                  value={data.metrics.totalKpiPoints}
                  prefix={<TrophyOutlined style={{ color: '#722ed1' }} />}
                  valueStyle={{ color: '#722ed1', fontWeight: 700 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Nghiệm thu: {data.metrics.totalAcceptances} dự án
                </Text>
              </Card>
            </Col>
          </Row>

          {/* Main Tabbed Workspace */}
          <Card variant="outlined" style={{ borderRadius: 8 }}>
            <Tabs
              defaultActiveKey="members"
              items={[
                {
                  key: 'members',
                  label: (
                    <span>
                      <TeamOutlined />
                      Thành viên & Workload ({data.members.length})
                    </span>
                  ),
                  children: (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <Text type="secondary">
                          Thống kê khối lượng công việc (Workload) theo phân công thực tế của từng
                          lập trình viên trong nhóm:
                        </Text>
                      </div>
                      <Table
                        rowKey="employeeId"
                        columns={memberColumns}
                        dataSource={data.members}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        locale={{ emptyText: 'Chưa có dữ liệu thành viên' }}
                        onRow={createRowNavigateHandler(navigate, (record) => `/employees/${record.employeeId}`)}
                        bordered
                      />
                    </div>
                  ),
                },
                {
                  key: 'projects',
                  label: (
                    <span>
                      <ProjectOutlined />
                      Dự án của nhóm ({data.recentProjects.length})
                    </span>
                  ),
                  children: (
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <Text type="secondary">
                          Các dự án hiện do thành viên nhóm phụ trách (Primary hoặc Support):
                        </Text>
                      </div>
                      <Table
                        rowKey="id"
                        columns={projectColumns}
                        dataSource={data.recentProjects}
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 'max-content' }}
                        locale={{ emptyText: 'Chưa có dự án nào' }}
                        onRow={createRowNavigateHandler(navigate, (record) => `/projects/${record.id}`)}
                        bordered
                      />
                    </div>
                  ),
                },
                {
                  key: 'tasksSummaryTab',
                  label: (
                    <span>
                      <AuditOutlined />
                      Tổng hợp Tasks ({data.tasksSummary.total})
                    </span>
                  ),
                  children: (
                    <Row gutter={[16, 16]} style={{ padding: '16px 0' }}>
                      <Col xs={12} sm={6}>
                        <Card variant="outlined" style={{ textAlign: 'center', background: '#fafafa' }}>
                          <Title level={2} style={{ color: '#595959', margin: 0 }}>
                            {data.tasksSummary.todo}
                          </Title>
                          <Text type="secondary">Cần làm (TODO)</Text>
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card variant="outlined" style={{ textAlign: 'center', background: '#e6f7ff' }}>
                          <Title level={2} style={{ color: '#1890ff', margin: 0 }}>
                            {data.tasksSummary.inProgress}
                          </Title>
                          <Text type="secondary">Đang làm (IN_PROGRESS)</Text>
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card variant="outlined" style={{ textAlign: 'center', background: '#fff2e8' }}>
                          <Title level={2} style={{ color: '#fa541c', margin: 0 }}>
                            {data.tasksSummary.blocked}
                          </Title>
                          <Text type="secondary">Bị chặn (BLOCKED)</Text>
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card variant="outlined" style={{ textAlign: 'center', background: '#f6ffed' }}>
                          <Title level={2} style={{ color: '#52c41a', margin: 0 }}>
                            {data.tasksSummary.done}
                          </Title>
                          <Text type="secondary">Đã xong (DONE)</Text>
                        </Card>
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
};
export default DevLeaderWorkspacePage;
