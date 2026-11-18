import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Row, Col, Alert, Typography, App } from 'antd';
import { UserOutlined, PhoneOutlined, MailOutlined, GlobalOutlined, AppstoreOutlined } from '@ant-design/icons';
import { createLeadApi, getPlatformsApi, getChannelsApi, PlatformItem, ChannelItem } from '../../api/leads';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadCreateModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [platforms, setPlatforms] = useState<PlatformItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      form.resetFields();
      setError('');
      getPlatformsApi().then(setPlatforms).catch(() => {});
      getChannelsApi().then(setChannels).catch(() => {});
    }
  }, [isOpen, form]);

  const handleSubmit = async (values: any) => {
    setError('');
    setLoading(true);

    try {
      const isSale = user?.roles?.includes('SALE');
      const assignedSaleId = isSale && user?.employeeId ? String(user.employeeId) : undefined;
      const creatorEmployeeId = user?.employeeId ? String(user.employeeId) : undefined;

      await createLeadApi({
        fullName: values.fullName.trim(),
        phone: values.phone?.trim() || undefined,
        email: values.email?.trim() || undefined,
        platformId: values.platformId || undefined,
        channelId: values.channelId || undefined,
        landingPage: values.landingPage?.trim() || undefined,
        utmSource: values.utmSource?.trim() || undefined,
        utmMedium: values.utmMedium?.trim() || undefined,
        utmCampaign: values.utmCampaign?.trim() || undefined,
        assignedSaleId,
        creatorEmployeeId,
      });

      message.success('Tạo khách hàng tiềm năng thành công!');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể tạo khách hàng tiềm năng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<Text strong style={{ fontSize: 16 }}>Tạo Khách Hàng Tiềm Năng Mới (Lead)</Text>}
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

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          platformId: undefined,
          channelId: undefined,
        }}
      >
        <Form.Item
          name="fullName"
          label="Họ và tên"
          rules={[{ required: true, message: 'Vui lòng nhập họ và tên khách hàng' }]}
        >
          <Input prefix={<UserOutlined />} placeholder="Ví dụ: Nguyễn Văn A" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="phone"
              label="Số điện thoại"
              rules={[
                { pattern: /^[0-9+() -]{8,20}$/, message: 'Số điện thoại không hợp lệ' },
              ]}
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

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="platformId" label="Nền tảng tiếp thị">
              <Select
                placeholder="Trực tiếp / Nhập thủ công"
                allowClear
                options={platforms.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.code})`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="channelId" label="Kênh tiếp thị">
              <Select
                placeholder="Trực tiếp / Nhập thủ công"
                allowClear
                options={channels.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.code})`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="landingPage" label="Đường dẫn trang đích (Landing Page)">
          <Input prefix={<GlobalOutlined />} placeholder="https://example.com/landing" />
        </Form.Item>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="utmSource" label="UTM Source">
              <Input placeholder="google, facebook..." />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="utmMedium" label="UTM Medium">
              <Input placeholder="cpc, organic..." />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="utmCampaign" label="UTM Campaign">
              <Input placeholder="q3_campaign..." />
            </Form.Item>
          </Col>
        </Row>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            Tạo Lead
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
