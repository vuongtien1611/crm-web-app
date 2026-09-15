import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Input, Select, Button, Space, Typography, message } from 'antd';
import { SearchOutlined, EyeOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchOrdersApi, OrderListItem } from '../../api/orders';
import { getStatusLabel, formatCurrency, formatDateTime } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title } = Typography;

export const OrdersListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || '');

  useEffect(() => {
    const s = searchParams.get('status') || '';
    setStatusFilter(s);
    setPage(1);
  }, [searchParams]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await fetchOrdersApi({
        page,
        limit: pageSize,
        q: searchQuery,
        workflowStatus: statusFilter || undefined,
      });
      setOrders(res.data);
      setTotal(res.total);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể tải danh sách đơn hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [page, pageSize, statusFilter]);

  const handleSearch = () => {
    setPage(1);
    loadOrders();
  };

  const getStatusTag = (status: string) => {
    const label = getStatusLabel(status);
    switch (status) {
      case 'DRAFT':
        return <Tag color="default">{label}</Tag>;
      case 'PENDING_APPROVAL':
        return <Tag color="processing">{label}</Tag>;
      case 'NEED_MORE_INFO':
        return <Tag color="warning">{label}</Tag>;
      case 'APPROVED':
        return <Tag color="success">{label}</Tag>;
      case 'IN_PROGRESS':
        return <Tag color="blue">{label}</Tag>;
      case 'COMPLETED':
        return <Tag color="purple">{label}</Tag>;
      case 'REJECTED':
        return <Tag color="error">{label}</Tag>;
      case 'CANCELLED':
        return <Tag color="magenta">{label}</Tag>;
      default:
        return <Tag>{label}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Tên đơn hàng',
      dataIndex: 'order_name',
      key: 'order_name',
      render: (_: string, record: OrderListItem) => (
        <Space direction="vertical" size={2} style={{ display: 'flex', alignItems: 'flex-start' }}>
          <Button
            type="link"
            onClick={() => navigate(`/orders/${record.id}`)}
            style={{ padding: 0, height: 'auto', fontWeight: 600, textAlign: 'left', fontSize: 14 }}
          >
            <Space size={6} align="start">
              <FileTextOutlined style={{ color: '#3b82f6', marginTop: 4 }} />
              <span>{record.order_name || record.order_code}</span>
            </Space>
          </Button>
          <span style={{ fontSize: 12, color: 'var(--vmax-text-muted, #8c8c8c)', paddingLeft: 22 }}>
            Mã: {record.order_code}
          </span>
        </Space>
      ),
    },
    {
      title: 'Khách hàng / Doanh nghiệp',
      dataIndex: 'company_name',
      key: 'company_name',
    },
    {
      title: 'Người liên hệ',
      dataIndex: 'primary_contact_name',
      key: 'primary_contact_name',
      render: (val?: string) => val || '—',
    },
    {
      title: 'Trạng thái quy trình',
      dataIndex: 'workflow_status',
      key: 'workflow_status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Số mục',
      dataIndex: 'itemCount',
      key: 'itemCount',
    },
    {
      title: 'Tổng giá trị thực tế (VND)',
      dataIndex: 'totalNetValue',
      key: 'totalNetValue',
      render: (val: number) => formatCurrency(val),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatDateTime(date),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: OrderListItem) => (
        <Button
          type="primary"
          ghost
          icon={<EyeOutlined />}
          size="small"
          onClick={() => navigate(`/orders/${record.id}`)}
        >
          Xem chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <div className="vmax-page-header">
        <Title level={3} className="vmax-page-title">
          <FileTextOutlined style={{ color: 'var(--vmax-green)' }} />
          Danh sách đơn hàng
        </Title>
      </div>
      <Card className="vmax-card">
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Space wrap>
            <Input
              placeholder="Tìm kiếm theo tên đơn, mã đơn hoặc khách hàng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 300 }}
              prefix={<SearchOutlined />}
            />
            <Select
              placeholder="Lọc theo trạng thái"
              allowClear
              value={statusFilter || undefined}
              onChange={(val) => {
                const nextVal = val || '';
                setStatusFilter(nextVal);
                setPage(1);
                const nextParams = new URLSearchParams(searchParams);
                if (nextVal) {
                  nextParams.set('status', nextVal);
                } else {
                  nextParams.delete('status');
                }
                setSearchParams(nextParams);
              }}
              style={{ width: 200 }}
              options={[
                { label: 'Nháp', value: 'DRAFT' },
                { label: 'Chờ duyệt', value: 'PENDING_APPROVAL' },
                { label: 'Cần bổ sung thông tin', value: 'NEED_MORE_INFO' },
                { label: 'Đã duyệt', value: 'APPROVED' },
                { label: 'Đang thực hiện', value: 'IN_PROGRESS' },
                { label: 'Hoàn thành', value: 'COMPLETED' },
                { label: 'Đã từ chối', value: 'REJECTED' },
                { label: 'Đã hủy', value: 'CANCELLED' },
              ]}
            />
            <Button type="primary" onClick={handleSearch}>
              Tìm kiếm
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Chưa có đơn hàng nào' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/orders/${record.id}`)}
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (total) => `Tổng số ${total} đơn hàng`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showSizeChanger: true,
          }}
        />
      </Card>
    </div>
  );
};
