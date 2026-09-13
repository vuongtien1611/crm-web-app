import React, { useState } from 'react';
import { Modal, Form, Input, Button, Alert, Typography, Result } from 'antd';
import { QuestionCircleOutlined, UserOutlined } from '@ant-design/icons';
import { forgotPasswordApi } from '../../api/employeeAccounts';

const { Text, Paragraph } = Typography;

interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ open, onClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResponse, setSuccessResponse] = useState<string | null>(null);

  const handleSubmit = async (values: { identifier: string }) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await forgotPasswordApi(values.identifier.trim());
      setSuccessResponse(
        res.message ||
          'Yêu cầu của bạn đã được gửi đến Ban Giám Đốc (BOSS). Vui lòng liên hệ BOSS để nhận thông tin cấp lại tài khoản.',
      );
      form.resetFields();
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể gửi yêu cầu quên mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    form.resetFields();
    setErrorMsg(null);
    setSuccessResponse(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          <QuestionCircleOutlined style={{ color: 'var(--vmax-green, #0C6B37)', marginRight: 8 }} />
          Yêu cầu cấp lại Tài khoản / Mật khẩu
        </span>
      }
      onCancel={handleModalClose}
      footer={null}
      destroyOnHidden
      centered
      width={460}
    >
      <div style={{ marginTop: 12 }}>
        {successResponse ? (
          <Result
            status="success"
            title="Đã gửi yêu cầu thành công!"
            subTitle={successResponse}
            extra={[
              <Button
                type="primary"
                key="close"
                onClick={handleModalClose}
                style={{ background: 'var(--vmax-green, #0C6B37)', borderColor: 'var(--vmax-green, #0C6B37)' }}
              >
                Đã hiểu và Đóng
              </Button>,
            ]}
          />
        ) : (
          <>
            <Paragraph style={{ color: 'var(--vmax-text-secondary, #66736B)', fontSize: 13, marginBottom: 16 }}>
              Nhập tên đăng nhập, email hoặc mã nhân viên của bạn. Hệ thống sẽ tự động tạo yêu cầu và thông báo đến Ban Giám Đốc (BOSS) để hỗ trợ cấp lại mật khẩu an toàn.
            </Paragraph>

            {errorMsg && (
              <Alert
                type="error"
                message={errorMsg}
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
                closable
                onClose={() => setErrorMsg(null)}
              />
            )}

            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="identifier"
                label={<Text strong>Tên đăng nhập, Email hoặc Mã nhân viên</Text>}
                rules={[{ required: true, message: 'Vui lòng nhập thông tin nhận diện nhân sự' }]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />}
                  placeholder="Ví dụ: sale_nam, nam@vmax.vn, NV001"
                  size="large"
                  autoComplete="username"
                  autoFocus
                />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <Button onClick={handleModalClose}>Hủy bỏ</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  style={{ background: 'var(--vmax-green, #0C6B37)', borderColor: 'var(--vmax-green, #0C6B37)' }}
                >
                  Gửi yêu cầu tới BOSS
                </Button>
              </div>
            </Form>
          </>
        )}
      </div>
    </Modal>
  );
};
