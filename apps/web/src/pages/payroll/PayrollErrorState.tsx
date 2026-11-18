import React from 'react';
import { Button, Result, Space } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';

interface PayrollErrorStateProps {
  status?: number;
  message?: string | null;
  notFoundTitle: string;
  notFoundSubTitle: string;
  backLabel: string;
  onBack: () => void;
  onRetry: () => void;
}

/**
 * Shared error / empty-record view for payroll detail routes so 404/403/network
 * failures render actionable feedback instead of a permanent loading spinner.
 */
export const PayrollErrorState: React.FC<PayrollErrorStateProps> = ({
  status,
  message,
  notFoundTitle,
  notFoundSubTitle,
  backLabel,
  onBack,
  onRetry,
}) => {
  const resultStatus = status === 403 ? '403' : status === 404 ? '404' : 'error';
  const title =
    status === 403
      ? 'Không có quyền truy cập'
      : status === 404
        ? notFoundTitle
        : 'Không thể tải dữ liệu bảng lương';
  const subTitle =
    status === 403
      ? message || 'Bạn không có quyền xem dữ liệu bảng lương này.'
      : status === 404
        ? message || notFoundSubTitle
        : message || 'Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.';

  return (
    <div className="vmax-detail-page">
      <Result
        status={resultStatus}
        title={title}
        subTitle={subTitle}
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
              {backLabel}
            </Button>
            <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
              Thử lại
            </Button>
          </Space>
        }
      />
    </div>
  );
};
