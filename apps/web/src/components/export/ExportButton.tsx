import React, { useState } from 'react';
import { Button, message } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { downloadExportFile } from '../../api/export';
import { useAuthStore } from '../../store/authStore';

export interface ExportButtonProps {
  endpoint: string;
  requiredPermission?: string;
  filters?: Record<string, any>;
  defaultFilename?: string;
  label?: string;
  size?: 'small' | 'middle' | 'large';
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text';
  disabled?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  endpoint,
  requiredPermission,
  filters = {},
  defaultFilename,
  label = 'Xuất Excel',
  size = 'middle',
  type = 'default',
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);

  // Frontend button visibility based on the corresponding READ permission
  if (requiredPermission) {
    const hasPerm =
      user?.roles?.includes('ADMIN') ||
      user?.roles?.includes('BOSS') ||
      user?.permissions?.includes(requiredPermission);
    if (!hasPerm) {
      return null;
    }
  }

  const handleExport = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const filename = defaultFilename || `export_${today}.xlsx`;
      await downloadExportFile(endpoint, filters, filename);
      message.success('Xuất file thành công!');
    } catch (err: any) {
      message.error(err.message || 'Xuất file thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      icon={<FileExcelOutlined />}
      size={size}
      type={type}
      loading={loading}
      disabled={disabled}
      onClick={handleExport}
    >
      {label}
    </Button>
  );
};
