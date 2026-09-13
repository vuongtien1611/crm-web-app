import React, { useState, useEffect, useCallback } from 'react';
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
  Typography,
  Badge,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
  SafetyCertificateOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  getEmployeeAccountsApi,
  EmployeeAccountItem,
} from '../../api/employeeAccounts';
import { getEmployeeFormOptions, FormOptionsResponse } from '../../api/employees';
import { BossPinModal } from '../../components/employee-accounts/BossPinModal';

const { Title, Text } = Typography;

const DEPARTMENT_LABELS: Record<string, string> = {
  SALES: 'Kinh doanh',
  DEV: 'Phát triển phần mềm',
  SEO: 'SEO / Marketing',
  OPERATION: 'Vận hành',
};

export const EmployeeAccountsListPage: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<EmployeeAccountItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [isSessionUnlocked, setIsSessionUnlocked] = useState(false);

  // Filter options
  const [options, setOptions] = useState<FormOptionsResponse | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // PIN modal
  const [pinModalOpen, setPinModalOpen] = useState(false);

  // Load select options
  const loadOptions = async () => {
    try {
      const data = await getEmployeeFormOptions();
      setOptions(data);
    } catch {
      // Ignored
    }
  };

  const loadData = useCallback(
    async (currentPage = page, currentLimit = limit) => {
      setLoading(true);
      try {
        const res = await getEmployeeAccountsApi({
          page: currentPage,
          limit: currentLimit,
          q: searchQuery.trim() || undefined,
          department: departmentFilter !== 'ALL' ? departmentFilter : undefined,
          team_id: teamFilter !== 'ALL' ? teamFilter : undefined,
          position_id: positionFilter !== 'ALL' ? positionFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
        });

        setAccounts(res.data);
        setTotal(res.total);
        setPage(res.page);
        setLimit(res.limit);
        setIsSessionUnlocked(res.isUnlocked);
      } catch (err) {
        console.error('Failed to load accounts:', err);
      } finally {
        setLoading(false);
      }
    },
    [page, limit, searchQuery, departmentFilter, teamFilter, positionFilter, statusFilter],
  );

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    loadData(1, limit);
  }, [searchQuery, departmentFilter, teamFilter, positionFilter, statusFilter, loadData, limit]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setDepartmentFilter('ALL');
    setTeamFilter('ALL');
    setPositionFilter('ALL');
    setStatusFilter('ALL');
  };

  const formatLastLogin = (dateStr: string | null) => {
    if (!dateStr) return <Text type="secondary">Chưa từng</Text>;
    try {
      const date = new Date(dateStr);
      return (
        <span style={{ fontSize: 13 }}>
          {date.toLocaleDateString('vi-VN')} {date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      );
    } catch {
      return dateStr;
    }
  };

  const columns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      width: 220,
      render: (_: any, record: EmployeeAccountItem) => (
        <div>
          <Space direction="vertical" size={2}>
            <Space align="center" size={6}>
              <Text strong style={{ fontSize: 14 }}>
                {record.full_name}
              </Text>
              {record.has_pending_reset_request && (
                <Tooltip title="Đang có yêu cầu cấp lại mật khẩu">
                  <Badge status="processing" color="red" text={<Tag color="error">Quên MK</Tag>} />
                </Tooltip>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Mã: <strong>{record.employee_code}</strong>
            </Text>
          </Space>
        </div>
      ),
    },
    {
      title: 'Phòng ban / Team',
      key: 'organization',
      width: 200,
      render: (_: any, record: EmployeeAccountItem) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {record.department ? DEPARTMENT_LABELS[record.department] || record.department : 'Chưa phân bổ'}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Team: {record.team_name || 'Không'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Chức vụ',
      dataIndex: 'position_name',
      key: 'position_name',
      width: 160,
      render: (val: string, record: EmployeeAccountItem) => (
        <Tag color={record.position_code === 'BOSS' ? 'gold' : 'blue'}>{val}</Tag>
      ),
    },
    {
      title: 'Tài khoản đăng nhập',
      key: 'account',
      width: 220,
      render: (_: any, record: EmployeeAccountItem) => (
        <div>
          <div style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--vmax-green, #0C6B37)' }}>
            {record.username}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.email}
          </Text>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'account_status',
      width: 140,
      render: (_: any, record: EmployeeAccountItem) => {
        const isActive = record.account_status === 'ACTIVE';
        return (
          <Space direction="vertical" size={2}>
            <Tag
              icon={isActive ? <CheckCircleOutlined /> : <StopOutlined />}
              color={isActive ? 'success' : 'error'}
            >
              {isActive ? 'Hoạt động' : 'Tạm khóa'}
            </Tag>
            {record.must_change_password && (
              <Tag color="warning" style={{ fontSize: 10 }}>
                Cần đổi MK
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Đăng nhập gần nhất',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 160,
      render: (val: string | null) => formatLastLogin(val),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 150,
      render: (_: any, record: EmployeeAccountItem) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EditOutlined />}
          onClick={() => navigate(`/employee-accounts/${record.employee_id}`)}
          style={{
            borderColor: 'var(--vmax-green, #0C6B37)',
            color: 'var(--vmax-green, #0C6B37)',
            borderRadius: 6,
          }}
        >
          Cập nhật tài khoản
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 800, color: 'var(--vmax-text, #18211C)' }}>
            Quản lý Tài khoản Nhân sự
          </Title>
          <Text type="secondary">
            Bảo mật cấp cao dành riêng cho Ban Giám Đốc (BOSS). Quản trị định danh, đặt lại mật khẩu và kiểm soát quyền truy cập.
          </Text>
        </div>

        {/* Security PIN status indicator */}
        <Space>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              background: isSessionUnlocked ? '#EAF3ED' : '#FFF1F0',
              border: `1px solid ${isSessionUnlocked ? '#B7EB8F' : '#FFA39E'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isSessionUnlocked ? (
              <>
                <UnlockOutlined style={{ color: '#52C41A', fontSize: 15 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#389E0D' }}>
                  Phiên làm việc đã mở khóa PIN
                </span>
              </>
            ) : (
              <>
                <LockOutlined style={{ color: '#F5222D', fontSize: 15 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#CF1322' }}>
                  Yêu cầu PIN khi cập nhật
                </span>
              </>
            )}
          </div>

          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => setPinModalOpen(true)}
            style={{ borderRadius: 8 }}
          >
            {isSessionUnlocked ? 'Cài đặt mã PIN' : 'Mở khóa PIN ngay'}
          </Button>

          <Button icon={<ReloadOutlined />} onClick={() => loadData(page, limit)}>
            Làm mới
          </Button>
        </Space>
      </div>

      {/* Filter Card */}
      <Card
        className="vmax-card"
        style={{ marginBottom: 20, borderRadius: 12 }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Tìm theo họ tên, mã NV, username..."
              prefix={<SearchOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={[
                { value: 'ALL', label: 'Tất cả phòng ban' },
                { value: 'SALES', label: 'Kinh doanh' },
                { value: 'DEV', label: 'Phát triển phần mềm' },
                { value: 'SEO', label: 'SEO / Marketing' },
                { value: 'OPERATION', label: 'Vận hành' },
              ]}
            />
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={teamFilter}
              onChange={setTeamFilter}
              options={[
                { value: 'ALL', label: 'Tất cả Team' },
                ...(options?.teams || []).map((t) => ({
                  value: t.id,
                  label: t.name,
                })),
              ]}
            />
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={positionFilter}
              onChange={setPositionFilter}
              options={[
                { value: 'ALL', label: 'Tất cả chức vụ' },
                ...(options?.positions || []).map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />
          </Col>

          <Col xs={12} sm={6} md={3}>
            <Select
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'Tất cả trạng thái' },
                { value: 'ACTIVE', label: 'Đang hoạt động' },
                { value: 'DISABLED', label: 'Đã tạm khóa' },
              ]}
            />
          </Col>

          <Col xs={12} sm={6} md={3} style={{ textAlign: 'right' }}>
            <Button onClick={handleResetFilters}>Đặt lại</Button>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card
        className="vmax-card"
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={accounts}
          rowKey="employee_id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (tot) => `Tổng số ${tot} tài khoản`,
            onChange: (p, ps) => {
              setPage(p);
              setLimit(ps);
            },
          }}
          locale={{
            emptyText: 'Không tìm thấy tài khoản nhân sự nào phù hợp',
          }}
        />
      </Card>

      {/* Step-Up PIN Modal */}
      <BossPinModal
        open={pinModalOpen}
        onSuccess={() => {
          setIsSessionUnlocked(true);
          setPinModalOpen(false);
          loadData(page, limit);
        }}
        onCancel={() => setPinModalOpen(false)}
      />
    </div>
  );
};
