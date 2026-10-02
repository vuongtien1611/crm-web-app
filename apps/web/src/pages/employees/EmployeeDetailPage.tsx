import React, { useState, useEffect } from 'react';
import {
  Typography,
  Tag,
  Button,
  Spin,
  Alert,
  Space,
  Table,
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  CalendarOutlined,
  IdcardOutlined,
  TeamOutlined,
  LockOutlined,
  CheckCircleOutlined,
  StopOutlined,
  CrownOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { getEmployeeById, EmployeeDetailResponse } from '../../api/employees';
import { createRowNavigateHandler } from '../../utils/tableUtils';
import { useAuthStore } from '../../store/authStore';
import {
  DetailPageHeader,
  DetailSummaryCard,
  DetailSummaryGrid,
  DetailInfoCard,
  DetailRelatedList,
} from '../../components/common/detail';
import { PromoteDemoteModal } from '../../components/employees/PromoteDemoteModal';

const { Title, Text } = Typography;

const DEPARTMENT_LABELS: Record<string, string> = {
  SALES: 'Kinh doanh',
  DEV: 'Phát triển phần mềm',
  SEO: 'SEO / Marketing',
  OPERATION: 'Vận hành',
};

export const EmployeeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EmployeeDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canViewFinancials = user?.roles?.some((r) =>
    ['BOSS', 'ADMIN', 'ACCOUNTANT'].includes(r)
  );
  const isBossOrAdmin = user?.roles?.some((r) => ['BOSS', 'ADMIN'].includes(r));
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchDetail(id);
  }, [id]);

  const fetchDetail = async (employeeId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEmployeeById(employeeId);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load employee detail:', err);
      setError(
        err?.response?.data?.message ||
          'Không thể tải thông tin nhân viên. Vui lòng thử lại sau.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="vmax-detail-page" style={{ padding: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/employees')}
          style={{ marginBottom: 16 }}
        >
          Quay lại danh sách
        </Button>
        <Alert
          type="error"
          showIcon
          message="Lỗi"
          description={error || 'Không tìm thấy thông tin nhân viên.'}
        />
      </div>
    );
  }

  const { employee, account, position, roles, currentTeam } = data;

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={employee.full_name}
        code={employee.employee_code}
        icon={<UserOutlined />}
        status={
          <Tag color={employee.status === 'ACTIVE' ? 'success' : 'default'}>
            {employee.status === 'ACTIVE' ? 'ĐANG LÀM VIỆC' : employee.status}
          </Tag>
        }
        onBack={() => navigate('/employees')}
        backLabel="Quay lại danh sách"
        metaTags={
          <Space size={16} wrap>
            <span>
              Chức vụ: <Tag color="purple">{position ? `${position.name}` : 'Chưa phân'}</Tag>
            </span>
            <span>
              Nhóm: <Tag color="cyan">{currentTeam ? currentTeam.name : 'Chưa tham gia'}</Tag>
            </span>
            <span>
              Ngày vào: <Text strong>{employee.hire_date ? dayjs(employee.hire_date).format('DD/MM/YYYY') : '—'}</Text>
            </span>
          </Space>
        }
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/employees')}>
              Quay lại
            </Button>
            {isBossOrAdmin && (
              <Button
                type="primary"
                icon={<CrownOutlined />}
                onClick={() => setPromoteModalOpen(true)}
                style={{
                  backgroundColor: '#D97706',
                  borderColor: '#D97706',
                  fontWeight: 600,
                }}
              >
                Tăng / Giáng chức
              </Button>
            )}
            {canViewFinancials && (
              <>
                <Button
                  icon={<DollarCircleOutlined />}
                  onClick={() => navigate(`/commissions`)}
                >
                  Hoa hồng
                </Button>
                <Button
                  icon={<FileTextOutlined />}
                  onClick={() => navigate(`/payroll`)}
                >
                  Bảng lương
                </Button>
              </>
            )}
          </Space>
        }
      />

      {/* KPI Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="HỌ VÀ TÊN NHÂN SỰ"
          value={employee.full_name}
          icon={<UserOutlined />}
          subtitle={`Mã nhân viên: ${employee.employee_code}`}
        />
        <DetailSummaryCard
          title="CHỨC VỤ & VAI TRÒ"
          value={position ? position.name : 'Chưa gán chức vụ'}
          valueColor="#0C6B37"
          icon={<IdcardOutlined />}
          subtitle={`${roles?.length || 0} vai trò quyền hạn được cấp`}
        />
        <DetailSummaryCard
          title="NHÓM LÀM VIỆC"
          value={currentTeam ? currentTeam.name : 'Chưa phân nhóm'}
          icon={<TeamOutlined />}
          subtitle={
            currentTeam
              ? currentTeam.isLeader
                ? 'Đảm nhiệm vai trò Trưởng nhóm'
                : 'Thành viên trực thuộc'
              : 'Chưa có phân công nhóm'
          }
        />
        <DetailSummaryCard
          title="TÀI KHOẢN HỆ THỐNG"
          value={
            account
              ? account.user_status === 'ACTIVE'
                ? 'Đang hoạt động'
                : account.user_status
              : 'Chưa cấp tài khoản'
          }
          valueColor={account?.user_status === 'ACTIVE' ? '#0C6B37' : '#DC2626'}
          icon={<LockOutlined />}
          subtitle={account ? `User: ${account.username}` : 'Chưa liên kết tài khoản'}
        />
      </DetailSummaryGrid>

      {/* Two-Column Responsive Layout */}
      <div className="vmax-detail-layout">
        {/* Main Column */}
        <div className="vmax-detail-main">
          {/* CÔNG VIỆC, CHỨC VỤ & VAI TRÒ */}
          <DetailInfoCard
            title="Công việc, Chức vụ & Vai trò"
            columns={2}
            items={[
              {
                label: 'Chức vụ (Position)',
                value: position ? (
                  <Space>
                    <Text strong>{position.name}</Text>
                    <Tag color="purple">{position.code}</Tag>
                  </Space>
                ) : (
                  <Text type="secondary">Chưa gán chức vụ</Text>
                ),
              },
              {
                label: 'Nhóm trực thuộc',
                value: currentTeam ? (
                  <Space>
                    <Text strong>{currentTeam.name}</Text>
                    {currentTeam.isLeader && (
                      <Tag color="gold" icon={<CrownOutlined />}>
                        Trưởng nhóm
                      </Tag>
                    )}
                  </Space>
                ) : (
                  <Text type="secondary">Chưa tham gia nhóm</Text>
                ),
              },
              {
                label: 'Phòng ban trực thuộc',
                value: currentTeam ? (
                  <Tag color="cyan">
                    {DEPARTMENT_LABELS[currentTeam.department] || currentTeam.department}
                  </Tag>
                ) : (
                  '—'
                ),
              },
              {
                label: 'Vai trò hệ thống (Roles)',
                span: 2,
                value:
                  roles && roles.length > 0 ? (
                    <Space wrap>
                      {roles.map((r) => (
                        <Tag color="blue" key={r.id}>
                          {r.name} ({r.code})
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Text type="secondary">Chưa gán vai trò</Text>
                  ),
              },
            ]}
          />

          {/* LỊCH SỬ THAM GIA NHÓM LÀM VIỆC */}
          <div style={{ marginTop: 20 }}>
            <DetailRelatedList
              title="Lịch sử tham gia nhóm làm việc"
              count={data.teamHistory?.length || 0}
            >
              <Table
                rowKey="membershipId"
                dataSource={data.teamHistory || []}
                pagination={false}
                scroll={{ x: 'max-content' }}
                onRow={createRowNavigateHandler(navigate, (record: any) =>
                  record.teamId ? `/teams/${record.teamId}` : null
                )}
                columns={[
                  {
                    title: 'Nhóm làm việc',
                    key: 'team',
                    render: (_: any, record: any) => (
                      <Space direction="vertical" size={0}>
                        <Text strong style={{ color: '#0F172A' }}>{record.teamName}</Text>
                        <Tag>{record.teamCode}</Tag>
                      </Space>
                    ),
                  },
                  {
                    title: 'Phòng ban',
                    dataIndex: 'department',
                    key: 'department',
                    render: (dept: string) => (
                      <Tag color="cyan">{DEPARTMENT_LABELS[dept] || dept}</Tag>
                    ),
                  },
                  {
                    title: 'Vai trò',
                    key: 'isLeader',
                    render: (_: any, record: any) =>
                      record.isLeader ? (
                        <Tag color="gold" icon={<CrownOutlined />}>
                          Trưởng nhóm
                        </Tag>
                      ) : (
                        <Tag>Thành viên</Tag>
                      ),
                  },
                  {
                    title: 'Từ ngày',
                    dataIndex: 'effectiveFrom',
                    key: 'effectiveFrom',
                    render: (d: string | null) =>
                      d ? dayjs(d).format('DD/MM/YYYY HH:mm') : 'Ban đầu',
                  },
                  {
                    title: 'Đến ngày',
                    dataIndex: 'effectiveTo',
                    key: 'effectiveTo',
                    render: (d: string | null) =>
                      d ? (
                        dayjs(d).format('DD/MM/YYYY HH:mm')
                      ) : (
                        <Tag color="success">Hiện tại</Tag>
                      ),
                  },
                  {
                    title: 'Trạng thái',
                    key: 'status',
                    render: (_: any, record: any) =>
                      record.isCurrent ? (
                        <Tag color="processing">Đang hoạt động</Tag>
                      ) : (
                        <Tag color="default">Đã chuyển / Kết thúc</Tag>
                      ),
                  },
                ]}
              />
            </DetailRelatedList>
          </div>

          {/* LỊCH SỬ CHỨC VỤ & BỔ NHIỆM */}
          <div style={{ marginTop: 20 }}>
            <DetailRelatedList
              title="Lịch sử chức vụ & Quyết định bổ nhiệm"
              count={data.positionHistory?.length || 0}
            >
              <Table
                rowKey="historyId"
                dataSource={data.positionHistory || []}
                pagination={false}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: 'Chưa có lịch sử thay đổi chức vụ' }}
                columns={[
                  {
                    title: 'Chức vụ',
                    key: 'position',
                    width: 200,
                    render: (_: any, record: any) => (
                      <Space>
                        <Text strong>{record.positionName}</Text>
                        <Tag color="purple">{record.positionCode}</Tag>
                      </Space>
                    ),
                  },
                  {
                    title: 'Căn cứ / Ghi chú quyết định',
                    dataIndex: 'note',
                    key: 'note',
                    render: (note: string | null) =>
                      note ? <Text style={{ fontSize: 13 }}>{note}</Text> : <Text type="secondary">—</Text>,
                  },
                  {
                    title: 'Từ ngày',
                    dataIndex: 'effectiveFrom',
                    key: 'effectiveFrom',
                    width: 150,
                    render: (d: string | null) =>
                      d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—',
                  },
                  {
                    title: 'Đến ngày',
                    dataIndex: 'effectiveTo',
                    key: 'effectiveTo',
                    width: 150,
                    render: (d: string | null) =>
                      d ? dayjs(d).format('DD/MM/YYYY HH:mm') : <Tag color="success">Hiện tại</Tag>,
                  },
                  {
                    title: 'Trạng thái',
                    key: 'status',
                    width: 130,
                    render: (_: any, record: any) =>
                      record.isCurrent ? (
                        <Tag color="processing">Đang giữ chức</Tag>
                      ) : (
                        <Tag color="default">Đã kết thúc</Tag>
                      ),
                  },
                ]}
              />
            </DetailRelatedList>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="vmax-detail-side">
          {/* THÔNG TIN CÁ NHÂN */}
          <DetailInfoCard
            title="Thông tin cá nhân"
            columns={1}
            items={[
              { label: 'Mã nhân viên', value: <Text strong>{employee.employee_code}</Text> },
              { label: 'Họ và tên', value: <Text strong>{employee.full_name}</Text> },
              {
                label: 'Số điện thoại',
                value: employee.phone ? (
                  <a href={`tel:${employee.phone}`} style={{ color: '#0C6B37', fontWeight: 500 }}>
                    <PhoneOutlined style={{ marginRight: 6 }} />
                    {employee.phone}
                  </a>
                ) : (
                  <Text type="secondary">Chưa cập nhật</Text>
                ),
              },
              {
                label: 'Ngày vào làm',
                value: employee.hire_date
                  ? dayjs(employee.hire_date).format('DD/MM/YYYY')
                  : <Text type="secondary">Chưa cập nhật</Text>,
              },
              {
                label: 'Trạng thái nhân sự',
                value: (
                  <Tag color={employee.status === 'ACTIVE' ? 'success' : 'default'}>
                    {employee.status === 'ACTIVE' ? 'Đang làm việc' : employee.status}
                  </Tag>
                ),
              },
              {
                label: 'Ngày tạo hồ sơ',
                value: employee.created_at
                  ? dayjs(employee.created_at).format('DD/MM/YYYY HH:mm')
                  : '—',
              },
            ]}
          />

          {/* TÀI KHOẢN ĐĂNG NHẬP */}
          <DetailInfoCard
            title="Tài khoản đăng nhập"
            columns={1}
            items={
              account
                ? [
                    {
                      label: 'Tên đăng nhập',
                      value: <Text strong copyable>{account.username}</Text>,
                    },
                    {
                      label: 'Email liên kết',
                      value: (
                        <Space>
                          <MailOutlined style={{ color: '#64748b' }} />
                          <Text copyable>{account.email}</Text>
                        </Space>
                      ),
                    },
                    {
                      label: 'Trạng thái tài khoản',
                      value:
                        account.user_status === 'ACTIVE' ? (
                          <Tag color="success" icon={<CheckCircleOutlined />}>
                            HOẠT ĐỘNG
                          </Tag>
                        ) : (
                          <Tag color="error" icon={<StopOutlined />}>
                            {account.user_status}
                          </Tag>
                        ),
                    },
                    {
                      label: 'Đổi mật khẩu lần đầu',
                      value: account.must_change_password ? (
                        <Tag color="warning">Bắt buộc</Tag>
                      ) : (
                        <Tag color="default">Không</Tag>
                      ),
                    },
                    {
                      label: 'Ngày tạo tài khoản',
                      value: account.created_at
                        ? dayjs(account.created_at).format('DD/MM/YYYY HH:mm')
                        : '—',
                    },
                  ]
                : [
                    {
                      label: 'Trạng thái',
                      value: <Text type="secondary">Chưa liên kết tài khoản hệ thống</Text>,
                    },
                  ]
            }
          />

          {/* TIỆN ÍCH / LIÊN KẾT NHANH */}
          {canViewFinancials && (
            <DetailInfoCard
              title="Liên kết nghiệp vụ"
              columns={1}
              items={[
                {
                  label: 'Hoa hồng & Doanh số',
                  value: (
                    <Button
                      type="link"
                      icon={<DollarCircleOutlined />}
                      style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                      onClick={() => navigate('/commissions')}
                    >
                      Xem hoa hồng nhân viên
                    </Button>
                  ),
                },
                {
                  label: 'Bảng lương & Thu nhập',
                  value: (
                    <Button
                      type="link"
                      icon={<FileTextOutlined />}
                      style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                      onClick={() => navigate('/payroll')}
                    >
                      Xem bảng lương
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* Modal Tăng / Giáng chức */}
      <PromoteDemoteModal
        isOpen={promoteModalOpen}
        employee={{
          id: employee.id,
          employee_code: employee.employee_code,
          full_name: employee.full_name,
          position: position,
          currentTeam: currentTeam,
        }}
        onClose={() => setPromoteModalOpen(false)}
        onSuccess={() => fetchDetail(employee.id)}
      />
    </div>
  );
};

export default EmployeeDetailPage;

