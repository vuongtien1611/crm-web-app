import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, message } from 'antd';
import { addOrderItemApi } from '../../api/orders';

interface OrderAddItemModalProps {
  visible: boolean;
  orderId: string;
  defaultClosingSaleId?: string;
  defaultServiceId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const OrderAddItemModal: React.FC<OrderAddItemModalProps> = ({
  visible,
  orderId,
  defaultClosingSaleId,
  defaultServiceId,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: any) => {
    setLoading(true);
    try {
      await addOrderItemApi(orderId, {
        serviceId: values.serviceId,
        closingSaleId: values.closingSaleId,
        originalPrice: values.originalPrice,
        discountAmount: values.discountAmount || 0,
      });
      message.success('Đã thêm mục dịch vụ vào đơn hàng thành công');
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Thêm mục dịch vụ thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      title="Thêm mục dịch vụ mới vào đơn hàng"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
    >
      <Form
        className="vmax-form"
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          serviceId: defaultServiceId || '1',
          closingSaleId: defaultClosingSaleId || '1',
          originalPrice: 10000000,
          discountAmount: 0,
        }}
      >
        <Form.Item
          name="serviceId"
          label="ID dịch vụ"
          rules={[{ required: true, message: 'Vui lòng nhập ID dịch vụ' }]}
        >
          <Input placeholder="Nhập ID dịch vụ" />
        </Form.Item>
        <Form.Item
          name="closingSaleId"
          label="ID nhân viên chốt sale"
          rules={[{ required: true, message: 'Vui lòng nhập ID nhân viên chốt sale' }]}
        >
          <Input placeholder="Nhập ID nhân viên chốt sale" />
        </Form.Item>
        <Form.Item
          name="originalPrice"
          label="Đơn giá gốc (VND)"
          rules={[{ required: true, message: 'Vui lòng nhập đơn giá gốc' }]}
        >
          <InputNumber style={{ width: '100%' }} min={0} formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
        </Form.Item>
        <Form.Item name="discountAmount" label="Số tiền giảm giá (VND)">
          <InputNumber style={{ width: '100%' }} min={0} formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
