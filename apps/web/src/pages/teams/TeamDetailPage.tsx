import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Descriptions,
  Button,
  Spin,
  Alert,
  Tabs,
  Table,
  Space,
  Modal,
  Form,
  Select,
  message,
  Statistic,
} from 'antd';
import {
  ArrowLeftOutlined,
  TeamOutlined,
  CrownOutlined,
  UserAddOutlined,
  SwapOutlined,
  HistoryOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuthStore } from '../../store/authStore';
import {
  getTeamById,
  getTeamMembers,
  getTeamHistory,
  assignMember,
  moveMember,
  changeLeader,
  getTeams,
  TeamDetailResponse,
  TeamMemberItem,
  TeamListItem,
  TeamDepartment,
} from '../../api/teams';
import { createRowNavigateHandler } from '../../utils/tableUtils';
import { getEmployees, EmployeeItem } from '../../api/employees';
import {
  DetailPageHeader,
  DetailSummaryCard,
  DetailSummaryGrid,
  DetailInfoCard,
  DetailRelatedList,
} from '../../components/common/detail';

const { Title, Text, Paragraph } = Typography;

const DEPARTMENT_LABELS: Record<TeamDepartment, { label: string; color: string }> = {
  SALES: { label: 'Kinh doanh (SALES)', color: 'magenta' },
  DEV: { label: 'Kỹ thuật (DEV)', color: 'blue' },
  SEO: { label: 'SEO & Growth (SEO)', color: 'green' },
  OPERATION: { label: 'Vận hành (OPERATION)', color: 'orange' },
};

