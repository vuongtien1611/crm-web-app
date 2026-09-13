import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert, App } from 'antd';
import { UserOutlined, LockOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { loginApi } from '../api/auth';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';
import './Login.css';

const { Title, Text } = Typography;

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (values: { identifier: string; password: string }) =>
      loginApi(values.identifier, values.password),
    onSuccess: (data) => {
      message.success(`Chào mừng trở lại, ${data.user.fullName || data.user.username}!`);
      if (data.user.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate('/dashboard');
      }
    },
    onError: (error: Error) => {
      message.error(error.message || 'Đăng nhập thất bại');
    },
  });

  const onFinish = (values: any) => {
    mutation.mutate(values);
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
      <Card
        className="vmax-card login-card"
        variant="borderless"
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo.png"
            alt="VMAX CRM"
            style={{
              maxHeight: '68px',
              maxWidth: '220px',
              width: '100%',
              objectFit: 'contain',
              display: 'inline-block',
              marginBottom: 16,
            }}
          />
          <Title level={2} style={{ margin: 0, fontWeight: 800, color: 'var(--vmax-text)', letterSpacing: '-0.5px' }}>
            VMAX CRM
          </Title>
          <Text style={{ color: 'var(--vmax-text-muted)', fontSize: 14, marginTop: 4, display: 'block' }}>
            Hệ thống Quản trị & Điều hành Doanh nghiệp
          </Text>
        </div>

        {mutation.isError && (
          <Alert
            type="error"
            message={
              mutation.error?.message === 'Invalid credentials'
                ? 'Tài khoản hoặc mật khẩu không chính xác'
                : mutation.error?.message || 'Tài khoản hoặc mật khẩu không chính xác'
            }
            showIcon
            style={{ marginBottom: 20, borderRadius: 10 }}
          />
        )}

        <Form
          name="login"
          className="login-form vmax-form"
          onFinish={onFinish}
          layout="vertical"
          disabled={mutation.isPending}
        >
          <Form.Item
            name="identifier"
            label="Tên đăng nhập hoặc Email"
            rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập hoặc email' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: 'var(--vmax-green)' }} />}
              placeholder="admin hoặc admin@crm.local"
              size="large"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'var(--vmax-green)' }} />}
              placeholder="Mật khẩu"
              size="large"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item style={{ marginTop: 28, marginBottom: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={mutation.isPending}
              block
              className="btn-primary"
              style={{ height: 46, fontSize: 15, fontWeight: 700 }}
            >
              Đăng nhập hệ thống
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button
            type="link"
            icon={<QuestionCircleOutlined />}
            onClick={() => setForgotModalOpen(true)}
            style={{ color: 'var(--vmax-green)', fontWeight: 500 }}
          >
            Quên tài khoản / mật khẩu?
          </Button>
        </div>

        <ForgotPasswordModal
          open={forgotModalOpen}
          onClose={() => setForgotModalOpen(false)}
        />
      </Card>
    </div>
  );
};

