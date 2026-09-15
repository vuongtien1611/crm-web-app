import React, { useState, useEffect, useMemo } from 'react';
import {
  App,
  Card,
  Form,
  Input,
  Select,
  DatePicker,
  Switch,
  Button,
  Row,
  Col,
  Typography,
  Space,
  Alert,
  Divider,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  KeyOutlined,
  UserOutlined,
  IdcardOutlined,
  BankOutlined,
  LockOutlined,
  ReloadOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuthStore } from '../../store/authStore';
import {
  getEmployeeFormOptions,
  createEmployeeAccount,
  FormOptionsResponse,
  CreateEmployeeAccountPayload,
} from '../../api/employees';

const { Title, Text, Paragraph } = Typography;

const DEPARTMENT_LABELS: Record<string, string> = {
  SALES: 'Kinh doanh',
  DEV: 'Phát triển phần mềm',
  SEO: 'SEO / Marketing',
  OPERATION: 'Vận hành',
};

function generateSecurePassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()_+-=';
  const allChars = upper + lower + digits + symbols;

  const getRandomByte = (): number => {
    const arr = new Uint8Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0];
  };

  const getRandomChar = (charset: string): string => {
    const byte = getRandomByte();
    return charset[byte % charset.length];
  };

  // Guarantee at least one character from each required category
  const passwordChars = [
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(digits),
    getRandomChar(symbols),
  ];

  for (let i = passwordChars.length; i < length; i++) {
    passwordChars.push(getRandomChar(allChars));
  }

  // Fisher-Yates shuffle using crypto randomness
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = getRandomByte() % (i + 1);
    const temp = passwordChars[i];
    passwordChars[i] = passwordChars[j];
    passwordChars[j] = temp;
  }

  return passwordChars.join('');
}

