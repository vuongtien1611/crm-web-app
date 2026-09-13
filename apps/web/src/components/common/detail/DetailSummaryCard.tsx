import React from 'react';
import { Row, Col, Typography } from 'antd';

const { Text } = Typography;

export interface DetailSummaryCardProps {
  title: React.ReactNode;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tag?: React.ReactNode;
  valueColor?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DetailSummaryCard: React.FC<DetailSummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  tag,
  valueColor,
  onClick,
  className = '',
  style,
}) => {
  return (
    <div
      className={`vmax-summary-card ${onClick ? 'clickable' : ''} ${className}`}
      onClick={onClick}
      style={style}
    >
      <div className="vmax-summary-card-inner">
        <div className="vmax-summary-card-content">
          <div className="vmax-summary-card-header">
            <span className="vmax-summary-card-title">{title}</span>
            {tag && <div className="vmax-summary-card-tag">{tag}</div>}
          </div>
          <div
            className="vmax-summary-card-value"
            style={valueColor ? { color: valueColor } : undefined}
          >
            {value}
          </div>
          {subtitle && (
            <div className="vmax-summary-card-subtitle">
              {typeof subtitle === 'string' ? <Text type="secondary">{subtitle}</Text> : subtitle}
            </div>
          )}
        </div>
        {icon && <div className="vmax-summary-card-icon">{icon}</div>}
      </div>
    </div>
  );
};

export interface DetailSummaryGridProps {
  children: React.ReactNode;
  className?: string;
  gutter?: [number, number];
}

export const DetailSummaryGrid: React.FC<DetailSummaryGridProps> = ({
  children,
  className = '',
  gutter = [16, 16],
}) => {
  return (
    <div className={`vmax-summary-grid ${className}`}>
      <Row gutter={gutter}>{children}</Row>
    </div>
  );
};

export interface DetailSummaryItemProps {
  children: React.ReactNode;
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
}

export const DetailSummaryItem: React.FC<DetailSummaryItemProps> = ({
  children,
  xs = 24,
  sm = 12,
  lg = 6,
  ...rest
}) => {
  return (
    <Col xs={xs} sm={sm} lg={lg} {...rest}>
      {children}
    </Col>
  );
};
