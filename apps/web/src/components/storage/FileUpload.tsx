import React, { useState } from 'react';
import { Upload, message, Button, Card, Typography, Space, Progress } from 'antd';
import {
  InboxOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { uploadFileApi, UploadResponse } from '../../api/storage';

const { Dragger } = Upload;
const { Text } = Typography;

interface FileUploadProps {
  entityType: 'payments' | 'project-acceptances' | 'service-period-acceptances' | 'projects' | 'orders';
  entityId: string | number;
  label?: string;
  accept?: string;
  maxSizeMb?: number;
  value?: string; // current objectKey
  onChange?: (objectKey: string | null) => void;
  onSuccess?: (res: UploadResponse) => void;
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  entityType,
  entityId,
  label = 'Tải tài liệu đính kèm',
  accept = '.pdf,.png,.jpg,.jpeg,.webp',
  maxSizeMb = 10,
  value,
  onChange,
  onSuccess,
  disabled = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<{
    name: string;
    size: number;
    objectKey: string;
    type?: string;
  } | null>(
    value ? { name: value.split('/').pop() || value, size: 0, objectKey: value } : null,
  );

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCustomRequest = async ({ file, onSuccess: onReqSuccess, onError: onReqError }: any) => {
    const rawFile = file as File;

    if (rawFile.size > maxSizeMb * 1024 * 1024) {
      message.error(`Dung lượng tệp vượt quá ${maxSizeMb}MB`);
      onReqError(new Error('File oversized'));
      return;
    }

    try {
      setUploading(true);
      setProgress(25);
      const timer = setInterval(() => {
        setProgress((prev) => (prev < 90 ? prev + 15 : prev));
      }, 150);

      const res = await uploadFileApi(entityType, entityId, rawFile);
      clearInterval(timer);
      setProgress(100);

      setCurrentFile({
        name: res.filename,
        size: res.size,
        objectKey: res.objectKey,
        type: res.mimeType,
      });

      if (onChange) onChange(res.objectKey);
      if (onSuccess) onSuccess(res);
      if (onReqSuccess) onReqSuccess(res);
      message.success('Tải tệp lên thành công!');
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi tải tệp lên');
      if (onReqError) onReqError(err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setCurrentFile(null);
    setProgress(0);
    if (onChange) onChange(null);
  };

  const isPdf = currentFile?.name.toLowerCase().endsWith('.pdf') || currentFile?.type === 'application/pdf';

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <Text strong style={{ display: 'block', marginBottom: 6 }}>
          {label}
        </Text>
      )}

      {currentFile ? (
        <Card size="small" style={{ borderRadius: 6, borderColor: '#52c41a' }}>
          <Space direction="horizontal" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              {isPdf ? (
                <FilePdfOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
              ) : (
                <FileImageOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              )}
              <div>
                <Text strong>{currentFile.name}</Text>
                {currentFile.size > 0 && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatBytes(currentFile.size)}
                    </Text>
                  </div>
                )}
                <div style={{ color: '#52c41a', fontSize: 12 }}>
                  <CheckCircleOutlined /> Đã tải lên
                </div>
              </div>
            </Space>

            {!disabled && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={handleRemove}
                title="Xóa tệp để tải lại"
              />
            )}
          </Space>
        </Card>
      ) : (
        <Dragger
          accept={accept}
          customRequest={handleCustomRequest}
          showUploadList={false}
          disabled={disabled || uploading}
          style={{ padding: 12, borderRadius: 6 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 13, margin: 0 }}>
            Kéo thả hoặc nhấp để tải tài liệu (PDF, PNG, JPG, WEBP)
          </p>
          <p className="ant-upload-hint" style={{ fontSize: 11, color: '#8c8c8c', margin: '4px 0 0' }}>
            Dung lượng tối đa: {maxSizeMb}MB
          </p>
          {uploading && <Progress percent={progress} size="small" status="active" style={{ marginTop: 8 }} />}
        </Dragger>
      )}
    </div>
  );
};
