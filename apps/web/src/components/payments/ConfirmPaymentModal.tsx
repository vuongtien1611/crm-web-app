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
          <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary">Mã thanh toán:</Text>
              <Text strong>{payment.payment_code}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">Số tiền thực thu nhận được:</Text>
              <Text strong style={{ color: '#0C6B37', fontSize: 16 }}>
                {Number(payment.gross_cash_amount).toLocaleString('vi-VN')} ₫
              </Text>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#475569', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '10px 12px', borderRadius: 8 }}>
            ℹ️ <strong>Hậu quả nghiệp vụ:</strong> Xác nhận giao dịch sẽ chốt doanh thu tiền về tài khoản công ty, ghi nhận dòng tiền và kích hoạt điều kiện giải ngân hoa hồng/KPI.
          </div>
        </div>
      )}

      <Form className="vmax-form" form={form} layout="vertical">
        <Form.Item
          name="installmentId"
          label="Mã đợt thanh toán phân bổ (Tùy chọn)"
          extra="Để trống nếu chỉ muốn xác nhận tiền về và thực hiện phân bổ chi tiết sau tại màn hình đơn hàng."
        >
          <InputNumber style={{ width: '100%' }} placeholder="Nhập số thứ tự đợt (nếu có)" min={1} />
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
            placeholder="50.000.000"
            formatter={(value) => (value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')}
            parser={(value) => (value ? Number(value.replace(/\$\s?|(\.*)|(,*)/g, '')) : (0 as any))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
