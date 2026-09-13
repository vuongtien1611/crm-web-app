import React from 'react';
import { Card, Form, Input, Button, Typography, App, Space } from 'antd';
import { LockOutlined, LogoutOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { changePasswordApi, logoutApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import './ChangePasswordPage.css';

const { Title, Text } = Typography;

export const ChangePasswordPage: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);

  const mutation = useMutation({
    mutationFn: (values: { currentPassword: string; newPassword: string }) =>
      changePasswordApi(values.currentPassword, values.newPassword),
    onSuccess: () => {
      message.success('Đổi mật khẩu thành công.');
      navigate('/dashboard');
    },
    onError: (error: Error) => {
      message.error(error.message || 'Đổi mật khẩu thất bại');
    },
  });

  const handleLogout = async () => {
    await logoutApi();
    navigate('/login');
  };

  const onFinish = (values: any) => {
    mutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'var(--vmax-bg)',
        padding: '24px',
      }}
    >
      <Card className="vmax-card change-password-card" variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div>
            <img
              src="/logo.png"
              alt="VMAX CRM"
              style={{
                maxHeight: '52px',
                maxWidth: '180px',
                objectFit: 'contain',
                display: 'inline-block',
                marginBottom: 14,
              }}
            />
          </div>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'var(--vmax-green)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: '-0.5px',
              boxShadow: '0 4px 12px rgba(12, 107, 55, 0.25)',
              marginBottom: 12,
            }}
          >
            <SafetyCertificateOutlined />
          </div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: 'var(--vmax-text)' }}>
            Đổi mật khẩu
          </Title>
          <Text type="secondary" style={{ fontSize: 14, marginTop: 4, display: 'block' }}>
            {user?.mustChangePassword
              ? 'Tài khoản của bạn cần đổi mật khẩu trong lần đăng nhập đầu tiên'
              : 'Cập nhật mật khẩu mới cho tài khoản của bạn'}
          </Text>
        </div>

        <Form
          form={form}
          className="vmax-form change-password-form"
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
        >
          <Form.Item
            label="Mật khẩu hiện tại"
            name="currentPassword"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu hiện tại' },
            ]}
          >
            <Input.Password
              id="change_password_current"
              prefix={<LockOutlined style={{ color: 'var(--vmax-text-muted)' }} />}
              placeholder="Nhập mật khẩu hiện tại"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Mật khẩu mới"
            name="newPassword"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu mới' },
              { min: 8, message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' },
            ]}
          >
            <Input.Password
              id="change_password_new"
              prefix={<LockOutlined style={{ color: 'var(--vmax-text-muted)' }} />}
              placeholder="Tối thiểu 8 ký tự"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Xác nhận mật khẩu mới"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
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
              id="change_password_confirm"
              prefix={<LockOutlined style={{ color: 'var(--vmax-text-muted)' }} />}
              placeholder="Nhập lại mật khẩu mới"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12, marginTop: 8 }}>
            <Button
              id="change_password_submit_btn"
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={mutation.isPending}
              style={{
                height: 44,
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 15,
                background: 'var(--vmax-green)',
              }}
            >
              Đổi mật khẩu
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Button
              type="link"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{ fontWeight: 500 }}
            >
              Đăng xuất
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};
