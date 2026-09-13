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
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  TeamOutlined,
  CrownOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getTeams, TeamListItem, TeamDepartment } from '../../api/teams';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

const DEPARTMENT_LABELS: Record<TeamDepartment, { label: string; color: string }> = {
  SALES: { label: 'Kinh doanh (SALES)', color: 'magenta' },
  DEV: { label: 'Kỹ thuật (DEV)', color: 'blue' },
  SEO: { label: 'SEO & Growth (SEO)', color: 'green' },
  OPERATION: { label: 'Vận hành (OPERATION)', color: 'orange' },
};

export const TeamsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Permissions
  const permissions = user?.permissions || [];
  const roles = user?.roles || [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') || roles.includes('BOSS');
  const canRead = isAdmin || permissions.includes('TEAM_READ');
  const canCreate = isAdmin || permissions.includes('TEAM_CREATE');

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const res = await getTeams({
        department: departmentFilter,
        search: search.trim() || undefined,
      });
      setTeams(res.data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      fetchTeams();
    }
  }, [canRead, departmentFilter]);

  if (!canRead) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="Bạn không có quyền truy cập module Nhóm làm việc (yêu cầu quyền TEAM_READ)."
        extra={
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            Về trang chủ
          </Button>
        }
      />
    );
  }

  // Calculate summary metrics
  const totalTeams = teams.length;
  const totalActiveMembers = teams.reduce((acc, t) => acc + (t.activeMemberCount || 0), 0);
  const teamsWithLeader = teams.filter((t) => !!t.currentLeader).length;

  const columns = [
    {
      title: 'Nhóm làm việc',
      key: 'name',
      render: (_: any, record: TeamListItem) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>
            {record.name}
          </Text>
          {record.description && (
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Mã nhóm',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Tag color="geekblue">{code}</Tag>,
    },
    {
      title: 'Phòng ban',
      dataIndex: 'department',
      key: 'department',
      render: (dept: TeamDepartment) => {
        const conf = DEPARTMENT_LABELS[dept] || { label: dept, color: 'default' };
        return <Tag color={conf.color}>{conf.label}</Tag>;
      },
    },
    {
      title: 'Trưởng nhóm hiện tại',
      key: 'leader',
      render: (_: any, record: TeamListItem) => {
        if (!record.currentLeader) {
          return <Text type="secondary">Chưa bổ nhiệm</Text>;
        }
        return (
          <Space direction="vertical" size={0}>
            <Space size={4}>
              <CrownOutlined style={{ color: '#faad14' }} />
              <Text strong>{record.currentLeader.fullName}</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.currentLeader.employeeCode} {record.currentLeader.positionName ? `• ${record.currentLeader.positionName}` : ''}
            </Text>
          </Space>
        );
      },
    },
    {
      title: 'Thành viên active',
      dataIndex: 'activeMemberCount',
      key: 'activeMemberCount',
      render: (count: number) => (
        <Badge
          count={count}
          showZero
          style={{ backgroundColor: count > 0 ? '#52c41a' : '#d9d9d9' }}
        />
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => (date ? new Date(date).toLocaleDateString('vi-VN') : '—'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: TeamListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/teams/${record.id}`)}
          style={{ padding: 0 }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-fade-in" style={{ padding: '0 8px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
            Quản lý Nhóm làm việc
          </Title>
          <Text type="secondary">
            Cơ cấu tổ chức, phân bổ nhân sự và bổ nhiệm Trưởng nhóm theo mô hình temporal
          </Text>
        </div>
        {canCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => navigate('/teams/new')}
            style={{ borderRadius: 8 }}
          >
            Tạo nhóm mới
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="vmax-card" style={{ borderRadius: 12 }}>
            <Statistic
              title="Tổng số nhóm"
              value={totalTeams}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="vmax-card" style={{ borderRadius: 12 }}>
            <Statistic
              title="Nhóm đã có Trưởng nhóm"
              value={teamsWithLeader}
              suffix={`/ ${totalTeams}`}
              prefix={<CrownOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" className="vmax-card" style={{ borderRadius: 12 }}>
            <Statistic
              title="Thành viên đang hoạt động"
              value={totalActiveMembers}
              prefix={<UsergroupAddOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters & Table */}
      <Card variant="borderless" className="vmax-card" style={{ borderRadius: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space wrap size="middle">
            <Input
              placeholder="Tìm kiếm theo tên, mã nhóm..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={fetchTeams}
              style={{ width: 280, borderRadius: 6 }}
              allowClear
            />
            <Select
              placeholder="Chọn phòng ban"
              value={departmentFilter}
              onChange={(val) => setDepartmentFilter(val)}
              allowClear
              style={{ width: 220 }}
            >
              <Select.Option value="SALES">Kinh doanh (SALES)</Select.Option>
              <Select.Option value="DEV">Kỹ thuật (DEV)</Select.Option>
              <Select.Option value="SEO">SEO & Growth (SEO)</Select.Option>
              <Select.Option value="OPERATION">Vận hành (OPERATION)</Select.Option>
            </Select>
            <Button
              icon={<SearchOutlined />}
              onClick={fetchTeams}
              style={{ borderRadius: 6 }}
            >
              Tìm kiếm
            </Button>
          </Space>

          <Button
            icon={<ReloadOutlined />}
            onClick={fetchTeams}
            loading={loading}
            style={{ borderRadius: 6 }}
          >
            Làm mới
          </Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={teams}
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Chưa có nhóm làm việc nào' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/teams/${record.id}`)}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Tổng số ${total} nhóm`,
          }}
        />
      </Card>
    </div>
  );
};
