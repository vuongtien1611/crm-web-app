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
  const validChildren = React.Children.toArray(children).filter(Boolean);
  const count = validChildren.length;

  const getColSpan = () => {
    if (count <= 1) return { xs: 24, sm: 24, md: 24, lg: 24 };
    if (count === 2) return { xs: 24, sm: 12, md: 12, lg: 12 };
    if (count === 3) return { xs: 24, sm: 12, md: 8, lg: 8 };
    if (count === 4) return { xs: 24, sm: 12, md: 12, lg: 6, xl: 6 };
    return { xs: 24, sm: 12, md: 8, lg: 6, xl: 6 };
  };

  const defaultSpan = getColSpan();

  return (
    <div className={`vmax-summary-grid ${className}`}>
      <Row gutter={gutter} align="stretch" style={{ width: '100%' }}>
        {validChildren.map((child, idx) => {
          if (
            React.isValidElement(child) &&
            (child.type === DetailSummaryItem ||
              (child.type as any)?.displayName === 'Col' ||
              (child.props as any)?.xs !== undefined)
          ) {
            return child;
          }
          return (
            <Col key={idx} {...defaultSpan} style={{ display: 'flex' }}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                {child}
              </div>
            </Col>
          );
        })}
      </Row>
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
