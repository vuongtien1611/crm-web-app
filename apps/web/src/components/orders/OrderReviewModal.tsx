import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { requestMoreInfoApi, rejectOrderApi, cancelOrderApi } from '../../api/orders';

interface OrderReviewModalProps {
  visible: boolean;
  orderId: string;
  actionType: 'REQUEST_MORE_INFO' | 'REJECT' | 'CANCEL';
  onClose: () => void;
  onSuccess: () => void;
}

export const OrderReviewModal: React.FC<OrderReviewModalProps> = ({
  visible,
  orderId,
  actionType,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const getTitle = () => {
    switch (actionType) {
      case 'REQUEST_MORE_INFO':
        return 'Yêu cầu bổ sung thông tin';
      case 'REJECT':
        return 'Từ chối đơn hàng';
      case 'CANCEL':
        return 'Hủy đơn hàng';
    }
  };

  const handleFinish = async (values: { text: string }) => {
    setLoading(true);
    try {
      if (actionType === 'REQUEST_MORE_INFO') {
        await requestMoreInfoApi(orderId, values.text);
        message.success('Đã gửi yêu cầu bổ sung thông tin thành công');
      } else if (actionType === 'REJECT') {
        await rejectOrderApi(orderId, values.text);
        message.success('Đã từ chối đơn hàng thành công');
      } else if (actionType === 'CANCEL') {
        await cancelOrderApi(orderId, values.text);
        message.success('Đã hủy đơn hàng thành công');
      }
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      title={getTitle()}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
    >
      <Form className="vmax-form" form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="text"
          label={actionType === 'REQUEST_MORE_INFO' ? 'Ghi chú / Chi tiết cần bổ sung' : 'Lý do'}
          rules={[{ required: true, message: 'Vui lòng cung cấp thông tin chi tiết' }]}
        >
          <Input.TextArea rows={4} placeholder="Nhập ghi chú hoặc lý do tại đây..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
