import React, { useState } from 'react';
import { Modal, Button, Alert, Space, Typography, Descriptions, App } from 'antd';
import { TrophyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { markWonApi } from '../../api/deals';
import { formatCurrency } from '../../constants/labels';
import { useAuthStore } from '../../store/authStore';

const { Text, Paragraph } = Typography;

interface Props {
  isOpen: boolean;
  dealId: string;
  dealName: string;
  closingSaleName: string | null;
  expectedValue: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealWonConfirmModal: React.FC<Props> = ({
  isOpen,
  dealId,
  dealName,
  closingSaleName,
  expectedValue,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const effectiveClosingSale = closingSaleName || user?.fullName || 'Nhân viên phụ trách';

  const handleConfirm = async () => {
    setError('');
    setLoading(true);

    try {
      await markWonApi(dealId);
      message.success('Xác nhận THẮNG DEAL thành công! Đơn hàng mới đã được tự động khởi tạo.');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể xác nhận THẮNG DEAL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <TrophyOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <Text strong style={{ fontSize: 16 }}>Xác nhận THẮNG DEAL (Chốt Hợp Đồng)</Text>
        </Space>
      }
      open={isOpen}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={loading}>
          Hủy
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={loading}
          onClick={handleConfirm}
          style={{ background: '#0C6B37', borderColor: '#0C6B37' }}
        >
          Xác nhận THẮNG DEAL
        </Button>,
      ]}
      destroyOnHidden
      width={520}
    >
      <Descriptions
        bordered
        size="small"
        column={1}
        style={{ marginTop: 16, marginBottom: 16 }}
      >
        <Descriptions.Item label="Cơ hội (Deal)">
          <Text strong>{dealName}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Giá trị kỳ vọng">
          <Text strong style={{ color: '#0C6B37' }}>
            {formatCurrency(expectedValue)}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Sale chốt ghi nhận">
          <Text strong style={{ color: '#1677ff' }}>
            {effectiveClosingSale}
          </Text>
        </Descriptions.Item>
      </Descriptions>

      <Alert
        type="success"
        showIcon
        message="Tự động tạo Đơn hàng (Draft Order)"
        description="Khi xác nhận Thắng Deal, hệ thống sẽ tự động tạo một Đơn hàng nháp (Draft) gắn liền với doanh nghiệp và cơ hội này. Bạn có thể kiểm tra chi tiết và Gửi duyệt lên Ban Giám đốc (Boss)."
        style={{ marginBottom: 16 }}
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
    </Modal>
  );
};
