import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Button, Space, Typography, Select, Row, Col, Statistic, message } from 'antd';
import { DollarOutlined, EyeOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { fetchCommissions, CommissionItem } from '../../api/commissions';
import { getStatusLabel, getCommissionTypeLabel, formatCurrency } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

export const CommissionsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<CommissionItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchCommissions({
        page,
        limit: 10,
        status: statusFilter || undefined,
        commissionType: typeFilter || undefined,
      });
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err: any) {
      message.error('Không thể tải danh sách hoa hồng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, statusFilter, typeFilter]);

  const renderStatusTag = (status: string) => {
    const label = getStatusLabel(status);
    switch (status) {
      case 'RELEASED':
        return <Tag color="green">{label}</Tag>;
      case 'CALCULATED':
        return <Tag color="gold">{label}</Tag>;
      case 'APPROVED':
        return <Tag color="blue">{label}</Tag>;
      case 'ADJUSTED':
        return <Tag color="purple">{label}</Tag>;
      case 'REJECTED':
        return <Tag color="red">{label}</Tag>;
      case 'UNEARNED':
      default:
        return <Tag color="default">{label}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Người thụ hưởng',
      dataIndex: 'beneficiary_name',
      key: 'beneficiary_name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Loại hoa hồng',
      dataIndex: 'commission_type',
      key: 'commission_type',
      render: (type: string) => (
        <Tag color={type === 'SALE' ? 'cyan' : type === 'PROJECT_DELIVERY' ? 'geekblue' : 'orange'}>
          {getCommissionTypeLabel(type)}
        </Tag>
      ),
    },
    {
      title: 'Tỷ lệ',
      dataIndex: 'rate_snapshot',
      key: 'rate_snapshot',
      render: (rate: number) => `${(Number(rate) * 100).toFixed(1)}%`,
    },
    {
      title: 'Số tiền cơ sở',
      dataIndex: 'commission_base',
      key: 'commission_base',
      render: (val: number) => formatCurrency(val || 0),
    },
    {
      title: 'Số tiền tính toán',
      dataIndex: 'calculated_amount',
      key: 'calculated_amount',
      render: (val: number) => (
        <Text type="success" strong>
          {formatCurrency(val || 0)}
        </Text>
      ),
    },
    {
      title: 'Số tiền đã duyệt',
      dataIndex: 'approved_amount',
      key: 'approved_amount',
      render: (val: number | null) => (val !== null ? formatCurrency(val) : '-'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => renderStatusTag(status),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: CommissionItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/commissions/${record.id}`)}
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
            <DollarOutlined style={{ color: 'var(--vmax-green)' }} /> Quản lý hoa hồng
          </Title>
          <Text className="vmax-page-subtitle">
            Theo dõi minh bạch và phê duyệt hoa hồng Kinh doanh và Kỹ thuật.
          </Text>
        </Col>
      </Row>

      <Card className="vmax-card" style={{ marginBottom: 24 }}>
        <Space size="middle" wrap>
          <Select
            placeholder="Lọc theo trạng thái"
            style={{ width: 180 }}
            allowClear
            onChange={(val) => setStatusFilter(val || '')}
            options={[
              { label: 'Chưa đủ điều kiện (UNEARNED)', value: 'UNEARNED' },
              { label: 'Đã giải phóng (RELEASED)', value: 'RELEASED' },
              { label: 'Đã tính toán (CALCULATED)', value: 'CALCULATED' },
              { label: 'Đã duyệt (APPROVED)', value: 'APPROVED' },
              { label: 'Đã điều chỉnh (ADJUSTED)', value: 'ADJUSTED' },
              { label: 'Đã từ chối (REJECTED)', value: 'REJECTED' },
            ]}
          />

          <Select
            placeholder="Lọc theo loại hoa hồng"
            style={{ width: 220 }}
            allowClear
            onChange={(val) => setTypeFilter(val || '')}
            options={[
              { label: 'Hoa hồng Sale', value: 'SALE' },
              { label: 'Hoa hồng triển khai dự án', value: 'PROJECT_DELIVERY' },
              { label: 'Hoa hồng quản lý đội nhóm', value: 'TEAM_OVERRIDE' },
            ]}
          />

          <Button icon={<SyncOutlined />} onClick={loadData}>
            Làm mới
          </Button>
        </Space>
      </Card>

      <Card className="vmax-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Chưa có dữ liệu hoa hồng' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/commissions/${record.id}`)}
          pagination={{
            current: page,
            pageSize: 10,
            total,
            showTotal: (total) => `Tổng số ${total} bản ghi hoa hồng`,
            showSizeChanger: true,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>
    </div>
  );
};

export default CommissionsListPage;
