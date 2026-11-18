import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Input,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  Typography,
  Result,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  UserOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  getEmployees,
  getEmployeeFormOptions,
  EmployeeItem,
  EmployeeSummary,
  FormOptionsResponse,
} from '../../api/employees';
import { createRowNavigateHandler } from '../../utils/tableUtils';
import { PromoteDemoteModal } from '../../components/employees/PromoteDemoteModal';

const { Title, Text } = Typography;

const DEPARTMENT_LABELS: Record<string, string> = {
  SALES: 'Kinh doanh',
  DEV: 'Phát triển phần mềm',
  SEO: 'SEO / Marketing',
  OPERATION: 'Vận hành',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Đang làm việc', color: 'success' },
  PROBATION: { label: 'Thử việc', color: 'warning' },
  RESIGNED: { label: 'Đã nghỉ việc', color: 'default' },
  TERMINATED: { label: 'Đã chấm dứt', color: 'error' },
};

export const EmployeesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 });
  const [summary, setSummary] = useState<EmployeeSummary>({
    total: 0,
    active: 0,
    probation: 0,
    resigned: 0,
    terminated: 0,
  });

  // Filter options
  const [options, setOptions] = useState<FormOptionsResponse | null>(null);

  // Filter states
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');

  const canRead =
    user?.permissions?.includes('EMPLOYEE_READ') || user?.roles?.includes('ADMIN');

  const canCreate =
    user?.permissions?.includes('EMPLOYEE_CREATE') || user?.roles?.includes('ADMIN');

  const isBossOrAdmin = user?.roles?.some((r) => ['BOSS', 'ADMIN'].includes(r));
  const [promoteTargetEmployee, setPromoteTargetEmployee] = useState<EmployeeItem | null>(null);

  const loadOptions = async () => {
    try {
      const data = await getEmployeeFormOptions();
      setOptions(data);
    } catch {
      // Handled silently
    }
  };

  const loadData = async (page = 1, limit = 10) => {
    setLoading(true);
    try {
      const res = await getEmployees({
        page,
        limit,
        search: searchText.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        positionCode: positionFilter !== 'ALL' ? positionFilter : undefined,
        department: departmentFilter !== 'ALL' ? departmentFilter : undefined,
        teamId: teamFilter !== 'ALL' ? teamFilter : undefined,
      });
      setEmployees(res.data);
      setMeta(res.meta);
      setSummary(res.summary);
    } catch (err) {
      console.error('Failed to load employees:', err);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      loadOptions();
    }
  }, [canRead]);

  useEffect(() => {
    if (canRead) {
      loadData(1, meta.limit);
    }
  }, [canRead, statusFilter, positionFilter, departmentFilter, teamFilter]);

  if (!canRead) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="Bạn không có quyền xem danh sách nhân sự (EMPLOYEE_READ)."
        extra={
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            Về trang chủ
          </Button>
        }
      />
    );
  }

  const columns = [
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      key: 'employee_code',
      width: 140,
      render: (code: string) => (
        <Text strong style={{ fontFamily: 'monospace', color: 'var(--vmax-green)' }}>
          {code}
        </Text>
      ),
    },
    {
      title: 'Họ và tên',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 180,
      render: (name: string, record: EmployeeItem) => (
        <div>
          <Text strong style={{ color: 'var(--vmax-text)' }}>
            {name}
          </Text>
          {record.user && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                @{record.user.username}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Email',
      key: 'email',
      width: 200,
      render: (_: any, record: EmployeeItem) => (
        <Text style={{ fontSize: '13px' }}>{record.user?.email || '-'}</Text>
      ),
    },
    {
      title: 'Chức vụ',
      key: 'position',
      width: 160,
      render: (_: any, record: EmployeeItem) => (
        <Tag color="geekblue">{record.position?.name || '-'}</Tag>
      ),
    },
    {
      title: 'Phòng ban',
      key: 'department',
      width: 150,
      render: (_: any, record: EmployeeItem) => {
        const dept = record.currentTeam?.department;
        return dept ? (
          <Tag color="cyan">{DEPARTMENT_LABELS[dept] || dept}</Tag>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: 'Team & Vai trò',
      key: 'team',
      width: 180,
      render: (_: any, record: EmployeeItem) => {
        const team = record.currentTeam;
        if (!team) return <Text type="secondary">Chưa vào nhóm</Text>;
        return (
          <Space direction="vertical" size={2}>
            <Text strong style={{ fontSize: '13px' }}>
              {team.name}
            </Text>
            {team.isLeader ? (
              <Tag icon={<CrownOutlined />} color="gold" style={{ margin: 0 }}>
                Trưởng nhóm
              </Tag>
            ) : (
              <Tag color="default" style={{ margin: 0 }}>
                Thành viên
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Ngày vào làm',
      dataIndex: 'hire_date',
      key: 'hire_date',
      width: 120,
      render: (date: string | null) =>
        date ? (
          <Text>{date}</Text>
        ) : (
          <Text type="secondary" italic>
            Chưa có
          </Text>
        ),
    },
    {
      title: 'Trạng thái NV',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (st: string) => {
        const conf = STATUS_LABELS[st] || { label: st, color: 'default' };
        return <Badge status={conf.color as any} text={conf.label} />;
      },
    },
    {
      title: 'Tài khoản',
      key: 'account',
      width: 150,
      render: (_: any, record: EmployeeItem) => {
        if (!record.user) {
          return <Tag color="default">Chưa cấp</Tag>;
        }
        return (
          <Space direction="vertical" size={2}>
            <Tag color="green">Đã cấp</Tag>
            {record.user.must_change_password && (
              <Tag color="orange" style={{ fontSize: '11px', margin: 0 }}>
                Chờ đổi MK
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 170,
      align: 'center' as const,
      render: (_: any, record: EmployeeItem) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/employees/${record.id}`)}
          >
            Chi tiết
          </Button>
          {isBossOrAdmin && record.status !== 'RESIGNED' && record.status !== 'TERMINATED' && (
            <Button
              type="text"
              size="small"
              icon={<CrownOutlined style={{ color: '#D97706' }} />}
              onClick={() => setPromoteTargetEmployee(record)}
              title="Tăng / Giáng chức"
              style={{ color: '#D97706' }}
            >
              Bổ nhiệm
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, color: 'var(--vmax-text)', fontWeight: 800 }}>
            Quản lý nhân sự
          </Title>
          <Text type="secondary">
            Quản lý hồ sơ, chức vụ, phòng ban, nhóm làm việc và tài khoản đăng nhập của nhân viên
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => loadData(meta.page, meta.limit)}>
            Làm mới
          </Button>
          {canCreate && (
            <Button
              type="primary"
              style={{
                background: 'var(--vmax-green)',
                borderColor: 'var(--vmax-green)',
                fontWeight: 600,
              }}
              onClick={() => navigate('/employees/new')}
            >
              + Thêm nhân viên
            </Button>
          )}
        </Space>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            className="vmax-card"
            style={{ borderRadius: '16px', boxShadow: 'var(--vmax-shadow)' }}
          >
            <Statistic
              title={<Text strong style={{ color: 'var(--vmax-text-muted)' }}>Tổng nhân viên</Text>}
              value={summary.total}
              prefix={<UserOutlined style={{ color: 'var(--vmax-green)' }} />}
              valueStyle={{ fontWeight: 800, color: 'var(--vmax-text)' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            className="vmax-card"
            style={{ borderRadius: '16px', boxShadow: 'var(--vmax-shadow)' }}
          >
            <Statistic
              title={<Text strong style={{ color: 'var(--vmax-text-muted)' }}>Đang làm việc</Text>}
              value={summary.active}
              prefix={<CheckCircleOutlined style={{ color: '#10b981' }} />}
              valueStyle={{ fontWeight: 800, color: '#10b981' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            className="vmax-card"
            style={{ borderRadius: '16px', boxShadow: 'var(--vmax-shadow)' }}
          >
            <Statistic
              title={<Text strong style={{ color: 'var(--vmax-text-muted)' }}>Thử việc</Text>}
              value={summary.probation}
              prefix={<ClockCircleOutlined style={{ color: '#f59e0b' }} />}
              valueStyle={{ fontWeight: 800, color: '#f59e0b' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            className="vmax-card"
            style={{ borderRadius: '16px', boxShadow: 'var(--vmax-shadow)' }}
          >
            <Statistic
              title={<Text strong style={{ color: 'var(--vmax-text-muted)' }}>Đã nghỉ / Chấm dứt</Text>}
              value={summary.resigned + summary.terminated}
              prefix={<StopOutlined style={{ color: '#ef4444' }} />}
              valueStyle={{ fontWeight: 800, color: '#ef4444' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters Bar */}
      <Card
        variant="borderless"
        className="vmax-card"
        style={{ borderRadius: '16px', boxShadow: 'var(--vmax-shadow)' }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Tìm tên, mã NV, email..."
              prefix={<SearchOutlined style={{ color: '#999' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={() => loadData(1, meta.limit)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { label: 'Tất cả trạng thái', value: 'ALL' },
                { label: 'Đang làm việc', value: 'ACTIVE' },
                { label: 'Thử việc', value: 'PROBATION' },
                { label: 'Đã nghỉ việc', value: 'RESIGNED' },
                { label: 'Đã chấm dứt', value: 'TERMINATED' },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={positionFilter}
              onChange={(val) => setPositionFilter(val)}
              options={[
                { label: 'Tất cả chức vụ', value: 'ALL' },
                ...(options?.positions.map((p) => ({
                  label: p.name,
                  value: p.code,
                })) || []),
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={departmentFilter}
              onChange={(val) => setDepartmentFilter(val)}
              options={[
                { label: 'Tất cả phòng ban', value: 'ALL' },
                { label: 'Kinh doanh', value: 'SALES' },
                { label: 'Phát triển phần mềm', value: 'DEV' },
                { label: 'SEO / Marketing', value: 'SEO' },
                { label: 'Vận hành', value: 'OPERATION' },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={teamFilter}
              onChange={(val) => setTeamFilter(val)}
              options={[
                { label: 'Tất cả nhóm', value: 'ALL' },
                ...(options?.teams.map((t) => ({
                  label: `${t.name} (${t.department || 'N/A'})`,
                  value: t.id,
                })) || []),
              ]}
            />
          </Col>
          <Col xs={24} sm={6} md={2}>
            <Button
              type="primary"
              style={{ width: '100%', background: 'var(--vmax-green)' }}
              onClick={() => loadData(1, meta.limit)}
            >
              Tìm
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Employee Table */}
      <Card
        variant="borderless"
        className="vmax-card"
        style={{ borderRadius: '16px', boxShadow: 'var(--vmax-shadow)' }}
      >
        <Table
          columns={columns}
          dataSource={employees}
          rowKey="id"
          loading={loading}
          onRow={createRowNavigateHandler(navigate, (record) => `/employees/${record.id}`)}
          pagination={{
            current: meta.page,
            pageSize: meta.limit,
            total: meta.total,
            showTotal: (total) => `Tổng cộng ${total} nhân sự`,
            showSizeChanger: true,
            onChange: (page, pageSize) => loadData(page, pageSize),
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Modal Tăng / Giáng chức */}
      <PromoteDemoteModal
        isOpen={Boolean(promoteTargetEmployee)}
        employee={
          promoteTargetEmployee
            ? {
              id: promoteTargetEmployee.id,
              employee_code: promoteTargetEmployee.employee_code,
              full_name: promoteTargetEmployee.full_name,
              position: promoteTargetEmployee.position,
              currentTeam: promoteTargetEmployee.currentTeam,
            }
            : null
        }
        onClose={() => setPromoteTargetEmployee(null)}
        onSuccess={() => loadData(meta.page, meta.limit)}
      />
    </div>
  );
};
