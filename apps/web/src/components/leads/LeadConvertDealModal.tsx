import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Button, Row, Col, Alert, Typography, App } from 'antd';
import { RocketOutlined, BankOutlined, UserOutlined, PhoneOutlined, MailOutlined, DollarOutlined, FileTextOutlined } from '@ant-design/icons';
import { convertLeadToDealApi } from '../../api/leads';

const { Text } = Typography;

interface Props {
  isOpen: boolean;
  leadId: string;
  defaultContactName: string;
  defaultPhone: string;
  defaultEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadConvertDealModal: React.FC<Props> = ({
  isOpen,
  leadId,
  defaultContactName,
  defaultPhone,
  defaultEmail,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      form.setFieldsValue({
        companyName: defaultContactName ? `${defaultContactName} Corp` : '',
        taxCode: '',
        contactName: defaultContactName || '',
        contactPhone: defaultPhone || '',
        contactEmail: defaultEmail || '',
        dealName: defaultContactName ? `Cơ hội - ${defaultContactName}` : '',
        expectedValue: 10000000,
      });
    }
  }, [isOpen, defaultContactName, defaultPhone, defaultEmail, form]);

  const handleSubmit = async (values: any) => {
    setError('');
    setLoading(true);

    try {
      await convertLeadToDealApi(leadId, {
        companyName: values.companyName.trim(),
        taxCode: values.taxCode?.trim() || undefined,
        contactName: values.contactName.trim(),
        contactPhone: values.contactPhone?.trim() || undefined,
        contactEmail: values.contactEmail?.trim() || undefined,
        dealName: values.dealName.trim(),
        expectedValue: values.expectedValue || 0,
      });

      message.success('Chuyển đổi Lead thành Deal thành công!');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể chuyển đổi Lead thành Deal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Text strong style={{ fontSize: 16 }}>
          <RocketOutlined style={{ color: '#0C6B37', marginRight: 8 }} />
          Chuyển đổi Lead thành Cơ hội (Deal)
        </Text>
      }
      open={isOpen}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={640}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Chuyển đổi khách hàng TIỀM NĂNG này sẽ tự động tạo một Doanh nghiệp (Account), Người liên hệ chính (Contact), và Cơ hội bán hàng (Deal) tương ứng để bắt đầu đàm phán."
      />

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
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item
              name="companyName"
              label="Tên doanh nghiệp / Công ty"
              rules={[{ required: true, message: 'Vui lòng nhập tên công ty' }]}
            >
              <Input prefix={<BankOutlined />} placeholder="Ví dụ: Công ty TNHH ABC" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="taxCode" label="Mã số thuế (MST)">
              <Input placeholder="0312345678" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item
              name="contactName"
              label="Người liên hệ chính"
              rules={[{ required: true, message: 'Vui lòng nhập tên người liên hệ' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn A" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="contactPhone" label="Số điện thoại">
              <Input prefix={<PhoneOutlined />} placeholder="0987654321" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="contactEmail" label="Email">
              <Input prefix={<MailOutlined />} placeholder="email@example.com" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={14}>
            <Form.Item
              name="dealName"
              label="Tên cơ hội bán hàng (Deal Name)"
              rules={[{ required: true, message: 'Vui lòng nhập tên cơ hội' }]}
            >
              <Input prefix={<FileTextOutlined />} placeholder="Ví dụ: Triển khai phần mềm CRM" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item
              name="expectedValue"
              label="Giá trị kỳ vọng (VND)"
              rules={[{ required: true, message: 'Vui lòng nhập giá trị kỳ vọng' }]}
            >
              <InputNumber
                prefix={<DollarOutlined />}
                style={{ width: '100%' }}
                formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(val) => Number(val ? val.replace(/\$\s?|(,*)/g, '') : 0) as any}
                placeholder="10,000,000"
                min={0}
              />
            </Form.Item>
          </Col>
        </Row>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={loading} icon={<RocketOutlined />}>
            Tạo Deal & Chuyển đổi
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
