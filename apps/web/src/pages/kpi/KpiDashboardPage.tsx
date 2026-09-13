import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Row, Col, Typography, Tag, Statistic, Space, Select, DatePicker, message, Modal, Descriptions, Button } from 'antd';
import { TrophyOutlined, FileTextOutlined, DollarOutlined, SolutionOutlined, EyeOutlined, UserOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { fetchKpiEvents, fetchEmployeeKpiSummary, KpiEventItem, KpiSummary } from '../../api/kpi';
import { getKpiSourceTypeLabel, formatCurrency, formatDate, formatDateTime } from '../../constants/labels';
import { createRowActionHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

export const KpiDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [events, setEvents] = useState<KpiEventItem[]>([]);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<KpiEventItem | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await fetchKpiEvents({
        page,
        limit: 10,
        sourceType: sourceTypeFilter || undefined,
      });
      setEvents(res.data);
      setTotalEvents(res.meta.total);
    } catch (err: any) {
      message.error('Không thể tải dữ liệu sự kiện KPI');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [page, sourceTypeFilter]);

  const columns = [
    {
      title: 'Nhân viên',
      dataIndex: 'employee_name',
      key: 'employee_name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Nguồn phát sinh',
      dataIndex: 'source_type',
      key: 'source_type',
      render: (type: string) => (
        <Tag color={type === 'PAYMENT_ALLOCATION' ? 'green' : type === 'PROJECT_ACCEPTANCE' ? 'blue' : 'purple'}>
          {getKpiSourceTypeLabel(type)}
        </Tag>
      ),
    },
    {
      title: 'Loại chỉ số',
      dataIndex: 'metric_type',
      key: 'metric_type',
      render: (metric: string) => <Text code>{metric}</Text>,
    },
    {
      title: 'Doanh thu hợp lệ',
      dataIndex: 'eligible_revenue',
      key: 'eligible_revenue',
      render: (val: number | null) => (val ? formatCurrency(val) : '-'),
    },
    {
      title: 'Điểm KPI',
      dataIndex: 'kpi_points',
      key: 'kpi_points',
      render: (val: number) => <Tag color="gold">{val} điểm</Tag>,
    },
    {
      title: 'Kỳ mục tiêu',
      dataIndex: 'target_kpi_period',
      key: 'target_kpi_period',
      render: (period: string) => <Text strong>{period}</Text>,
    },
    {
      title: 'Ngày ghi nhận',
      dataIndex: 'qualified_at',
      key: 'qualified_at',
      render: (date: string) => formatDate(date),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: KpiEventItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedEvent(record);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Title level={2} className="vmax-page-title">
            <TrophyOutlined style={{ color: 'var(--vmax-green)' }} /> Bảng điều khiển hiệu suất KPI
          </Title>
          <Text className="vmax-page-subtitle">
            Đánh giá doanh thu thực thu Sale, điểm nghiệm thu dự án Kỹ thuật và số lượng bài viết SEO.
          </Text>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card className="vmax-card">
            <Statistic
              title="Sự kiện doanh thu thực thu Sale"
              value={events.filter((e) => e.source_type === 'PAYMENT_ALLOCATION').length}
              prefix={<DollarOutlined style={{ color: 'var(--vmax-green)' }} />}
              valueStyle={{ color: 'var(--vmax-text)', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="vmax-card">
            <Statistic
              title="Sự kiện nghiệm thu dự án"
              value={events.filter((e) => e.source_type === 'PROJECT_ACCEPTANCE').length}
              prefix={<SolutionOutlined style={{ color: 'var(--vmax-green)' }} />}
              valueStyle={{ color: 'var(--vmax-text)', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="vmax-card">
            <Statistic
              title="Sự kiện bài viết SEO"
              value={events.filter((e) => e.source_type === 'SEO_ARTICLE').length}
              prefix={<FileTextOutlined style={{ color: 'var(--vmax-orange)' }} />}
              valueStyle={{ color: 'var(--vmax-text)', fontWeight: 800 }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 24 }}>
        <Space wrap>
          <Select
            placeholder="Lọc theo nguồn phát sinh"
            style={{ width: 260 }}
            allowClear
            onChange={(val) => setSourceTypeFilter(val || '')}
            options={[
              { label: 'Phân bổ thanh toán (Sale)', value: 'PAYMENT_ALLOCATION' },
              { label: 'Nghiệm thu dự án (Kỹ thuật)', value: 'PROJECT_ACCEPTANCE' },
              { label: 'Bài viết SEO', value: 'SEO_ARTICLE' },
            ]}
          />
        </Space>
      </Card>

      <Card title="Nhật ký sự kiện KPI">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={events}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: 10,
            total: totalEvents,
            onChange: (p) => setPage(p),
          }}
          onRow={createRowActionHandler((record) => setSelectedEvent(record))}
        />
      </Card>

      <Modal
        title={`Chi tiết sự kiện KPI #${selectedEvent?.id || ''}`}
        open={!!selectedEvent}
        onCancel={() => setSelectedEvent(null)}
        footer={[
          selectedEvent?.employee_id && (
            <Button
              key="employee"
              icon={<UserOutlined />}
              onClick={() => navigate(`/employees/${selectedEvent.employee_id}`)}
            >
              Hồ sơ nhân sự
            </Button>
          ),
          selectedEvent?.source_type === 'PROJECT_ACCEPTANCE' && selectedEvent.source_id && (
            <Button
              key="project"
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => navigate(`/projects/${selectedEvent.source_id}`)}
            >
              Xem dự án
            </Button>
          ),
          <Button key="close" onClick={() => setSelectedEvent(null)}>
            Đóng
          </Button>,
        ]}
        width={650}
      >
        {selectedEvent && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã sự kiện">{selectedEvent.id}</Descriptions.Item>
            <Descriptions.Item label="Nhân viên">
              <Space>
                <Text strong>{selectedEvent.employee_name}</Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => navigate(`/employees/${selectedEvent.employee_id}`)}
                >
                  Xem hồ sơ
                </Button>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Chính sách KPI">{selectedEvent.policy_name || selectedEvent.policy_id}</Descriptions.Item>
            <Descriptions.Item label="Nguồn phát sinh">
              <Tag color={selectedEvent.source_type === 'PAYMENT_ALLOCATION' ? 'green' : selectedEvent.source_type === 'PROJECT_ACCEPTANCE' ? 'blue' : 'purple'}>
                {getKpiSourceTypeLabel(selectedEvent.source_type)}
              </Tag>
              <Text type="secondary" style={{ marginLeft: 8 }}>(ID nguồn: {selectedEvent.source_id})</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Loại chỉ số">{selectedEvent.metric_type}</Descriptions.Item>
            <Descriptions.Item label="Giá trị ghi nhận">{selectedEvent.metric_value}</Descriptions.Item>
            <Descriptions.Item label="Điểm KPI đạt được">
              <Tag color="gold" style={{ fontSize: 14 }}>{selectedEvent.kpi_points} điểm</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Doanh thu hợp lệ">
              {selectedEvent.eligible_revenue ? formatCurrency(selectedEvent.eligible_revenue) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Kỳ mục tiêu">{selectedEvent.target_kpi_period}</Descriptions.Item>
            <Descriptions.Item label="Ngày ghi nhận">{formatDate(selectedEvent.qualified_at)}</Descriptions.Item>
            <Descriptions.Item label="Thời điểm tạo">{formatDateTime(selectedEvent.created_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default KpiDashboardPage;
