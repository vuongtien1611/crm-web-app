import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Col, Form, Input, Modal, Row, Typography } from 'antd';
import { MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import type { LeadDetail } from '../../api/leads';
import { updateLeadInfoApi } from '../../api/leads';

const { Text } = Typography;

interface Props {
  isOpen: boolean;
  lead: LeadDetail;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadEditModal: React.FC<Props> = ({ isOpen, lead, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    form.setFieldsValue({
      fullName: lead.full_name,
      phone: lead.phone || '',
      email: lead.email || '',
    });
    setError('');
  }, [form, isOpen, lead]);

  const handleSubmit = async (values: { fullName: string; phone?: string; email?: string }) => {
    setLoading(true);
    setError('');
    try {
      await updateLeadInfoApi(lead.id, {
        fullName: values.fullName.trim(),
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
      });
      message.success('Đã cập nhật thông tin Lead');
      onSuccess();
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể cập nhật thông tin Lead';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<Text strong style={{ fontSize: 16 }}>Chỉnh sửa thông tin Lead</Text>}
      open={isOpen}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={600}
    >
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError('')}
        />
      )}

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="fullName"
          label="Họ và tên"
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ và tên khách hàng' }]}
        >
          <Input prefix={<UserOutlined />} placeholder="Ví dụ: Nguyễn Văn A" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="phone"
              label="Số điện thoại"
              rules={[{ pattern: /^[0-9+() -]{8,20}$/, message: 'Số điện thoại không hợp lệ' }]}
            >
              <Input prefix={<PhoneOutlined />} placeholder="0987654321" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
            >
              <Input prefix={<MailOutlined />} placeholder="client@example.com" />
            </Form.Item>
          </Col>
        </Row>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            Lưu thay đổi
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
