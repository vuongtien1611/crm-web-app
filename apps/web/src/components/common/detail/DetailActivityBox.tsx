import React from 'react';
import { Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';

const { Title } = Typography;

export interface DetailActivityBoxProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const DetailActivityBox: React.FC<DetailActivityBoxProps> = ({
  title = 'Nhật ký Hoạt động & Tương tác',
  icon = <HistoryOutlined />,
  extra,
  children,
  className = '',
  style,
}) => {
  return (
    <div className={`vmax-activity-box ${className}`} style={style}>
      <div className="vmax-activity-box-header">
        <div className="vmax-activity-box-title-group">
          {icon && <div className="vmax-activity-box-icon">{icon}</div>}
          <Title level={5} className="vmax-activity-box-title">
            {title}
          </Title>
        </div>
        {extra && <div className="vmax-activity-box-extra">{extra}</div>}
      </div>
      <div className="vmax-activity-box-body">
        {children}
      </div>
    </div>
  );
};
