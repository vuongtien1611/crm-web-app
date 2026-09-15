import React, { useState } from 'react';
import { Modal, Form, Input, App } from 'antd';
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
  const { message } = App.useApp();
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
      destroyOnHidden
      afterClose={() => form.resetFields()}
      okText={actionType === 'REQUEST_MORE_INFO' ? 'Gửi yêu cầu' : (actionType === 'REJECT' ? 'Xác nhận từ chối' : 'Xác nhận hủy')}
      okButtonProps={{ danger: actionType === 'CANCEL' || actionType === 'REJECT' }}
    >
      <div style={{ marginBottom: 16 }}>
        {actionType === 'CANCEL' && (
          <div style={{ fontSize: 13, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 12px', borderRadius: 8 }}>
            ⚠️ <strong>Cảnh báo:</strong> Hủy đơn hàng sẽ dừng toàn bộ quá trình xử lý và triển khai dịch vụ liên quan. Thao tác này không thể hoàn tác.
          </div>
        )}
        {actionType === 'REJECT' && (
          <div style={{ fontSize: 13, color: '#9A3412', background: '#FFF7ED', border: '1px solid #FFEDD5', padding: '10px 12px', borderRadius: 8 }}>
            ⚠️ <strong>Hậu quả:</strong> Từ chối đơn hàng sẽ chuyển trạng thái sang Đã từ chối. Nhân viên kinh doanh phụ trách sẽ nhận được thông báo kèm lý do để liên hệ lại khách hàng.
          </div>
        )}
        {actionType === 'REQUEST_MORE_INFO' && (
          <div style={{ fontSize: 13, color: '#1E40AF', background: '#EFF6FF', border: '1px solid #DBEAFE', padding: '10px 12px', borderRadius: 8 }}>
            ℹ️ <strong>Thông báo:</strong> Đơn hàng sẽ được chuyển về trạng thái Cần bổ sung thông tin để Sale cập nhật lại yêu cầu hoặc điều khoản trước khi trình duyệt lại.
          </div>
        )}
      </div>

      <Form className="vmax-form" form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="text"
          label={actionType === 'REQUEST_MORE_INFO' ? 'Chi tiết thông tin cần bổ sung' : 'Lý do bắt buộc'}
          rules={[{ required: true, message: 'Vui lòng cung cấp thông tin chi tiết' }]}
        >
          <Input.TextArea rows={4} placeholder={actionType === 'REQUEST_MORE_INFO' ? 'Ghi rõ các nội dung hồ sơ, kỹ thuật cần Sale cung cấp thêm...' : 'Nhập chi tiết lý do từ chối hoặc hủy đơn hàng...'} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
