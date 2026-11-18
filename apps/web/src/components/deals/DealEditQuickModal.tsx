import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Button, Alert, Typography, App } from 'antd';
import { EditOutlined, FileTextOutlined, DollarOutlined } from '@ant-design/icons';
import { updateDealApi } from '../../api/deals';

const { Text } = Typography;

interface Props {
  isOpen: boolean;
  dealId: string;
  initialDealName: string;
  initialExpectedValue?: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealEditQuickModal: React.FC<Props> = ({
  isOpen,
  dealId,
  initialDealName,
  initialExpectedValue,
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
        dealName: initialDealName || '',
        expectedValue: initialExpectedValue !== undefined ? Number(initialExpectedValue) : 0,
      });
    }
  }, [isOpen, initialDealName, initialExpectedValue, form]);

  const handleSubmit = async (values: any) => {
    setError('');
    setLoading(true);

    try {
      await updateDealApi(dealId, {
        dealName: values.dealName.trim(),
        expectedValue: values.expectedValue || 0,
      });

      message.success('Chỉnh sửa Deal thành công!');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể cập nhật Deal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Text strong style={{ fontSize: 16 }}>
          <EditOutlined style={{ color: '#0C6B37', marginRight: 8 }} />
          Chỉnh sửa Cơ hội bán hàng (Deal #{dealId})
        </Text>
      }
      open={isOpen}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={520}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Chỉnh sửa thông tin cơ hội bán hàng đã liên kết. Thao tác này không thay đổi trạng thái của Lead."
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
        <Form.Item
          name="dealName"
          label="Tên cơ hội bán hàng (Deal Name)"
          rules={[{ required: true, message: 'Vui lòng nhập tên cơ hội bán hàng' }]}
        >
          <Input prefix={<FileTextOutlined />} placeholder="Ví dụ: Triển khai phần mềm CRM" />
        </Form.Item>

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={loading} icon={<EditOutlined />}>
            Lưu thay đổi
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
