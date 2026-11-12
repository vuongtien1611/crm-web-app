import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Input, Select, Button, Space, Typography, Modal, Alert, List, Empty, Spin, App } from 'antd';
import { SearchOutlined, EyeOutlined, FileTextOutlined, PlusOutlined, TrophyOutlined, RocketOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchOrdersApi, OrderListItem } from '../../api/orders';
import { getDealsApi, markWonApi, DealItem } from '../../api/deals';
import { getStatusLabel, formatCurrency, formatDateTime } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text, Paragraph } = Typography;

export const OrdersListPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || '');

  // State cho Modal tạo đơn hàng từ Deal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [openDeals, setOpenDeals] = useState<DealItem[]>([]);
  const [winningDealId, setWinningDealId] = useState<string | null>(null);

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
      message.error(err.response?.data?.message || err.message || 'Không thể tải danh sách đơn hàng');
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

  const openCreateOrderModal = async () => {
    setCreateModalOpen(true);
    setDealsLoading(true);
    try {
      // Tải các Deals ở trạng thái OPEN hoặc NEGOTIATING
      const [resOpen, resNego] = await Promise.all([
        getDealsApi({ status: 'OPEN', limit: 50 }).catch(() => ({ data: [] })),
        getDealsApi({ status: 'NEGOTIATING', limit: 50 }).catch(() => ({ data: [] })),
      ]);
      const combined = [...(resOpen.data || []), ...(resNego.data || [])];
      setOpenDeals(combined);
    } catch (err: any) {
      message.error('Không thể tải danh sách cơ hội bán hàng');
    } finally {
      setDealsLoading(false);
    }
  };

  const handleWinDealAndCreateOrder = async (deal: DealItem) => {
    setWinningDealId(deal.id);
    try {
      const res = await markWonApi(deal.id);
      message.success(`Đã chốt thắng cơ hội "${deal.deal_name}" và tự động tạo đơn hàng thành công!`);
      setCreateModalOpen(false);
      loadOrders();
      if (res?.order?.id) {
        navigate(`/orders/${res.order.id}`);
      }
    } catch (err: any) {
      message.error(err.message || 'Không thể chốt thắng Deal');
    } finally {
      setWinningDealId(null);
    }
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
      render: (company: string, record: OrderListItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{company}</div>
          {record.primary_contact_name && (
            <div style={{ fontSize: 12, color: 'var(--vmax-text-muted, #8c8c8c)' }}>
              Liên hệ: {record.primary_contact_name}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái đơn',
      dataIndex: 'workflow_status',
      key: 'workflow_status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Số dịch vụ',
      dataIndex: 'itemCount',
      key: 'itemCount',
      align: 'center' as const,
      render: (count: number) => <Tag color="geekblue">{count || 0} mục</Tag>,
    },
    {
      title: 'Tổng giá trị (VND)',
      dataIndex: 'totalNetValue',
      key: 'totalNetValue',
      align: 'right' as const,
      render: (val: number) => (
        <span style={{ fontWeight: 600, color: 'var(--vmax-green, #0C6B37)' }}>
          {formatCurrency(val || 0)}
        </span>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (dt: string) => formatDateTime(dt),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'center' as const,
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
      <div className="vmax-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} className="vmax-page-title" style={{ margin: 0 }}>
          <FileTextOutlined style={{ color: 'var(--vmax-green)' }} />
          Danh sách đơn hàng
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateOrderModal}
          style={{ background: '#0C6B37', borderColor: '#0C6B37' }}
        >
          Tạo đơn hàng
        </Button>
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
                { label: 'Chờ phê duyệt', value: 'PENDING_APPROVAL' },
                { label: 'Cần bổ sung thông tin', value: 'NEED_MORE_INFO' },
                { label: 'Đã phê duyệt', value: 'APPROVED' },
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
          locale={{
            emptyText: (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <Empty
                  description={
                    <span>
                      Chưa có đơn hàng nào.
                      <br />
                      Đơn hàng được sinh ra tự động khi chốt thành công Cơ hội bán hàng (Deal).
                    </span>
                  }
                >
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreateOrderModal}
                    style={{ marginTop: 12, background: '#0C6B37', borderColor: '#0C6B37' }}
                  >
                    Tạo đơn hàng ngay
                  </Button>
                </Empty>
              </div>
            ),
          }}
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

      {/* Modal hướng dẫn & chọn Deal để sinh Đơn hàng */}
      <Modal
        title={
          <Space>
            <TrophyOutlined style={{ color: '#0C6B37', fontSize: 20 }} />
            <Text strong style={{ fontSize: 16 }}>Khởi tạo Đơn hàng từ Cơ hội (Deal)</Text>
          </Space>
        }
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateModalOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="to-deals"
            icon={<ArrowRightOutlined />}
            onClick={() => {
              setCreateModalOpen(false);
              navigate('/deals');
            }}
          >
            Quản lý tất cả Deals
          </Button>,
        ]}
        width={680}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Quy trình vận hành chuẩn CRM"
          description="Đơn hàng được gắn liền với Doanh nghiệp & Cơ hội bán hàng (Deal) được chốt thành công. Hãy chọn một Cơ hội đang đàm phán bên dưới để xác nhận Thắng Deal và tự động tạo Đơn hàng nháp (Draft)."
        />

        {dealsLoading ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Spin tip="Đang tải danh sách cơ hội..." />
          </div>
        ) : openDeals.length > 0 ? (
          <List
            itemLayout="horizontal"
            dataSource={openDeals}
            renderItem={(deal) => (
              <List.Item
                actions={[
                  <Button
                    key="win"
                    type="primary"
                    icon={<TrophyOutlined />}
                    loading={winningDealId === deal.id}
                    onClick={() => handleWinDealAndCreateOrder(deal)}
                    style={{ background: '#0C6B37', borderColor: '#0C6B37' }}
                  >
                    Chốt Thắng & Tạo Đơn
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<RocketOutlined style={{ fontSize: 24, color: '#1677ff', marginTop: 4 }} />}
                  title={<Text strong>{deal.deal_name}</Text>}
                  description={
                    <Space direction="vertical" size={2}>
                      <span>Doanh nghiệp: <strong>{deal.company_name}</strong></span>
                      <span>
                        Giá trị kỳ vọng: <strong style={{ color: '#0C6B37' }}>{formatCurrency(deal.expected_value)}</strong> | Trạng thái: <Tag color="blue">{getStatusLabel(deal.status)}</Tag>
                      </span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty
            description={
              <span>
                Hiện tại không có Cơ hội nào đang mở.
                <br />
                Hãy bắt đầu bằng cách phân loại khách hàng tiềm năng thành <strong>Tiềm năng (POTENTIAL)</strong> và chuyển đổi thành Deal.
              </span>
            }
          >
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" onClick={() => { setCreateModalOpen(false); navigate('/leads'); }}>
                Đến danh sách Lead
              </Button>
              <Button onClick={() => { setCreateModalOpen(false); navigate('/deals'); }}>
                Đến danh sách Deals
              </Button>
            </Space>
          </Empty>
        )}
      </Modal>
    </div>
  );
};