export const CreateEmployeePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState<FormOptionsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');

  // Memoize initialValues to avoid re-triggering isEqual checks with dayjs circular prototype graph
  const defaultInitialValues = useMemo(
    () => ({
      isLeader: false,
      hireDate: dayjs(),
    }),
    [],
  );

  // Watch fields for dynamic filtering
  const selectedPosition = Form.useWatch('positionCode', form);
  const selectedDepartment = Form.useWatch('department', form);
  const selectedTeamId = Form.useWatch('teamId', form);

  const canCreate =
    user?.permissions?.includes('EMPLOYEE_CREATE') || user?.roles?.includes('ADMIN');

  useEffect(() => {
    const loadMeta = async () => {
      setLoadingOptions(true);
      try {
        const data = await getEmployeeFormOptions();
        setOptions(data);
      } catch (err: any) {
        message.error(err.message || 'Không thể tải cấu hình tạo nhân viên');
      } finally {
        setLoadingOptions(false);
      }
    };
    loadMeta();
  }, []);

  // Filtered Roles based on backend compatibility matrix for selected position
  const filteredRoles = useMemo(() => {
    if (!options || !selectedPosition) return [];
    const compat = options.compatibility?.[selectedPosition];
    if (!compat?.roles) return options.roles;
    return options.roles.filter((r) => compat.roles.includes(r.code));
  }, [options, selectedPosition]);

  // Filtered Departments based on compatibility matrix
  const filteredDepartments = useMemo(() => {
    if (!options || !selectedPosition) {
      return ['SALES', 'DEV', 'SEO', 'OPERATION'];
    }
    const compat = options.compatibility?.[selectedPosition];
    if (!compat?.departments) return ['SALES', 'DEV', 'SEO', 'OPERATION'];
    return compat.departments.filter((d) =>
      ['SALES', 'DEV', 'SEO', 'OPERATION'].includes(d),
    );
  }, [options, selectedPosition]);

  // Filtered Teams based on selected department
  const filteredTeams = useMemo(() => {
    if (!options || !selectedDepartment) return [];
    return options.teams.filter(
      (t) => t.department && t.department.toUpperCase() === selectedDepartment.toUpperCase(),
    );
  }, [options, selectedDepartment]);

  // Is Leader position check
  const isLeaderPosition = useMemo(() => {
    if (!selectedPosition) return false;
    return selectedPosition.endsWith('_TEAM_LEADER');
  }, [selectedPosition]);

  // Auto adjust role and department when position changes
  const handlePositionChange = (posCode: string) => {
    form.setFieldsValue({
      roleCode: undefined,
      department: undefined,
      teamId: undefined,
      isLeader: posCode.endsWith('_TEAM_LEADER'),
    });

    if (options?.compatibility?.[posCode]) {
      const compat = options.compatibility[posCode];
      if (compat.roles.length === 1) {
        form.setFieldValue('roleCode', compat.roles[0]);
      }
      const validDepts = compat.departments.filter((d) =>
        ['SALES', 'DEV', 'SEO', 'OPERATION'].includes(d),
      );
      if (validDepts.length === 1) {
        form.setFieldValue('department', validDepts[0]);
      }
    }
  };

  const handleDepartmentChange = () => {
    form.setFieldsValue({
      teamId: undefined,
    });
  };

  const handleGeneratePassword = () => {
    const pwd = generateSecurePassword(14);
    form.setFieldValue('password', pwd);
    setPasswordValue(pwd);
    setPasswordVisible(true);
    message.success('Đã tạo mật khẩu tạm thời ngẫu nhiên.');
  };

  const handleCopyPassword = async () => {
    const currentPwd = form.getFieldValue('password') || passwordValue;
    if (!currentPwd) {
      message.warning('Chưa có mật khẩu để sao chép.');
      return;
    }

    const fallbackCopy = (text: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(currentPwd);
          message.success('Đã sao chép mật khẩu');
          return;
        } catch {
          // fallback if document focus or permissions restrict writeText
        }
      }
      const ok = fallbackCopy(currentPwd);
      if (ok) {
        message.success('Đã sao chép mật khẩu');
      } else {
        message.error('Không thể sao chép mật khẩu');
      }
    } catch {
      message.error('Không thể sao chép mật khẩu');
    }
  };

  const mapBackendError = (raw: string): string => {
    const msg = raw.toLowerCase();
    if (msg.includes('username') && (msg.includes('exists') || msg.includes('trùng'))) {
      return 'Tên đăng nhập đã tồn tại trong hệ thống. Vui lòng chọn tên khác.';
    }
    if (msg.includes('email') && (msg.includes('exists') || msg.includes('trùng'))) {
      return 'Email này đã được sử dụng cho một tài khoản khác.';
    }
    if (msg.includes('hiredate')) {
      return 'Vui lòng chọn ngày vào làm hợp lệ (định dạng DD/MM/YYYY).';
    }
    if (msg.includes('incompatible position')) {
      return 'Chức vụ và vai trò không tương thích với nhau.';
    }
    if (msg.includes('does not match employee department') || msg.includes('not compatible with position')) {
      return 'Phòng ban không phù hợp với chức vụ hoặc nhóm đã chọn.';
    }
    if (msg.includes('already has an active team leader')) {
      return 'Nhóm này hiện đã có một Trưởng nhóm đang hoạt động.';
    }
    if (msg.includes('classification gap')) {
      return 'Nhóm được chọn chưa phân loại phòng ban rõ ràng.';
    }
    return raw || 'Đã có lỗi xảy ra khi tạo nhân viên.';
  };

  const onFinish = async (values: any) => {
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const hireDateStr = values.hireDate
        ? dayjs(values.hireDate).format('YYYY-MM-DD')
        : '';

      if (!hireDateStr) {
        throw new Error('Vui lòng chọn ngày vào làm.');
      }

      const rawPassword = values.password ?? form.getFieldValue('password') ?? passwordValue;
      const finalPassword =
        typeof rawPassword === 'string' && rawPassword.trim() ? rawPassword.trim() : undefined;

      const payload: CreateEmployeeAccountPayload = {
        username: values.username.trim(),
        email: values.email.trim(),
        password: finalPassword,
        fullName: values.fullName.trim(),
        phone: values.phone ? values.phone.trim() : undefined,
        hireDate: hireDateStr,
        positionCode: values.positionCode,
        roleCode: values.roleCode,
        department: values.department,
        teamId: values.teamId || undefined,
        isLeader: values.isLeader || false,
      };

      const result = await createEmployeeAccount(payload);
      message.success('Tạo nhân viên và tài khoản thành công.');

      const newId = result?.employee?.id;
      if (newId) {
        navigate(`/employees/${newId}`);
      } else {
        navigate('/employees');
      }
    } catch (err: any) {
      const vnMsg = mapBackendError(err.message || '');
      setErrorMessage(vnMsg);
      message.error(vnMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCreate) {
    return (
      <Card style={{ margin: '24px' }}>
        <Alert
          type="error"
          showIcon
          message="Không có quyền truy cập"
          description="Bạn không có quyền tạo nhân viên mới (EMPLOYEE_CREATE)."
        />
        <Button style={{ marginTop: '16px' }} onClick={() => navigate('/employees')}>
          Quay lại danh sách
        </Button>
      </Card>
    );
  }

  return (
    <div className="vmax-page-wrapper vmax-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Navigation & Header */}
      <div style={{ marginBottom: '24px' }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/employees')}
          style={{ paddingLeft: 0, marginBottom: '8px', color: 'var(--vmax-text-muted)' }}
        >
          Quay lại danh sách nhân sự
        </Button>
        <Title level={3} style={{ margin: 0, color: 'var(--vmax-text)', fontWeight: 800 }}>
          Thêm nhân viên & Cấp tài khoản mới
        </Title>
        <Text type="secondary">
          Khởi tạo đồng thời hồ sơ nhân viên, chức vụ, vai trò, nhóm làm việc và tài khoản đăng nhập
        </Text>
      </div>

      {errorMessage && (
        <Alert
          type="error"
          showIcon
          message="Không thể tạo nhân sự"
          description={errorMessage}
          style={{ marginBottom: '20px', borderRadius: '10px' }}
          closable
          onClose={() => setErrorMessage(null)}
        />
      )}

      <Form
        form={form}
        name="create-employee-form"
        layout="vertical"
        className="vmax-form"
        onFinish={onFinish}
        initialValues={defaultInitialValues}
      >
        {/* SECTION A: THÔNG TIN CÁ NHÂN */}
        <Card
          variant="borderless"
          className="vmax-card"
          style={{
            borderRadius: '16px',
            boxShadow: 'var(--vmax-shadow)',
            marginBottom: '20px',
          }}
          title={
            <Space>
              <UserOutlined style={{ color: 'var(--vmax-green)' }} />
              <Text strong style={{ fontSize: '16px' }}>
                A. THÔNG TIN CÁ NHÂN
              </Text>
            </Space>
          }
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Họ và tên"
                name="fullName"
                rules={[{ required: true, message: 'Vui lòng nhập họ và tên nhân viên' }]}
              >
                <Input placeholder="Ví dụ: Nguyễn Văn An" id="employee_fullName" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Mã nhân viên"
                tooltip="Mã nhân viên sẽ được hệ thống sinh tự động theo quy chuẩn sau khi tạo"
              >
                <Input value="[Hệ thống tự động sinh]" disabled style={{ background: '#f5f5f5' }} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Email liên hệ"
                name="email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email' },
                  { type: 'email', message: 'Email không đúng định dạng' },
                ]}
              >
                <Input placeholder="an.nguyen@vmax.vn" id="employee_email" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item label="Số điện thoại" name="phone">
                <Input placeholder="0901234567" id="employee_phone" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Ngày vào làm"
                name="hireDate"
                rules={[{ required: true, message: 'Vui lòng chọn ngày vào làm' }]}
              >
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                  placeholder="Chọn ngày vào làm"
                  id="employee_hireDate"
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* SECTION B: THÔNG TIN CÔNG VIỆC */}
        <Card
          variant="borderless"
          className="vmax-card"
          style={{
            borderRadius: '16px',
            boxShadow: 'var(--vmax-shadow)',
            marginBottom: '20px',
          }}
          title={
            <Space>
              <BankOutlined style={{ color: 'var(--vmax-green)' }} />
              <Text strong style={{ fontSize: '16px' }}>
                B. THÔNG TIN CÔNG VIỆC & PHÒNG BAN
              </Text>
            </Space>
          }
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Chức vụ"
                name="positionCode"
                rules={[{ required: true, message: 'Vui lòng chọn chức vụ' }]}
              >
                <Select
                  id="employee_positionCode"
                  placeholder="Chọn chức vụ"
                  loading={loadingOptions}
                  onChange={handlePositionChange}
                  options={options?.positions.map((p) => ({
                    label: p.name,
                    value: p.code,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Vai trò (Role)"
                name="roleCode"
                rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
              >
                <Select
                  id="employee_roleCode"
                  placeholder="Chọn vai trò tương thích"
                  disabled={!selectedPosition}
                  options={filteredRoles.map((r) => ({
                    label: `${r.name} (${r.code})`,
                    value: r.code,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Phòng ban"
                name="department"
                rules={[{ required: true, message: 'Vui lòng chọn phòng ban' }]}
              >
                <Select
                  id="employee_department"
                  placeholder="Chọn phòng ban"
                  disabled={!selectedPosition}
                  onChange={handleDepartmentChange}
                  options={filteredDepartments.map((dept) => ({
                    label: DEPARTMENT_LABELS[dept] || dept,
                    value: dept,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Nhóm làm việc (Team)"
                name="teamId"
                tooltip={
                  isLeaderPosition
                    ? 'Bắt buộc chọn nhóm làm việc cho chức vụ Trưởng nhóm'
                    : 'Chỉ hiển thị các nhóm trực thuộc phòng ban đã chọn'
                }
                rules={[
                  {
                    required: isLeaderPosition,
                    message: 'Vui lòng chọn nhóm làm việc cho chức vụ Trưởng nhóm',
                  },
                ]}
              >
                <Select
                  id="employee_teamId"
                  placeholder={
                    selectedDepartment
                      ? isLeaderPosition
                        ? 'Chọn nhóm làm việc (Bắt buộc cho Trưởng nhóm)'
                        : 'Chọn nhóm làm việc (tùy chọn)'
                      : 'Vui lòng chọn phòng ban trước'
                  }
                  disabled={!selectedDepartment}
                  allowClear={!isLeaderPosition}
                  options={filteredTeams.map((t) => ({
                    label: t.name,
                    value: t.id,
                  }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <div
                style={{
                  background: '#f8fafc',
                  padding: '16px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <Text strong style={{ display: 'block' }}>
                    Bổ nhiệm làm Trưởng nhóm (Team Leader)
                  </Text>
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    {isLeaderPosition
                      ? 'Chức vụ này có quyền quản lý nhóm. Hãy chọn nhóm để bổ nhiệm trưởng nhóm.'
                      : 'Chỉ các chức vụ Trưởng nhóm (Sales Leader, Dev Leader, SEO Leader) mới có quyền lãnh đạo nhóm.'}
                  </Text>
                </div>
                <Form.Item name="isLeader" valuePropName="checked" style={{ margin: 0 }}>
                  <Switch disabled={!isLeaderPosition || !selectedTeamId} />
                </Form.Item>
              </div>
            </Col>
          </Row>
        </Card>

        {/* SECTION C: TÀI KHOẢN ĐĂNG NHẬP */}
        <Card
          variant="borderless"
          className="vmax-card"
          style={{
            borderRadius: '16px',
            boxShadow: 'var(--vmax-shadow)',
            marginBottom: '20px',
          }}
          title={
            <Space>
              <LockOutlined style={{ color: 'var(--vmax-green)' }} />
              <Text strong style={{ fontSize: '16px' }}>
                C. TÀI KHOẢN ĐĂNG NHẬP HỆ THỐNG
              </Text>
            </Space>
          }
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Tên đăng nhập"
                name="username"
                rules={[
                  { required: true, message: 'Vui lòng nhập tên đăng nhập' },
                  { min: 3, message: 'Tối thiểu 3 ký tự' },
                  { max: 50, message: 'Tối đa 50 ký tự' },
                  {
                    pattern: /^[a-zA-Z0-9_-]+$/,
                    message: 'Chỉ bao gồm chữ cái, số, dấu gạch dưới và dấu gạch ngang',
                  },
                ]}
              >
                <Input placeholder="ví dụ: an.nguyen" id="employee_username" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Mật khẩu tạm thời"
                tooltip="Mật khẩu khởi tạo. Nếu để trống hệ thống sẽ sinh mật khẩu mặc định an toàn."
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="password" noStyle>
                    <Input.Password
                      placeholder="Nhập hoặc tạo ngẫu nhiên"
                      id="employee_password"
                      visibilityToggle={{
                        visible: passwordVisible,
                        onVisibleChange: setPasswordVisible,
                      }}
                      onChange={(e) => setPasswordValue(e.target.value)}
                    />
                  </Form.Item>
                  <Tooltip title="Sao chép mật khẩu">
                    <Button
                      icon={<CopyOutlined />}
                      onClick={handleCopyPassword}
                      id="btn_copy_password"
                      title="Sao chép mật khẩu"
                    />
                  </Tooltip>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleGeneratePassword}
                    id="btn_generate_password"
                    title="Tạo mật khẩu ngẫu nhiên"
                  >
                    Tạo ngẫu nhiên
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Alert
                type="info"
                showIcon
                message="Chính sách bảo mật tài khoản nhân viên mới"
                description={
                  <span>
                    Tài khoản được tạo sẽ tự động kích hoạt cờ{' '}
                    <code>must_change_password = TRUE</code>. Nhân viên sẽ được yêu cầu đổi mật
                    khẩu mới ngay trong lần đăng nhập đầu tiên để đảm bảo tính an toàn dữ liệu.
                  </span>
                }
                style={{ borderRadius: '10px' }}
              />
            </Col>
          </Row>
        </Card>

        {/* Form Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button onClick={() => navigate('/employees')} size="large">
            Hủy bỏ
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={submitting}
            size="large"
            style={{
              background: 'var(--vmax-green)',
              borderColor: 'var(--vmax-green)',
              fontWeight: 600,
              minWidth: '160px',
            }}
            id="btn_submit_employee"
          >
            Tạo nhân viên
          </Button>
        </div>
      </Form>
    </div>
  );
};
