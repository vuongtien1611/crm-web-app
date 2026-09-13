import React from 'react';
import { Typography } from 'antd';
import { FileSearchOutlined } from '@ant-design/icons';

const { Title } = Typography;

export interface DetailHistorySectionProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const DetailHistorySection: React.FC<DetailHistorySectionProps> = ({
  title = 'Lịch sử Thay đổi & Kiểm toán',
  icon = <FileSearchOutlined />,
  extra,
  children,
  className = '',
  style,
}) => {
  return (
    <div className={`vmax-history-section ${className}`} style={style}>
      <div className="vmax-history-section-header">
        <div className="vmax-history-section-title-group">
          {icon && <div className="vmax-history-section-icon">{icon}</div>}
          <Title level={5} className="vmax-history-section-title">
            {title}
          </Title>
        </div>
        {extra && <div className="vmax-history-section-extra">{extra}</div>}
      </div>
      <div className="vmax-history-section-body">
        {children}
      </div>
    </div>
  );
};
