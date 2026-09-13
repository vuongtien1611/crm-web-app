import React from 'react';
import { Space, Typography } from 'antd';

const { Title } = Typography;

export interface DetailInfoItem {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  span?: number; // 1 or 2
  action?: React.ReactNode;
  onClick?: () => void;
}

export interface DetailInfoCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  items?: DetailInfoItem[];
  children?: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
  style?: React.CSSProperties;
}

export const DetailInfoCard: React.FC<DetailInfoCardProps> = ({
  title,
  subtitle,
  icon,
  extra,
  items,
  children,
  columns = 2,
  className = '',
  style,
}) => {
  return (
    <div className={`vmax-info-card ${className}`} style={style}>
      {/* Card Header */}
      <div className="vmax-info-card-header">
        <div className="vmax-info-card-header-left">
          {icon && <div className="vmax-info-card-header-icon">{icon}</div>}
          <div>
            <Title level={5} className="vmax-info-card-title">
              {title}
            </Title>
            {subtitle && <div className="vmax-info-card-subtitle">{subtitle}</div>}
          </div>
        </div>
        {extra && <div className="vmax-info-card-extra">{extra}</div>}
      </div>

      {/* Card Body */}
      <div className="vmax-info-card-body">
        {items && items.length > 0 && (
          <div
            className={`vmax-info-grid columns-${columns}`}
          >
            {items.map((item, index) => (
              <div
                key={index}
                className={`vmax-info-item ${item.span === 2 ? 'span-2' : ''} ${item.onClick ? 'clickable' : ''}`}
                onClick={item.onClick}
              >
                <div className="vmax-info-item-label-group">
                  {item.icon && <span className="vmax-info-item-icon">{item.icon}</span>}
                  <span className="vmax-info-item-label">{item.label}</span>
                </div>
                <div className="vmax-info-item-value-group">
                  <span className="vmax-info-item-value">{item.value ?? '—'}</span>
                  {item.action && <span className="vmax-info-item-action">{item.action}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
