import React from 'react';
import { Tag, Typography } from 'antd';

const { Title } = Typography;

export interface DetailRelatedListProps {
  title: React.ReactNode;
  count?: number | React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export const DetailRelatedList: React.FC<DetailRelatedListProps> = ({
  title,
  count,
  icon,
  extra,
  children,
  className = '',
  style,
  bodyStyle,
}) => {
  return (
    <div className={`vmax-related-card ${className}`} style={style}>
      <div className="vmax-related-card-header">
        <div className="vmax-related-card-title-group">
          {icon && <div className="vmax-related-card-icon">{icon}</div>}
          <Title level={5} className="vmax-related-card-title">
            {title}
          </Title>
          {count !== undefined && (
            <Tag className="vmax-related-card-count">
              {count}
            </Tag>
          )}
        </div>
        {extra && <div className="vmax-related-card-extra">{extra}</div>}
      </div>
      <div className="vmax-related-card-body" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
};