export const TeamDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamDetailResponse | null>(null);
  const [activeMembers, setActiveMembers] = useState<TeamMemberItem[]>([]);
  const [historyMembers, setHistoryMembers] = useState<TeamMemberItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isLeaderModalOpen, setIsLeaderModalOpen] = useState(false);

  // Candidate options for modals
  const [eligibleEmployees, setEligibleEmployees] = useState<EmployeeItem[]>([]);
  const [targetTeams, setTargetTeams] = useState<TeamListItem[]>([]);
  const [selectedMemberForMove, setSelectedMemberForMove] = useState<TeamMemberItem | null>(null);

  const [addForm] = Form.useForm();
  const [moveForm] = Form.useForm();
  const [leaderForm] = Form.useForm();
  const [actionLoading, setActionLoading] = useState(false);

  // Permissions check
  const permissions = user?.permissions || [];
  const roles = user?.roles || [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') || roles.includes('BOSS');
  const canRead = isAdmin || permissions.includes('TEAM_READ');
  const canAssign = isAdmin || permissions.includes('TEAM_ASSIGN_MEMBER');
  const canUpdate = isAdmin || permissions.includes('TEAM_UPDATE');

  // Lấy chi tiết nhóm làm việc - chỉ hiện màn hình chờ lần đầu tiên
  const fetchDetail = async (teamId: string, isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const [teamRes, membersRes, historyRes] = await Promise.all([
        getTeamById(teamId),
        getTeamMembers(teamId),
        getTeamHistory(teamId),
      ]);
      setTeam(teamRes);
      setActiveMembers(membersRes);
      setHistoryMembers(historyRes);
    } catch (err: any) {
      console.error(err);
      if (isInitial) {
        setError(err.message || 'Không thể tải thông tin nhóm làm việc');
      } else {
        message.error(err.message || 'Không thể đồng bộ thông tin nhóm');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchDetail(id, true);
  }, [id]);

  // Load eligible candidates for Add Member
  const openAddMemberModal = async () => {
    if (!team) return;
    try {
      setActionLoading(true);
      // Fetch active/probation employees in the same department
      const res = await getEmployees({
        department: team.department,
        limit: 100,
      });
      // Filter out employees who are already active in this team
      const currentMemberEmpIds = new Set(activeMembers.map((m) => m.employeeId));
      const candidates = (res.data || []).filter(
        (e) =>
          !currentMemberEmpIds.has(e.id) &&
          (e.status === 'ACTIVE' || e.status === 'PROBATION'),
      );
      setEligibleEmployees(candidates);
      addForm.resetFields();
      setIsAddModalOpen(true);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải danh sách nhân viên ứng viên');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Add Member submit
  const handleAddMemberSubmit = async () => {
    if (!id) return;
    try {
      const values = await addForm.validateFields();
      setActionLoading(true);
      await assignMember(id, {
        employeeId: values.employeeId,
      });
      message.success('Thêm thành viên vào nhóm thành công');
      setIsAddModalOpen(false);
      await fetchDetail(id, false);
    } catch (err: any) {
      message.error(err.message || 'Thêm thành viên thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Move Member modal
  const openMoveModal = async (member: TeamMemberItem) => {
    if (!team) return;
    setSelectedMemberForMove(member);
    try {
      setActionLoading(true);
      // Fetch teams in the same department
      const res = await getTeams({
        department: team.department,
      });
      // Filter out current team
      const otherTeams = (res.data || []).filter((t) => t.id !== id);
      setTargetTeams(otherTeams);
      moveForm.resetFields();
      setIsMoveModalOpen(true);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải danh sách nhóm đích');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Move Member submit
  const handleMoveMemberSubmit = async () => {
    if (!id || !selectedMemberForMove) return;
    try {
      const values = await moveForm.validateFields();
      setActionLoading(true);
      await moveMember(id, {
        employeeId: selectedMemberForMove.employeeId,
        targetTeamId: values.targetTeamId,
      });
      message.success(
        `Đã chuyển nhân viên ${selectedMemberForMove.fullName} sang nhóm mới (bảo toàn temporal history).`,
      );
      setIsMoveModalOpen(false);
      await fetchDetail(id, false);
    } catch (err: any) {
      message.error(err.message || 'Chuyển nhóm thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Change Leader modal
  const openChangeLeaderModal = async () => {
    if (!team) return;
    try {
      setActionLoading(true);
      // Eligible position codes for Leader
      let eligiblePosCode = 'SALES_TEAM_LEADER';
      if (team.department === 'DEV') eligiblePosCode = 'DEV_TEAM_LEADER';
      if (team.department === 'SEO') eligiblePosCode = 'SEO_TEAM_LEADER';

      const res = await getEmployees({
        positionCode: eligiblePosCode,
        department: team.department,
        limit: 100,
      });

      // Allow choosing candidate with suitable position
      const candidates = (res.data || []).filter(
        (e) => e.status === 'ACTIVE' || e.status === 'PROBATION',
      );
      setEligibleEmployees(candidates);
      leaderForm.resetFields();
      setIsLeaderModalOpen(true);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải danh sách ứng viên Trưởng nhóm');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Change Leader submit
  const handleChangeLeaderSubmit = async () => {
    if (!id) return;
    try {
      const values = await leaderForm.validateFields();
      setActionLoading(true);
      await changeLeader(id, {
        newLeaderEmployeeId: values.newLeaderEmployeeId,
      });
      message.success('Bổ nhiệm / Thay đổi Trưởng nhóm thành công (bảo toàn lịch sử cũ)!');
      setIsLeaderModalOpen(false);
      await fetchDetail(id, false);
    } catch (err: any) {
      message.error(err.message || 'Thay đổi Trưởng nhóm thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#666' }}>Đang tải thông tin nhóm làm việc...</div>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div style={{ maxWidth: 800, margin: '24px auto', padding: '0 16px' }}>
        <Alert
          type="error"
          message="Không thể truy cập nhóm làm việc"
          description={error || 'Nhóm làm việc không tồn tại hoặc bạn không có quyền xem nhóm này.'}
          showIcon
        />
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/teams')}>Quay lại danh sách nhóm</Button>
        </div>
      </div>
    );
  }

  const deptConf = DEPARTMENT_LABELS[team.department] || {
    label: team.department,
    color: 'default',
  };

  const activeColumns = [
    {
      title: 'Mã NV',
      dataIndex: 'employeeCode',
      key: 'employeeCode',
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Họ và tên',
      key: 'fullName',
      render: (_: any, r: TeamMemberItem) => (
        <div>
          <Text strong>{r.fullName}</Text>
          {r.phone && <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.phone}</div>}
        </div>
      ),
    },
    {
      title: 'Chức vụ',
      key: 'position',
      render: (_: any, r: TeamMemberItem) =>
        r.positionName ? `${r.positionName} (${r.positionCode})` : '—',
    },
    {
      title: 'Vai trò trong nhóm',
      key: 'isLeader',
      render: (_: any, r: TeamMemberItem) =>
        r.isLeader ? (
          <Tag color="gold" icon={<CrownOutlined />}>
            Trưởng nhóm
          </Tag>
        ) : (
          <Tag color="default">Thành viên</Tag>
        ),
    },
    {
      title: 'Ngày vào nhóm',
      dataIndex: 'effectiveFrom',
      key: 'effectiveFrom',
      render: (date: string | null) => (date ? dayjs(date).format('DD/MM/YYYY HH:mm') : 'Ban đầu'),
    },
    {
      title: 'Trạng thái NV',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) =>
        s === 'ACTIVE' ? (
          <Tag color="success">Đang làm việc</Tag>
        ) : s === 'PROBATION' ? (
          <Tag color="warning">Thử việc</Tag>
        ) : (
          <Tag>{s}</Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, r: TeamMemberItem) => (
        <Space size="middle">
          {canAssign && (
            <Button
              type="link"
              icon={<SwapOutlined />}
              onClick={() => openMoveModal(r)}
              style={{ padding: 0 }}
            >
              Chuyển nhóm
            </Button>
          )}
          <Button
            type="link"
            onClick={() => navigate(`/employees/${r.employeeId}`)}
            style={{ padding: 0 }}
          >
            Hồ sơ NV
          </Button>
        </Space>
      ),
    },
  ];

  const historyColumns = [
    {
      title: 'Mã NV',
      dataIndex: 'employeeCode',
      key: 'employeeCode',
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Họ và tên',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Chức vụ',
      key: 'position',
      render: (_: any, r: TeamMemberItem) =>
        r.positionName ? `${r.positionName} (${r.positionCode})` : '—',
    },
    {
      title: 'Vai trò',
      key: 'isLeader',
      render: (_: any, r: TeamMemberItem) =>
        r.isLeader ? (
          <Tag color="gold" icon={<CrownOutlined />}>
            Trưởng nhóm
          </Tag>
        ) : (
          <Tag>Thành viên</Tag>
        ),
    },
    {
      title: 'Bắt đầu (effective_from)',
      dataIndex: 'effectiveFrom',
      key: 'effectiveFrom',
      render: (d: string | null) => (d ? dayjs(d).format('DD/MM/YYYY HH:mm') : 'Ban đầu'),
    },
    {
      title: 'Kết thúc (effective_to)',
      dataIndex: 'effectiveTo',
      key: 'effectiveTo',
      render: (d: string | null) =>
        d ? dayjs(d).format('DD/MM/YYYY HH:mm') : <Tag color="success">Hiện tại</Tag>,
    },
    {
      title: 'Trạng thái',
      key: 'isCurrent',
      render: (_: any, r: TeamMemberItem) =>
        r.isCurrent ? (
          <Tag color="processing">Đang hoạt động</Tag>
        ) : (
          <Tag color="default">Đã kết thúc</Tag>
        ),
    },
  ];

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={team.name}
        code={team.code}
        icon={<TeamOutlined />}
        status={<Tag color={deptConf.color}>{deptConf.label}</Tag>}
        onBack={() => navigate('/teams')}
        backLabel="Quay lại danh sách nhóm"
        metaTags={
          <Space size={16} wrap>
            <span>
              Trưởng nhóm:{' '}
              <Text strong style={{ color: team.currentLeader ? '#0C6B37' : undefined }}>
                {team.currentLeader ? team.currentLeader.fullName : 'Chưa bổ nhiệm'}
              </Text>
            </span>
            <span>
              Thành viên: <Text strong>{team.activeMemberCount} nhân sự</Text>
            </span>
            <span>Phòng ban: <Tag color="cyan">{team.department}</Tag></span>
          </Space>
        }
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/teams')}>
              Quay lại
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => fetchDetail(id!)}>
              Làm mới
            </Button>
            {canUpdate && (
              <Button
                icon={<CrownOutlined />}
                onClick={openChangeLeaderModal}
                style={{ borderColor: '#faad14', color: '#d48806' }}
              >
                Thay Trưởng nhóm
              </Button>
            )}
            {canAssign && (
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                onClick={openAddMemberModal}
              >
                Thêm thành viên
              </Button>
            )}
          </Space>
        }
      />

      {/* KPI Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="THÀNH VIÊN HOẠT ĐỘNG"
          value={`${team.activeMemberCount} nhân sự`}
          valueColor="#0C6B37"
          icon={<TeamOutlined />}
          subtitle="Đang làm việc tại nhóm hiện tại"
        />
        <DetailSummaryCard
          title="TRƯỞNG NHÓM (LEADER)"
          value={team.currentLeader ? team.currentLeader.fullName : 'Chưa bổ nhiệm'}
          icon={<CrownOutlined />}
          subtitle={
            team.currentLeader
              ? `${team.currentLeader.employeeCode} • ${team.currentLeader.positionName || 'Leader'}`
              : 'Cần bổ nhiệm Trưởng nhóm phụ trách'
          }
        />
        <DetailSummaryCard
          title="PHÒNG BAN QUẢN LÝ"
          value={deptConf.label}
          icon={<CheckCircleOutlined />}
          subtitle={`Mã nhận diện nhóm: ${team.code}`}
        />
        <DetailSummaryCard
          title="LƯỢT NHÂN SỰ LỊCH SỬ"
          value={`${team.totalHistoricalMemberCount} lượt`}
          icon={<HistoryOutlined />}
          subtitle="Bảo toàn lịch sử phân công & luân chuyển"
        />
      </DetailSummaryGrid>

      {/* Two-Column Responsive Layout */}
      <div className="vmax-detail-layout">
        {/* Main Column */}
        <div className="vmax-detail-main">
          <div className="vmax-card" style={{ padding: '8px 20px 20px 20px', marginBottom: 20 }}>
            <Tabs
              defaultActiveKey="active"
              items={[
                {
                  key: 'active',
                  label: (
                    <Space>
                      <TeamOutlined />
                      <span>Thành viên hoạt động ({activeMembers.length})</span>
                    </Space>
                  ),
                  children: (
                    <Table
                      rowKey="membershipId"
                      columns={activeColumns}
                      dataSource={activeMembers}
                      scroll={{ x: 'max-content' }}
                      locale={{ emptyText: 'Chưa có thành viên nào đang hoạt động' }}
                      onRow={createRowNavigateHandler(navigate, (record) => `/employees/${record.employeeId}`)}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                    />
                  ),
                },
                {
                  key: 'history',
                  label: (
                    <Space>
                      <HistoryOutlined />
                      <span>Lịch sử luân chuyển ({historyMembers.length})</span>
                    </Space>
                  ),
                  children: (
                    <Table
                      rowKey="membershipId"
                      columns={historyColumns}
                      dataSource={historyMembers}
                      scroll={{ x: 'max-content' }}
                      locale={{ emptyText: 'Chưa có dữ liệu lịch sử luân chuyển' }}
                      onRow={createRowNavigateHandler(navigate, (record) => `/employees/${record.employeeId}`)}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                    />
                  ),
                },
              ]}
            />
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="vmax-detail-side">
          <DetailInfoCard
            title="Thông tin nhóm làm việc"
            columns={1}
            items={[
              { label: 'Tên nhóm', value: <Text strong>{team.name}</Text> },
              { label: 'Mã nhóm', value: <Tag color="geekblue">{team.code}</Tag> },
              { label: 'Phòng ban', value: <Tag color={deptConf.color}>{deptConf.label}</Tag> },
              { label: 'Mô tả', value: team.description || <Text type="secondary">Chưa có mô tả</Text> },
            ]}
          />

          <DetailInfoCard
            title="Trưởng nhóm (Leader)"
            columns={1}
            items={
              team.currentLeader
                ? [
                    {
                      label: 'Họ và tên',
                      value: (
                        <Space>
                          <CrownOutlined style={{ color: '#D97706' }} />
                          <Text strong>{team.currentLeader.fullName}</Text>
                        </Space>
                      ),
                    },
                    { label: 'Mã nhân viên', value: team.currentLeader.employeeCode },
                    { label: 'Chức danh', value: team.currentLeader.positionName || 'Trưởng nhóm' },
                    {
                      label: 'Hồ sơ nhân sự',
                      value: (
                        <Button
                          type="link"
                          style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                          onClick={() => navigate(`/employees/${team.currentLeader!.id}`)}
                        >
                          Xem hồ sơ Trưởng nhóm
                        </Button>
                      ),
                    },
                  ]
                : [
                    {
                      label: 'Trạng thái',
                      value: <Text type="secondary">Chưa bổ nhiệm Trưởng nhóm</Text>,
                    },
                  ]
            }
          />

          <DetailInfoCard
            title="Nghiệp vụ liên quan"
            columns={1}
            items={[
              {
                label: 'Báo cáo công việc (Daily)',
                value: (
                  <Button
                    type="link"
                    style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                    onClick={() => navigate('/daily-reports')}
                  >
                    Xem báo cáo hàng ngày
                  </Button>
                ),
              },
              {
                label: 'Dự án triển khai (Projects)',
                value: (
                  <Button
                    type="link"
                    style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                    onClick={() => navigate('/projects')}
                  >
                    Xem danh sách dự án
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* MODAL 1: Thêm thành viên */}
      <Modal
        title={
          <Space>
            <UserAddOutlined style={{ color: '#1677ff' }} />
            <span>Thêm thành viên vào nhóm</span>
          </Space>
        }
        open={isAddModalOpen}
        onOk={handleAddMemberSubmit}
        onCancel={() => setIsAddModalOpen(false)}
        confirmLoading={actionLoading}
        okText="Thêm vào nhóm"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Paragraph type="secondary">
          Chỉ nhân viên thuộc phòng ban <strong>{team.department}</strong> chưa thuộc nhóm này mới
          hiển thị trong danh sách.
        </Paragraph>
        <Form form={addForm} layout="vertical" className="vmax-form">
          <Form.Item
            name="employeeId"
            label="Chọn nhân viên"
            rules={[{ required: true, message: 'Vui lòng chọn nhân viên' }]}
          >
            <Select
              placeholder="-- Tìm theo mã hoặc tên nhân viên --"
              showSearch
              filterOption={(input, option: any) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={eligibleEmployees.map((e) => ({
                value: e.id,
                label: `${e.employee_code} - ${e.full_name} (${e.position?.name || 'Không có chức danh'})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL 2: Chuyển nhóm cho thành viên */}
      <Modal
        title={
          <Space>
            <SwapOutlined style={{ color: '#1677ff' }} />
            <span>Chuyển nhóm cho nhân viên</span>
          </Space>
        }
        open={isMoveModalOpen}
        onOk={handleMoveMemberSubmit}
        onCancel={() => setIsMoveModalOpen(false)}
        confirmLoading={actionLoading}
        okText="Xác nhận chuyển nhóm"
        cancelText="Hủy"
        destroyOnHidden
      >
        {selectedMemberForMove && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Nhân viên:</Text> {selectedMemberForMove.fullName} (
            {selectedMemberForMove.employeeCode})
            <br />
            <Text strong>Nhóm hiện tại:</Text> {team.name} ({team.code})
          </div>
        )}
        <Paragraph type="secondary">
          Thao tác chuyển nhóm sẽ đóng membership hiện tại ở thời điểm hiện tại và tạo membership mới
          ở nhóm đích. Lịch sử phân bổ của nhân viên được bảo toàn đầy đủ.
        </Paragraph>
        <Form form={moveForm} layout="vertical" className="vmax-form">
          <Form.Item
            name="targetTeamId"
            label="Chọn nhóm làm việc mới"
            rules={[{ required: true, message: 'Vui lòng chọn nhóm đích' }]}
          >
            <Select
              placeholder="-- Chọn nhóm làm việc cùng phòng ban --"
              options={targetTeams.map((t) => ({
                value: t.id,
                label: `${t.code} - ${t.name} (${t.activeMemberCount} thành viên)`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL 3: Bổ nhiệm / Thay đổi Trưởng nhóm */}
      <Modal
        title={
          <Space>
            <CrownOutlined style={{ color: '#faad14' }} />
            <span>Bổ nhiệm / Thay đổi Trưởng nhóm</span>
          </Space>
        }
        open={isLeaderModalOpen}
        onOk={handleChangeLeaderSubmit}
        onCancel={() => setIsLeaderModalOpen(false)}
        confirmLoading={actionLoading}
        okText="Bổ nhiệm Trưởng nhóm"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Paragraph type="secondary">
          Quy tắc nghiệp vụ: Chỉ nhân sự giữ chức vụ Trưởng nhóm tương ứng (ví dụ{' '}
          <strong>SALES_TEAM_LEADER</strong> cho nhóm SALES, <strong>DEV_TEAM_LEADER</strong> cho
          nhóm DEV, <strong>SEO_TEAM_LEADER</strong> cho nhóm SEO) mới đủ điều kiện bổ nhiệm. Nếu
          đang có Trưởng nhóm cũ, hệ thống sẽ kết thúc nhiệm kỳ cũ và lưu vào lịch sử.
        </Paragraph>
        <Form form={leaderForm} layout="vertical" className="vmax-form">
          <Form.Item
            name="newLeaderEmployeeId"
            label="Chọn ứng viên Trưởng nhóm"
            rules={[{ required: true, message: 'Vui lòng chọn ứng viên Trưởng nhóm' }]}
          >
            <Select
              placeholder="-- Chọn nhân viên có chức danh Trưởng nhóm --"
              showSearch
              filterOption={(input, option: any) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={eligibleEmployees.map((e) => ({
                value: e.id,
                label: `${e.employee_code} - ${e.full_name} (${e.position?.name || e.position?.code})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
