import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Alert, Typography, Space } from 'antd';
import { SafetyCertificateOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import { verifyBossPinApi, changeBossPinApi, getBossPinStatusApi } from '../../api/employeeAccounts';

const { Text, Paragraph } = Typography;

interface BossPinModalProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export const BossPinModal: React.FC<BossPinModalProps> = ({ open, onSuccess, onCancel }) => {
  const [form] = Form.useForm();
  const [changePinForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [changePinSuccessMsg, setChangePinSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getBossPinStatusApi()
        .then((res) => {
          if (!res.isConfigured) {
            setIsFirstTimeSetup(true);
            setIsChangingPin(true);
          } else {
            setIsFirstTimeSetup(false);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const handleVerify = async (values: { pin: string }) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await verifyBossPinApi(values.pin);
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Mã PIN không chính xác');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async (values: { currentPin?: string; newPin: string; confirmPin: string }) => {
    if (values.newPin !== values.confirmPin) {
      setErrorMsg('Xác nhận mã PIN mới không khớp');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await changeBossPinApi(values.newPin, isFirstTimeSetup ? undefined : values.currentPin);
      setChangePinSuccessMsg(res.message || 'Thiết lập mã PIN bảo mật thành công');
      changePinForm.resetFields();

      // Auto-unlock session with the newly created PIN
      await verifyBossPinApi(values.newPin);
      setIsChangingPin(false);
      setIsFirstTimeSetup(false);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Thao tác PIN thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    changePinForm.resetFields();
    setErrorMsg(null);
    setChangePinSuccessMsg(null);
    setIsChangingPin(false);
    setIsFirstTimeSetup(false);
    onCancel();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: 'var(--vmax-green, #0C6B37)', fontSize: 20 }} />
          <span style={{ fontWeight: 700 }}>
            {isFirstTimeSetup
              ? 'Thiết lập mã PIN bảo mật BOSS lần đầu'
              : isChangingPin
              ? 'Đổi mã PIN bảo mật BOSS'
              : 'Xác thực mã PIN bảo mật BOSS'}
          </span>
        </Space>
      }
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      centered
      width={440}
    >
      <div style={{ marginTop: 12 }}>
        {changePinSuccessMsg && (
          <Alert
            type="success"
            message={changePinSuccessMsg}
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
            closable
            onClose={() => setChangePinSuccessMsg(null)}
          />
        )}

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

        {!isChangingPin ? (
          <>
            <Paragraph style={{ color: 'var(--vmax-text-secondary, #66736B)', fontSize: 13, marginBottom: 18 }}>
              Thao tác nhạy cảm yêu cầu xác thực bảo mật cấp 2 (Step-Up PIN). Nhập mã PIN 6 chữ số để mở khóa phiên quản lý tài khoản nhân sự.
            </Paragraph>

            <Form form={form} layout="vertical" onFinish={handleVerify}>
              <Form.Item
                name="pin"
                label={<Text strong>Mã PIN bảo mật (6 số)</Text>}
                rules={[
                  { required: true, message: 'Vui lòng nhập mã PIN' },
                  { pattern: /^\d{6}$/, message: 'Mã PIN phải gồm đúng 6 chữ số' },
                ]}
              >
                <Input.Password
                  maxLength={6}
                  placeholder="Nhập 6 số PIN"
                  prefix={<LockOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />}
                  style={{
                    fontSize: 20,
                    letterSpacing: 8,
                    textAlign: 'center',
                    height: 48,
                  }}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                <Button
                  type="link"
                  size="small"
                  icon={<KeyOutlined />}
                  onClick={() => {
                    setIsChangingPin(true);
                    setErrorMsg(null);
                  }}
                  style={{ padding: 0 }}
                >
                  Đổi mã PIN bảo mật
                </Button>

                <Space>
                  <Button onClick={handleClose}>Hủy</Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    style={{ background: 'var(--vmax-green, #0C6B37)', borderColor: 'var(--vmax-green, #0C6B37)' }}
                  >
                    Xác nhận mở khóa
                  </Button>
                </Space>
              </div>
            </Form>
          </>
        ) : (
          <>
            <Paragraph style={{ color: 'var(--vmax-text-secondary, #66736B)', fontSize: 13, marginBottom: 18 }}>
              {isFirstTimeSetup
                ? 'Để đảm bảo an toàn cho môi trường vận hành, Ban Giám Đốc (BOSS) cần thiết lập mã PIN 6 chữ số lần đầu tiên.'
                : 'Thiết lập mã PIN 6 chữ số mới để bảo vệ các thao tác quản trị tài khoản cấp cao.'}
            </Paragraph>

            <Form form={changePinForm} layout="vertical" onFinish={handleChangePin}>
              {!isFirstTimeSetup && (
                <Form.Item
                  name="currentPin"
                  label={<Text strong>Mã PIN hiện tại</Text>}
                  rules={[
                    { required: true, message: 'Vui lòng nhập PIN hiện tại' },
                    { pattern: /^\d{6}$/, message: 'Mã PIN gồm 6 chữ số' },
                  ]}
                >
                  <Input.Password
                    maxLength={6}
                    placeholder="Nhập PIN hiện tại"
                    style={{ fontSize: 16, letterSpacing: 4, textAlign: 'center' }}
                    autoComplete="current-password"
                  />
                </Form.Item>
              )}

              <Form.Item
                name="newPin"
                label={<Text strong>{isFirstTimeSetup ? 'Mã PIN bảo mật 6 số' : 'Mã PIN mới'}</Text>}
                rules={[
                  { required: true, message: 'Vui lòng nhập PIN gồm 6 số' },
                  { pattern: /^\d{6}$/, message: 'Mã PIN mới phải gồm đúng 6 chữ số' },
                ]}
              >
                <Input.Password
                  maxLength={6}
                  placeholder="Nhập 6 chữ số PIN"
                  style={{ fontSize: 16, letterSpacing: 4, textAlign: 'center' }}
                  autoComplete="new-password"
                  autoFocus
                />
              </Form.Item>

              <Form.Item
                name="confirmPin"
                label={<Text strong>Xác nhận mã PIN</Text>}
                rules={[
                  { required: true, message: 'Vui lòng xác nhận mã PIN' },
                  { pattern: /^\d{6}$/, message: 'Mã PIN phải gồm đúng 6 chữ số' },
                ]}
              >
                <Input.Password
                  maxLength={6}
                  placeholder="Nhập lại 6 chữ số PIN"
                  style={{ fontSize: 16, letterSpacing: 4, textAlign: 'center' }}
                  autoComplete="new-password"
                />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                {!isFirstTimeSetup ? (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setIsChangingPin(false);
                      setErrorMsg(null);
                    }}
                    style={{ padding: 0 }}
                  >
                    Quay lại xác thực PIN
                  </Button>
                ) : (
                  <span />
                )}

                <Space>
                  <Button onClick={handleClose}>Hủy</Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    style={{ background: 'var(--vmax-green, #0C6B37)', borderColor: 'var(--vmax-green, #0C6B37)' }}
                  >
                    {isFirstTimeSetup ? 'Kích hoạt mã PIN' : 'Lưu mã PIN mới'}
                  </Button>
                </Space>
              </div>
            </Form>
          </>
        )}
      </div>
    </Modal>
  );
};
