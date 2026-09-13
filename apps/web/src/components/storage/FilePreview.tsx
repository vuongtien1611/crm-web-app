import React, { useState } from 'react';
import { Button, Modal, Spin, message, Space, Typography } from 'antd';
import {
  EyeOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileOutlined,
} from '@ant-design/icons';
import {
  getPaymentProofApi,
  getProjectAcceptanceEvidenceApi,
  getSubscriptionAcceptanceEvidenceApi,
  getProjectAttachmentApi,
} from '../../api/storage';

const { Text } = Typography;

export type FilePreviewSource =
  | { type: 'payment'; paymentId: string | number }
  | { type: 'project-acceptance'; projectId: string | number }
  | { type: 'service-period-acceptance'; periodId: string | number }
  | { type: 'project-attachment'; projectId: string | number; attachmentId: string | number }
  | { type: 'direct'; directUrl: string };

interface FilePreviewProps {
  source: FilePreviewSource;
  filename?: string;
  buttonText?: string;
  size?: 'small' | 'middle' | 'large';
  type?: 'link' | 'primary' | 'default';
  iconOnly?: boolean;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  source,
  filename,
  buttonText = 'Xem tài liệu',
  size = 'middle',
  type = 'default',
  iconOnly = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchDownloadUrl = async (): Promise<string> => {
    if (source.type === 'direct') {
      return source.directUrl;
    }
    if (source.type === 'payment') {
      const res = await getPaymentProofApi(source.paymentId);
      return res.downloadUrl;
    }
    if (source.type === 'project-acceptance') {
      const res = await getProjectAcceptanceEvidenceApi(source.projectId);
      return res.downloadUrl;
    }
    if (source.type === 'service-period-acceptance') {
      const res = await getSubscriptionAcceptanceEvidenceApi(source.periodId);
      return res.downloadUrl;
    }
    if (source.type === 'project-attachment') {
      const res = await getProjectAttachmentApi(source.projectId, source.attachmentId);
      return res.downloadUrl;
    }
    throw new Error('Loại tài liệu không hợp lệ');
  };

  const handleOpen = async () => {
    try {
      setLoading(true);
      const url = await fetchDownloadUrl();
      setPreviewUrl(url);

      const lowerName = (filename || url).toLowerCase();
      const isImg = lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp');

      if (isImg) {
        setModalVisible(true);
      } else {
        // Open PDF or other file in new tab
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      message.error(err.message || 'Không thể mở tài liệu (quyền truy cập bị từ chối)');
    } finally {
      setLoading(false);
    }
  };

  const lowerFilename = (filename || '').toLowerCase();
  const isPdf = lowerFilename.endsWith('.pdf');
  const isImage = lowerFilename.endsWith('.png') || lowerFilename.endsWith('.jpg') || lowerFilename.endsWith('.jpeg') || lowerFilename.endsWith('.webp');

  const renderIcon = () => {
    if (isPdf) return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
    if (isImage) return <FileImageOutlined style={{ color: '#1890ff' }} />;
    return <FileOutlined />;
  };

  return (
    <>
      <Button
        type={type}
        size={size}
        icon={iconOnly ? renderIcon() : <EyeOutlined />}
        loading={loading}
        onClick={handleOpen}
      >
        {!iconOnly && buttonText}
      </Button>

      <Modal
        open={modalVisible}
        title={
          <Space direction="horizontal">
            {renderIcon()}
            <Text strong>{filename || 'Xem trước hình ảnh tài liệu'}</Text>
          </Space>
        }
        footer={[
          <Button
            key="download"
            icon={<DownloadOutlined />}
            onClick={() => {
              if (previewUrl) window.open(previewUrl, '_blank');
            }}
          >
            Tải về
          </Button>,
          <Button key="close" type="primary" onClick={() => setModalVisible(false)}>
            Đóng
          </Button>,
        ]}
        onCancel={() => setModalVisible(false)}
        width={700}
        centered
      >
        <div style={{ textAlign: 'center', padding: '16px 0', minHeight: 200 }}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={filename || 'Tài liệu'}
              style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 4 }}
            />
          ) : (
            <Spin />
          )}
        </div>
      </Modal>
    </>
  );
};
