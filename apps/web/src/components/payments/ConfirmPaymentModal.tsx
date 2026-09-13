import React, { useState } from 'react';
import { Modal, Form, InputNumber, Typography, App } from 'antd';
import { confirmPaymentApi, PaymentItem } from '../../api/payments';

const { Text } = Typography;

interface ConfirmPaymentModalProps {
  payment: PaymentItem | null;
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export const ConfirmPaymentModal: React.FC<ConfirmPaymentModalProps> = ({
  payment,
  visible,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!payment) return;
    try {
      const values = await form.validateFields();
      setLoading(true);

      const allocations = values.installmentId && values.grossAllocatedAmount
        ? [{ installmentId: String(values.installmentId), grossAllocatedAmount: values.grossAllocatedAmount }]
        : [];

      await confirmPaymentApi(payment.id, { allocations });
      message.success('Xác nhận thanh toán thành công!');
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Xác nhận giao dịch thanh toán"
      open={visible}
      onCancel={onCancel}
      onOk={handleConfirm}
      confirmLoading={loading}
      okText="Xác nhận & Phân bổ"
      okButtonProps={{ danger: false, type: 'primary' }}
    >
      {payment && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">Mã thanh toán: </Text>
          <Text strong>{payment.payment_code}</Text>
          <br />
          <Text type="secondary">Số tiền thực thu nhận được: </Text>
          <Text strong style={{ color: '#52c41a', fontSize: 16 }}>
            {Number(payment.gross_cash_amount).toLocaleString('vi-VN')} ₫
          </Text>
        </div>
      )}

      <Form className="vmax-form" form={form} layout="vertical">
        <Form.Item
          name="installmentId"
          label="ID đợt thanh toán đích (Tùy chọn phân bổ)"
          extra="Nhập ID đợt thanh toán để phân bổ số tiền ngay khi xác nhận"
        >
          <InputNumber style={{ width: '100%' }} placeholder="Ví dụ: 1" min={1} />
        </Form.Item>

        <Form.Item
          name="grossAllocatedAmount"
          label="Số tiền thực thu phân bổ (VND)"
          extra="Phải nhỏ hơn hoặc bằng tổng số tiền thực thu của giao dịch"
        >
          <InputNumber
            style={{ width: '100%' }}
            min={1000}
            step={100000}
            placeholder="50,000,000"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
