import React, { useState } from 'react';
import { Modal, Form, Input, Select, InputNumber, message } from 'antd';
import { createChangeRequestApi } from '../../api/orders';

interface CreateChangeRequestModalProps {
  visible: boolean;
  orderItemId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateChangeRequestModal: React.FC<CreateChangeRequestModalProps> = ({
  visible,
  orderItemId,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: any) => {
    setLoading(true);
    try {
      await createChangeRequestApi(orderItemId, {
        changeType: values.changeType,
        description: values.description,
        amountDelta: values.amountDelta || 0,
        daysDelta: values.daysDelta || 0,
      });
      message.success('Đã gửi yêu cầu thay đổi thành công');
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Gửi yêu cầu thay đổi thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      title="Gửi yêu cầu thay đổi (CR) cho dịch vụ đã duyệt"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
    >
      <Form
        className="vmax-form"
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{ changeType: 'SCOPE_CHANGE', amountDelta: 0, daysDelta: 0 }}
      >
        <Form.Item
          name="changeType"
          label="Loại thay đổi"
          rules={[{ required: true, message: 'Vui lòng chọn loại thay đổi' }]}
        >
          <Select
            options={[
              { label: 'Thay đổi phạm vi (Scope Change)', value: 'SCOPE_CHANGE' },
              { label: 'Thay đổi giá (Price Change)', value: 'PRICE_CHANGE' },
              { label: 'Hủy dịch vụ (Cancellation)', value: 'CANCELLATION' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="description"
          label="Mô tả thay đổi"
          rules={[{ required: true, message: 'Vui lòng nhập mô tả chi tiết' }]}
        >
          <Input.TextArea rows={3} placeholder="Mô tả chi tiết yêu cầu thay đổi phạm vi hoặc điều chỉnh giá trị..." />
        </Form.Item>
        <Form.Item name="amountDelta" label="Điều chỉnh số tiền (+/- VND)">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="daysDelta" label="Điều chỉnh tiến độ (+/- Ngày)">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
