import React from 'react';
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

export interface DetailPageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  status?: React.ReactNode;
  code?: string | React.ReactNode;
  backUrl?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  extra?: React.ReactNode;
  metaTags?: React.ReactNode;
}

export const DetailPageHeader: React.FC<DetailPageHeaderProps> = ({
  title,
  subtitle,
  icon,
  status,
  code,
  backUrl,
  onBack,
  backLabel = 'Quay lại',
  actions,
  extra,
  metaTags,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backUrl) {
      navigate(backUrl);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="vmax-detail-header">
      {/* Top Nav & Code */}
      <div className="vmax-detail-header-top">
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          className="vmax-detail-back-btn"
        >
          {backLabel}
        </Button>
        {code && (
          <div className="vmax-detail-code">
            {typeof code === 'string' ? `Mã: #${code}` : code}
          </div>
        )}
      </div>

      {/* Main Title, Status & Actions */}
      <div className="vmax-detail-header-main">
        <div className="vmax-detail-header-title-group">
          {icon && <div className="vmax-detail-header-icon">{icon}</div>}
          <div>
            <div className="vmax-detail-header-heading">
              <Title level={3} className="vmax-detail-title">
                {title}
              </Title>
              {status && <div className="vmax-detail-status">{status}</div>}
            </div>
            {subtitle && (
              <div className="vmax-detail-subtitle">
                {typeof subtitle === 'string' ? <Text type="secondary">{subtitle}</Text> : subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {(actions || extra) && (
          <div className="vmax-detail-actions">
            <Space wrap size={10} style={{ width: '100%', flexWrap: 'wrap' }}>
              {actions}
              {extra}
            </Space>
          </div>
        )}
      </div>

      {/* Meta tags strip */}
      {metaTags && <div className="vmax-detail-meta-strip">{metaTags}</div>}
    </div>
  );
};
