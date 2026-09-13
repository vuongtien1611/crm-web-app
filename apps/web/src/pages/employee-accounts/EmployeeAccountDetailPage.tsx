import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Switch,
  Alert,
  Typography,
  Space,
  Row,
  Col,
  Tag,
  Descriptions,
  Divider,
  App,
  Breadcrumb,
  Table,
  Badge,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  LockOutlined,
  UnlockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  getEmployeeAccountDetailApi,
  updateEmployeeAccountApi,
  EmployeeAccountDetailResponse,
  PasswordResetRequest,
} from '../../api/employeeAccounts';
import { BossPinModal } from '../../components/employee-accounts/BossPinModal';

const { Title, Text, Paragraph } = Typography;

const DEPARTMENT_LABELS: Record<string, string> = {
  SALES: 'Kinh doanh',
  DEV: 'Phát triển phần mềm',
  SEO: 'SEO / Marketing',
  OPERATION: 'Vận hành',
};

export const EmployeeAccountDetailPage: React.FC = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();
  const resetRequestId = searchParams.get('resetRequest');
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<EmployeeAccountDetailResponse | null>(null);
  const [isSessionUnlocked, setIsSessionUnlocked] = useState(false);

  // Forms
  const [form] = Form.useForm();
  const [resetPasswordEnabled, setResetPasswordEnabled] = useState(false);

  // PIN modal
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingSubmitValues, setPendingSubmitValues] = useState<any>(null);

  const loadDetail = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const data = await getEmployeeAccountDetailApi(employeeId, resetRequestId);
      setDetail(data);
      setIsSessionUnlocked(data.isUnlocked);

      // Populate form
      form.setFieldsValue({
        username: data.employee.username,
        isActive: data.employee.account_status === 'ACTIVE',
      });

      // If came from a reset request notification, enable reset password section automatically
      if (resetRequestId || data.pendingResetRequests?.length > 0) {
        setResetPasswordEnabled(true);
      }
    } catch (err: any) {
      message.error(err.message || 'Không thể tải thông tin tài khoản');
    } finally {
      setLoading(false);
    }
  }, [employeeId, resetRequestId, form, message]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const executeUpdate = async (values: any) => {
    if (!employeeId || !detail) return;

    const payload: {
      username?: string;
      accountStatus?: 'ACTIVE' | 'DISABLED';
      newPassword?: string;
    } = {};

    if (values.username && values.username.trim() !== detail.employee.username) {
      payload.username = values.username.trim();
    }

    const desiredStatus = values.isActive ? 'ACTIVE' : 'DISABLED';
    if (desiredStatus !== detail.employee.account_status) {
      payload.accountStatus = desiredStatus;
    }

    if (resetPasswordEnabled && values.newPassword) {
      if (values.newPassword !== values.confirmPassword) {
        message.error('Xác nhận mật khẩu mới không khớp');
        return;
      }
      payload.newPassword = values.newPassword;
    }

    if (Object.keys(payload).length === 0) {
      message.info('Không có thay đổi nào để lưu');
      return;
    }

    setSaving(true);
    try {
      const res = await updateEmployeeAccountApi(employeeId, payload);
      message.success(res.message || 'Cập nhật tài khoản nhân sự thành công');
      form.setFieldsValue({
        newPassword: '',
        confirmPassword: '',
      });
      setResetPasswordEnabled(false);
      setPendingSubmitValues(null);
      await loadDetail();
    } catch (err: any) {
      if (err.code === 'PIN_REQUIRED' || err.status === 403) {
        // Need PIN unlock
        setPendingSubmitValues(values);
        setPinModalOpen(true);
      } else {
        message.error(err.message || 'Cập nhật tài khoản thất bại');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async (values: any) => {
    if (!isSessionUnlocked) {
      // Prompt PIN first
      setPendingSubmitValues(values);
      setPinModalOpen(true);
      return;
    }

    await executeUpdate(values);
  };

  const handlePinSuccess = async () => {
    setIsSessionUnlocked(true);
    setPinModalOpen(false);
    message.success('Mở khóa bảo mật PIN thành công');
    if (pendingSubmitValues) {
      await executeUpdate(pendingSubmitValues);
    }
  };

  if (loading && !detail) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <Card loading />
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <Alert
          type="error"
          message="Không tìm thấy tài khoản nhân sự"
          description="Vui lòng kiểm tra lại đường dẫn hoặc quay lại danh sách."
          action={
            <Button type="primary" onClick={() => navigate('/employee-accounts')}>
              Quay lại danh sách
            </Button>
          }
        />
      </div>
    );
  }

  const { employee, pendingResetRequests, targetResetRequest } = detail;
  const isBossAccount = employee.position_code === 'BOSS';

  const resetRequestColumns = [
    {
      title: 'Mã yêu cầu',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: string) => <span style={{ fontFamily: 'monospace' }}>#{id}</span>,
    },
    {
      title: 'Thời gian gửi',
      dataIndex: 'requested_at',
      key: 'requested_at',
      render: (dateStr: string) => {
        try {
          const d = new Date(dateStr);
          return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
        } catch {
          return dateStr;
        }
      },
    },
    {
      title: 'Địa chỉ IP',
      dataIndex: 'ip_address',
      key: 'ip_address',
      render: (ip: string | null) => ip || 'N/A',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: string) => (
        <Tag color={st === 'PENDING' ? 'processing' : 'success'}>
          {st === 'PENDING' ? 'Chờ cấp lại MK' : 'Đã xử lý'}
        </Tag>
      ),
    },
    {
      title: 'Thời gian xử lý',
      dataIndex: 'resolved_at',
      key: 'resolved_at',
      render: (dateStr: string | null) => {
        if (!dateStr) return '-';
        try {
          const d = new Date(dateStr);
          return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
        } catch {
          return dateStr;
        }
      },
    },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Breadcrumb & Navigation */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            { title: <Link to="/dashboard">Dashboard</Link> },
            { title: <Link to="/employee-accounts">Quản lý tài khoản nhân sự</Link> },
            { title: employee.full_name },
          ]}
        />
      </div>

      {/* Header bar */}
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
        <Space size={12}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/employee-accounts')}
            style={{ borderRadius: 8 }}
          />
          <div>
            <Title level={3} style={{ margin: 0, fontWeight: 800 }}>
              Cập nhật tài khoản: {employee.full_name}
            </Title>
            <Text type="secondary">
              Mã NV: <strong>{employee.employee_code}</strong> | Username:{' '}
              <strong style={{ fontFamily: 'monospace' }}>{employee.username}</strong>
            </Text>
          </div>
        </Space>

        {/* Security PIN status */}
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
                <UnlockOutlined style={{ color: '#52C41A', fontSize: 14 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#389E0D' }}>
                  Đã mở khóa phiên làm việc
                </span>
              </>
            ) : (
              <>
                <LockOutlined style={{ color: '#F5222D', fontSize: 14 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#CF1322' }}>
                  Khóa bảo vệ PIN (Yêu cầu khi lưu)
                </span>
              </>
            )}
          </div>

          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => setPinModalOpen(true)}
            style={{ borderRadius: 8 }}
          >
            {isSessionUnlocked ? 'Đổi mã PIN' : 'Mở khóa PIN ngay'}
          </Button>
        </Space>
      </div>

      {/* Pending Reset Request Alert */}
      {(targetResetRequest || pendingResetRequests.length > 0) && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined style={{ fontSize: 20 }} />}
          style={{ marginBottom: 24, borderRadius: 10, border: '1px solid #FFE58F' }}
          message={
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              Yêu cầu cấp lại mật khẩu đang chờ xử lý ({pendingResetRequests.length} yêu cầu)
            </span>
          }
          description={
            <div style={{ marginTop: 4 }}>
              Nhân viên <strong>{employee.full_name}</strong> ({employee.username}) đã gửi yêu cầu cấp lại tài khoản / mật khẩu từ màn hình đăng nhập.
              Khi Ban Giám Đốc (BOSS) nhập mật khẩu mới và bấm Lưu bên dưới, yêu cầu này sẽ được tự động đánh dấu là <strong>ĐÃ XỬ LÝ (RESOLVED)</strong> và ghi lại nhật ký kiểm toán hệ thống.
            </div>
          }
        />
      )}

      {/* Summary Profile Card */}
      <Card
        className="vmax-card"
        style={{ marginBottom: 24, borderRadius: 12 }}
        title={
          <Space>
            <UserOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />
            <span style={{ fontWeight: 700 }}>Hồ sơ nhân sự liên kết</span>
          </Space>
        }
      >
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="middle">
          <Descriptions.Item label="Họ và tên">
            <strong style={{ fontSize: 15 }}>{employee.full_name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Mã nhân viên">
            <Tag color="blue">{employee.employee_code}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Chức vụ">
            <Tag color={employee.position_code === 'BOSS' ? 'gold' : 'cyan'}>
              {employee.position_name}
            </Tag>
          </Descriptions.Item>

          <Descriptions.Item label="Phòng ban">
            {employee.department ? DEPARTMENT_LABELS[employee.department] || employee.department : 'Chưa phân bổ'}
          </Descriptions.Item>
          <Descriptions.Item label="Team trực thuộc">
            {employee.team_name || 'Không có'}
          </Descriptions.Item>
          <Descriptions.Item label="Email">
            {employee.email}
          </Descriptions.Item>

          <Descriptions.Item label="Số điện thoại">
            {employee.phone || 'Chưa cập nhật'}
          </Descriptions.Item>
          <Descriptions.Item label="Lần đăng nhập gần nhất">
            {employee.last_login_at
              ? new Date(employee.last_login_at).toLocaleString('vi-VN')
              : 'Chưa từng đăng nhập'}
          </Descriptions.Item>
          <Descriptions.Item label="Vai trò hệ thống (Roles)">
            <Space wrap>
              {employee.roles?.map((r) => (
                <Tag key={r} color="geekblue">
                  {r}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Account Settings Form */}
      <Card
        className="vmax-card"
        style={{ marginBottom: 24, borderRadius: 12 }}
        title={
          <Space>
            <KeyOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />
            <span style={{ fontWeight: 700 }}>Thiết lập & Cập nhật Tài khoản</span>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Row gutter={24}>
            {/* Username */}
            <Col xs={24} md={12}>
              <Form.Item
                name="username"
                label={<Text strong>Tên đăng nhập (Username)</Text>}
                extra="Chỉ gồm chữ cái, số, dấu gạch dưới (_), gạch nối (-), dấu chấm (.), độ dài 3-50 ký tự."
                rules={[
                  { required: true, message: 'Vui lòng nhập tên đăng nhập' },
                  {
                    pattern: /^[a-zA-Z0-9_.-]{3,50}$/,
                    message: 'Tên đăng nhập không đúng định dạng (3-50 ký tự, không dấu cách)',
                  },
                ]}
              >
                <Input size="large" prefix={<UserOutlined />} autoComplete="username" />
              </Form.Item>
            </Col>

            {/* Account Status Switch */}
            <Col xs={24} md={12}>
              <Form.Item
                name="isActive"
                valuePropName="checked"
                label={<Text strong>Trạng thái tài khoản</Text>}
                extra={
                  isBossAccount
                    ? 'Tài khoản Giám Đốc (BOSS) không thể vô hiệu hóa.'
                    : 'Bật để cho phép đăng nhập, tắt để tạm khóa truy cập của nhân sự.'
                }
              >
                <Switch
                  checkedChildren="Hoạt động"
                  unCheckedChildren="Tạm khóa"
                  disabled={isBossAccount}
                  style={{
                    backgroundColor: form.getFieldValue('isActive') ? 'var(--vmax-green, #0C6B37)' : undefined,
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0 24px' }} />

          {/* Reset Password Toggle & Section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <Text strong style={{ fontSize: 15, display: 'block' }}>
                  Đặt lại mật khẩu (Reset Password)
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Mật khẩu được băm Argon2id và lưu trữ an toàn. Sau khi đặt lại, nhân sự bắt buộc phải đổi mật khẩu ở lần đăng nhập tiếp theo.
                </Text>
              </div>
              <Button
                type={resetPasswordEnabled ? 'default' : 'primary'}
                ghost={!resetPasswordEnabled}
                onClick={() => setResetPasswordEnabled(!resetPasswordEnabled)}
                style={{ borderRadius: 8 }}
              >
                {resetPasswordEnabled ? 'Hủy đặt lại MK' : 'Cấp mật khẩu mới'}
              </Button>
            </div>

            {resetPasswordEnabled && (
              <Card
                style={{
                  background: '#FAFCFA',
                  borderColor: '#DDE7E1',
                  borderRadius: 10,
                  marginBottom: 16,
                }}
                styles={{ body: { padding: '20px 24px' } }}
              >
                <Row gutter={24}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="newPassword"
                      label={<Text strong>Mật khẩu mới</Text>}
                      rules={[
                        { required: resetPasswordEnabled, message: 'Vui lòng nhập mật khẩu mới' },
                        { min: 8, message: 'Mật khẩu phải có tối thiểu 8 ký tự' },
                      ]}
                    >
                      <Input.Password
                        size="large"
                        prefix={<LockOutlined />}
                        placeholder="Tối thiểu 8 ký tự"
                        autoComplete="new-password"
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      name="confirmPassword"
                      label={<Text strong>Xác nhận mật khẩu mới</Text>}
                      rules={[
                        { required: resetPasswordEnabled, message: 'Vui lòng xác nhận mật khẩu' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) {
                              return Promise.resolve();
                            }
                            return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                          },
                        }),
                      ]}
                    >
                      <Input.Password
                        size="large"
                        prefix={<LockOutlined />}
                        placeholder="Nhập lại mật khẩu mới"
                        autoComplete="new-password"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Alert
                  type="info"
                  showIcon
                  message="Lưu ý bảo mật VMAX"
                  description="Sau khi lưu, hãy thông báo trực tiếp mật khẩu mới cho nhân sự. Mật khẩu không bao giờ được gửi qua notification hoặc lưu trữ dạng văn bản thuần."
                  style={{ borderRadius: 8 }}
                />
              </Card>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <Button onClick={() => navigate('/employee-accounts')}>Hủy bỏ</Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
              style={{
                background: 'var(--vmax-green, #0C6B37)',
                borderColor: 'var(--vmax-green, #0C6B37)',
                height: 42,
                padding: '0 24px',
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              Lưu thay đổi tài khoản
            </Button>
          </div>
        </Form>
      </Card>

      {/* History of Password Reset Requests */}
      <Card
        className="vmax-card"
        style={{ borderRadius: 12 }}
        title={
          <Space>
            <HistoryOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />
            <span style={{ fontWeight: 700 }}>Lịch sử yêu cầu quên mật khẩu của nhân sự này</span>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={resetRequestColumns}
          dataSource={pendingResetRequests}
          rowKey="id"
          pagination={false}
          locale={{
            emptyText: 'Không có yêu cầu quên mật khẩu nào được ghi nhận cho nhân sự này.',
          }}
        />
      </Card>

      {/* Step-Up PIN Modal */}
      <BossPinModal
        open={pinModalOpen}
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setPinModalOpen(false);
          setPendingSubmitValues(null);
        }}
      />
    </div>
  );
};
