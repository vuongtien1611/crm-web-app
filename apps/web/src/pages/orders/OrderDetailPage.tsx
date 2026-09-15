import React, { useEffect, useState } from 'react';
import {
  Tag,
  Button,
  Space,
  Typography,
  Table,
  Spin,
  App,
  Collapse,
  Divider,
  Modal,
  Descriptions,
  Avatar,
} from 'antd';
import {
  ArrowLeftOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  PlusOutlined,
  FormOutlined,
  ShoppingOutlined,
  DollarCircleOutlined,
  AuditOutlined,
  AppstoreOutlined,
  ClockCircleOutlined,
  ShopOutlined,
  TeamOutlined,
  PhoneOutlined,
  MailOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchOrderByIdApi,
  submitOrderApi,
  approveOrderApi,
  resubmitOrderApi,
  submitOrderItemApi,
  approveOrderItemApi,
  rejectOrderItemApi,
  cancelOrderItemApi,
  approveChangeRequestApi,
  rejectChangeRequestApi,
  implementChangeRequestApi,
  OrderDetail,
  OrderItem,
} from '../../api/orders';
import { OrderReviewModal } from '../../components/orders/OrderReviewModal';
import { OrderAddItemModal } from '../../components/orders/OrderAddItemModal';
import { CreateChangeRequestModal } from '../../components/orders/CreateChangeRequestModal';
import { createRowNavigateHandler, createRowActionHandler } from '../../utils/tableUtils';
import { getStatusLabel, formatCurrency, formatDateTime } from '../../constants/labels';
import {
  DetailPageHeader,
  DetailSummaryCard,
  DetailSummaryGrid,
  DetailInfoCard,
  DetailRelatedList,
  DetailHistorySection,
} from '../../components/common/detail';

const { Title, Text } = Typography;

export const OrderDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  // Chỉ bật loading toàn màn hình ở lần đầu mở trang
  const [loading, setLoading] = useState(true);
  // Quản lý trạng thái đang xử lý theo từng nút bấm cụ thể
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals state
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewAction, setReviewAction] = useState<'REQUEST_MORE_INFO' | 'REJECT' | 'CANCEL'>('REQUEST_MORE_INFO');
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [selectedCr, setSelectedCr] = useState<any | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);
  const [crModalVisible, setCrModalVisible] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Tải chi tiết đơn hàng - không unmount trang khi refresh ngầm
  const loadOrderDetail = async (isInitial = false) => {
    if (!id) return;
    if (isInitial) setLoading(true);
    try {
      const data = await fetchOrderByIdApi(id);
      setOrder(data);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể tải chi tiết đơn hàng');
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    loadOrderDetail(true);
  }, [id]);

  if (loading || !order) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  const getWorkflowStatusTag = (status: string) => {
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

  const getApprovalStatusTag = (status: string) => {
    const label = getStatusLabel(status);
    switch (status) {
      case 'DRAFT':
        return <Tag color="default">{label}</Tag>;
      case 'PENDING_APPROVAL':
        return <Tag color="processing">{label}</Tag>;
      case 'APPROVED':
        return <Tag color="success">{label}</Tag>;
      case 'REJECTED':
        return <Tag color="error">{label}</Tag>;
      case 'CANCELLED':
        return <Tag color="magenta">{label}</Tag>;
      default:
        return <Tag>{label}</Tag>;
    }
  };

  // Các thao tác chuyển trạng thái đơn hàng (order-level)
  const handleSubmitOrder = async () => {
    if (!order || actionLoading) return;
    setActionLoading('submit-order');
    try {
      await submitOrderApi(order.id);
      message.success('Đã gửi duyệt đơn hàng');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể gửi duyệt đơn hàng');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveOrder = async () => {
    if (!order || actionLoading) return;
    setActionLoading('approve-order');
    try {
      await approveOrderApi(order.id);
      message.success('Đã duyệt đơn hàng');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể duyệt đơn hàng');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResubmitOrder = async () => {
    if (!order || actionLoading) return;
    setActionLoading('resubmit-order');
    try {
      await resubmitOrderApi(order.id);
      message.success('Đã gửi lại yêu cầu duyệt đơn hàng');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể gửi lại đơn hàng');
    } finally {
      setActionLoading(null);
    }
  };

  const openReviewModal = (action: 'REQUEST_MORE_INFO' | 'REJECT' | 'CANCEL') => {
    setReviewAction(action);
    setReviewModalVisible(true);
  };

  // Các thao tác duyệt / từ chối theo từng mục dịch vụ
  const handleSubmitItem = async (itemId: string) => {
    if (actionLoading) return;
    setActionLoading(`submit-item-${itemId}`);
    try {
      await submitOrderItemApi(itemId);
      message.success('Đã gửi duyệt mục dịch vụ');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể gửi duyệt mục dịch vụ');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveItem = async (itemId: string) => {
    if (actionLoading) return;
    setActionLoading(`approve-item-${itemId}`);
    try {
      await approveOrderItemApi(itemId);
      message.success('Đã duyệt mục dịch vụ');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể duyệt mục dịch vụ');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectItem = async (itemId: string) => {
    if (actionLoading) return;
    setActionLoading(`reject-item-${itemId}`);
    try {
      await rejectOrderItemApi(itemId);
      message.success('Đã từ chối mục dịch vụ');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể từ chối mục dịch vụ');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelItem = async (itemId: string) => {
    if (actionLoading) return;
    setActionLoading(`cancel-item-${itemId}`);
    try {
      await cancelOrderItemApi(itemId);
      message.success('Đã hủy mục dịch vụ');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể hủy mục dịch vụ');
    } finally {
      setActionLoading(null);
    }
  };

  // Thao tác với yêu cầu thay đổi (CR)
  const handleApproveCR = async (crId: string) => {
    if (actionLoading) return;
    setActionLoading(`approve-cr-${crId}`);
    try {
      await approveChangeRequestApi(crId);
      message.success('Đã duyệt yêu cầu thay đổi');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể duyệt yêu cầu thay đổi');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectCR = async (crId: string) => {
    if (actionLoading) return;
    setActionLoading(`reject-cr-${crId}`);
    try {
      await rejectChangeRequestApi(crId);
      message.success('Đã từ chối yêu cầu thay đổi');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể từ chối yêu cầu thay đổi');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImplementCR = async (crId: string) => {
    if (actionLoading) return;
    setActionLoading(`implement-cr-${crId}`);
    try {
      await implementChangeRequestApi(crId);
      message.success('Áp dụng yêu cầu thay đổi thành công');
      await loadOrderDetail(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể áp dụng yêu cầu thay đổi');
    } finally {
      setActionLoading(null);
    }
  };

  // Metrics calculation
  const totalNetValue = order.items?.reduce((sum, it) => sum + (Number(it.net_service_value) || 0), 0) || 0;
  const approvedItemsCount = (order.items || []).filter(
    (i) => i.approval_status === 'APPROVED'
  ).length;

  const closingSales = Array.from(
    new Map(
      (order.items || [])
        .filter((it) => it.closing_sale_name || it.closing_sale_id)
        .map((it) => [
          it.closing_sale_id,
          { id: it.closing_sale_id, name: it.closing_sale_name, code: it.closing_sale_code },
        ])
    ).values()
  );

  return (
    <div className="vmax-detail-page">
      {/* HEADER SECTION */}
      <DetailPageHeader
        title={order.order_name || order.order_code}
        code={order.order_name ? order.order_code : "ĐƠN HÀNG"}
        icon={<ShoppingOutlined />}
        status={getWorkflowStatusTag(order.workflow_status)}
        onBack={() => navigate('/orders')}
        backLabel="Quay lại danh sách"
        metaTags={
          <Space size={16} wrap>
            <span>Khách hàng: <Text strong>{order.company_name}</Text></span>
            <span>Ngày tạo: <Text strong>{formatDateTime(order.created_at)}</Text></span>
            <span>Cập nhật: <Text strong>{formatDateTime(order.updated_at)}</Text></span>
          </Space>
        }
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')}>
              Quay lại
            </Button>
            {order.workflow_status === 'DRAFT' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={actionLoading === 'submit-order'}
                disabled={!!actionLoading}
                onClick={handleSubmitOrder}
              >
                Gửi duyệt
              </Button>
            )}
            {order.workflow_status === 'PENDING_APPROVAL' && (
              <>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={actionLoading === 'approve-order'}
                  disabled={!!actionLoading}
                  onClick={handleApproveOrder}
                >
                  Duyệt đơn hàng
                </Button>
                <Button
                  icon={<QuestionCircleOutlined />}
                  disabled={!!actionLoading}
                  onClick={() => openReviewModal('REQUEST_MORE_INFO')}
                >
                  Yêu cầu bổ sung
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  disabled={!!actionLoading}
                  onClick={() => openReviewModal('REJECT')}
                >
                  Từ chối
                </Button>
              </>
            )}
            {order.workflow_status === 'NEED_MORE_INFO' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={actionLoading === 'resubmit-order'}
                disabled={!!actionLoading}
                onClick={handleResubmitOrder}
              >
                Gửi lại duyệt
              </Button>
            )}
            {!['COMPLETED', 'REJECTED', 'CANCELLED'].includes(order.workflow_status) && (
              <Button
                danger
                disabled={!!actionLoading}
                onClick={() => openReviewModal('CANCEL')}
              >
                Hủy đơn hàng
              </Button>
            )}
          </Space>
        }
      />

      {/* KPI SUMMARY CARDS */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="TỔNG GIÁ TRỊ ĐƠN HÀNG"
          value={formatCurrency(totalNetValue)}
          valueColor="#0C6B37"
          icon={<DollarCircleOutlined />}
          subtitle={`Bao gồm ${order.items?.length || 0} dịch vụ cấu thành`}
        />
        <DetailSummaryCard
          title="TRẠNG THÁI XÉT DUYỆT"
          value={getStatusLabel(order.workflow_status)}
          valueColor={
            order.workflow_status === 'APPROVED' ? '#0C6B37' :
            order.workflow_status === 'PENDING_APPROVAL' ? '#2563EB' :
            order.workflow_status === 'NEED_MORE_INFO' ? '#D97706' :
            order.workflow_status === 'REJECTED' ? '#DC2626' : undefined
          }
          icon={<AuditOutlined />}
          subtitle={`Cập nhật lúc ${formatDateTime(order.updated_at)}`}
        />
        <DetailSummaryCard
          title="MỤC ĐÃ PHÊ DUYỆT"
          value={`${approvedItemsCount} / ${order.items?.length || 0}`}
          icon={<AppstoreOutlined />}
          subtitle="Các dịch vụ đã sẵn sàng triển khai"
        />
        <DetailSummaryCard
          title="KHÁCH HÀNG DOANH NGHIỆP"
          value={order.company_name}
          icon={<ShoppingOutlined />}
          subtitle={order.tax_code ? `MST: ${order.tax_code}` : 'Chưa có mã số thuế'}
        />
      </DetailSummaryGrid>

      {/* TWO-COLUMN DETAIL LAYOUT */}
      <div className="vmax-detail-layout">
        {/* MAIN COLUMN (LEFT) */}
        <div className="vmax-detail-main">
          {/* SECTION C: ORDER ITEMS */}
          <DetailRelatedList
            title="Danh sách dịch vụ trong đơn hàng"
            count={order.items?.length || 0}
            extra={
              !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(order.workflow_status) && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddItemModalVisible(true)}>
                  Thêm mục dịch vụ
                </Button>
              )
            }
          >
            <Table
              dataSource={order.items}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              onRow={createRowNavigateHandler(navigate, (r: any) => {
                if (r.project_id) return `/projects/${r.project_id}`;
                if (r.closing_sale_id) return `/employees/${r.closing_sale_id}`;
                return null;
              })}
              columns={[
                {
                  title: 'Tên dịch vụ',
                  dataIndex: 'service_name',
                  key: 'service_name',
                  render: (val: string) => <Text strong style={{ color: '#0F172A' }}>{val}</Text>,
                },
                {
                  title: 'Nhân viên chốt sale',
                  dataIndex: 'closing_sale_name',
                  key: 'closing_sale_name',
                  render: (val: string, r: OrderItem) => `${val || '—'} (${r.closing_sale_code || '—'})`,
                },
                {
                  title: 'Đơn giá gốc',
                  dataIndex: 'original_price',
                  key: 'original_price',
                  render: (val: number) => formatCurrency(val),
                },
                {
                  title: 'Giảm giá',
                  dataIndex: 'discount_amount',
                  key: 'discount_amount',
                  render: (val: number) => formatCurrency(val),
                },
                {
                  title: 'Giá trị thực tế',
                  dataIndex: 'net_service_value',
                  key: 'net_service_value',
                  render: (val: number) => <Text strong style={{ color: '#0C6B37' }}>{formatCurrency(val)}</Text>,
                },
                {
                  title: 'Trạng thái duyệt',
                  dataIndex: 'approval_status',
                  key: 'approval_status',
                  render: (s: string) => getApprovalStatusTag(s),
                },
                {
                  title: 'Triển khai',
                  dataIndex: 'delivery_status',
                  key: 'delivery_status',
                  render: (s: string) => <Tag color="blue">{getStatusLabel(s)}</Tag>,
                },
                {
                  title: 'Thanh toán',
                  dataIndex: 'payment_status',
                  key: 'payment_status',
                  render: (s: string) => <Tag color="purple">{getStatusLabel(s)}</Tag>,
                },
                {
                  title: 'Thao tác',
                  key: 'actions',
                  render: (_: any, r: OrderItem) => (
                    <Space onClick={(e) => e.stopPropagation()}>
                      {r.approval_status === 'DRAFT' && (
                        <Button
                          size="small"
                          type="primary"
                          loading={actionLoading === `submit-item-${r.id}`}
                          disabled={!!actionLoading}
                          onClick={() => handleSubmitItem(r.id)}
                        >
                          Gửi duyệt
                        </Button>
                      )}
                      {r.approval_status === 'PENDING_APPROVAL' && (
                        <>
                          <Button
                            size="small"
                            type="primary"
                            loading={actionLoading === `approve-item-${r.id}`}
                            disabled={!!actionLoading}
                            onClick={() => handleApproveItem(r.id)}
                          >
                            Duyệt
                          </Button>
                          <Button
                            size="small"
                            danger
                            loading={actionLoading === `reject-item-${r.id}`}
                            disabled={!!actionLoading}
                            onClick={() => handleRejectItem(r.id)}
                          >
                            Từ chối
                          </Button>
                        </>
                      )}
                      {r.approval_status === 'APPROVED' && (
                        <Button
                          size="small"
                          icon={<FormOutlined />}
                          disabled={!!actionLoading}
                          onClick={() => {
                            setSelectedItemId(r.id);
                            setCrModalVisible(true);
                          }}
                        >
                          Đổi yêu cầu (CR)
                        </Button>
                      )}
                      {r.approval_status !== 'CANCELLED' && (
                        <Button
                          size="small"
                          danger
                          ghost
                          loading={actionLoading === `cancel-item-${r.id}`}
                          disabled={!!actionLoading}
                          onClick={() => handleCancelItem(r.id)}
                        >
                          Hủy
                        </Button>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </DetailRelatedList>

          {/* SECTION D: REQUIREMENTS & CHANGE REQUEST DETAILS */}
          <div className="vmax-card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0, color: '#0F172A', fontWeight: 600 }}>
                Bản chụp yêu cầu & Yêu cầu thay đổi (Change Requests)
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Chi tiết thông số kỹ thuật và các đề xuất điều chỉnh theo từng dịch vụ
              </Text>
            </div>
            <Collapse
              items={order.items.map((item) => ({
                key: item.id,
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span>
                      <strong>{item.service_name}</strong> (v{item.requirement_template_version})
                    </span>
                    <Space>
                      {getApprovalStatusTag(item.approval_status)}
                    </Space>
                  </div>
                ),
                children: (
                  <div>
                    <Title level={5} style={{ fontSize: 14, marginBottom: 12, color: '#334155' }}>
                      Giá trị yêu cầu đã lưu
                    </Title>
                    {item.requirements && item.requirements.length > 0 ? (
                      <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
                        {item.requirements.map((req) => (
                          <Descriptions.Item key={req.id} label={req.label_snapshot}>
                            {req.value_text || (req.value_json ? (typeof req.value_json === 'object' ? JSON.stringify(req.value_json) : String(req.value_json)) : null) || <Text type="secondary">Chưa cung cấp</Text>}
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                    ) : (
                      <Text type="secondary">Không có trường yêu cầu nào được chụp.</Text>
                    )}

                    <Divider style={{ margin: '16px 0' }} />

                    <Title level={5} style={{ fontSize: 14, marginBottom: 12, color: '#334155' }}>
                      Danh sách yêu cầu thay đổi (Change Requests)
                    </Title>
                    {item.changeRequests && item.changeRequests.length > 0 ? (
                      <Table
                        dataSource={item.changeRequests}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        onRow={createRowActionHandler((cr: any) => setSelectedCr(cr))}
                        columns={[
                          { title: 'Loại', dataIndex: 'change_type', key: 'change_type' },
                          { title: 'Mô tả', dataIndex: 'description', key: 'description' },
                          {
                            title: 'Chênh lệch tiền',
                            dataIndex: 'amount_delta',
                            key: 'amount_delta',
                            render: (val: number) => `${val > 0 ? '+' : ''}${formatCurrency(val)}`,
                          },
                          { title: 'Chênh lệch ngày', dataIndex: 'days_delta', key: 'days_delta' },
                          { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'IMPLEMENTED' ? 'green' : 'gold'}>{getStatusLabel(s)}</Tag> },
                          {
                            title: 'Thao tác',
                            key: 'actions',
                            render: (_: any, cr: any) => (
                              <Space onClick={(e) => e.stopPropagation()}>
                                {cr.status === 'PENDING_APPROVAL' && (
                                  <>
                                    <Button
                                      size="small"
                                      type="primary"
                                      loading={actionLoading === `approve-cr-${cr.id}`}
                                      disabled={!!actionLoading}
                                      onClick={() => handleApproveCR(cr.id)}
                                    >
                                      Duyệt
                                    </Button>
                                    <Button
                                      size="small"
                                      danger
                                      loading={actionLoading === `reject-cr-${cr.id}`}
                                      disabled={!!actionLoading}
                                      onClick={() => handleRejectCR(cr.id)}
                                    >
                                      Từ chối
                                    </Button>
                                  </>
                                )}
                                {cr.status === 'APPROVED' && (
                                  <Button
                                    size="small"
                                    type="primary"
                                    loading={actionLoading === `implement-cr-${cr.id}`}
                                    disabled={!!actionLoading}
                                    onClick={() => handleImplementCR(cr.id)}
                                  >
                                    Áp dụng
                                  </Button>
                                )}
                              </Space>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <Text type="secondary">Chưa có yêu cầu thay đổi nào.</Text>
                    )}
                  </div>
                ),
              }))}
            />
          </div>

          {/* SECTION E: AUDIT LOGS */}
          <DetailHistorySection
            title="Lịch sử kiểm toán & Xét duyệt đơn hàng"
            extra={<Tag>{order.auditLogs?.length || 0}</Tag>}
          >
            <Table
              dataSource={order.auditLogs || []}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              scroll={{ x: 'max-content' }}
              onRow={createRowActionHandler((log: any) => setSelectedAuditLog(log))}
              columns={[
                { title: 'Hành động', dataIndex: 'action', key: 'action', render: (act: string) => <Tag color="blue">{act}</Tag> },
                { title: 'Người thực hiện', dataIndex: 'actor_name', key: 'actor_name', render: (val?: string) => val || 'HỆ THỐNG' },
                { title: 'Thời gian', dataIndex: 'created_at', key: 'created_at', render: (d: string) => formatDateTime(d) },
                {
                  title: 'Dữ liệu trước',
                  dataIndex: 'payload_before_sanitized',
                  key: 'payload_before_sanitized',
                  render: (val?: any) => {
                    if (!val) return '—';
                    const text = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    return <Text ellipsis style={{ maxWidth: 200 }}>{text}</Text>;
                  },
                },
                {
                  title: 'Dữ liệu sau',
                  dataIndex: 'payload_after_sanitized',
                  key: 'payload_after_sanitized',
                  render: (val?: any) => {
                    if (!val) return '—';
                    const text = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    return <Text ellipsis style={{ maxWidth: 200 }}>{text}</Text>;
                  },
                },
              ]}
            />
          </DetailHistorySection>
        </div>

        {/* SIDEBAR COLUMN (RIGHT) */}
        <div className="vmax-detail-side">
          {/* 1. Thông tin đối tác & Hợp đồng */}
          <DetailInfoCard
            title="Thông tin đối tác & Hợp đồng"
            icon={<ShopOutlined />}
            columns={1}
            items={[
              { label: 'Doanh nghiệp / Khách', value: <Text strong>{order.company_name}</Text> },
              { label: 'Mã số thuế', value: order.tax_code || '—' },
              { label: 'Người liên hệ', value: order.primary_contact_name || '—' },
              {
                label: 'Số điện thoại',
                value: (order.primary_contact_phone || order.account_phone) ? (
                  <a href={`tel:${order.primary_contact_phone || order.account_phone}`} style={{ color: '#0C6B37', fontWeight: 600 }}>
                    <PhoneOutlined style={{ marginRight: 6 }} />
                    {order.primary_contact_phone || order.account_phone}
                  </a>
                ) : '—'
              },
              {
                label: 'Email liên hệ',
                value: (order.primary_contact_email || order.account_email) ? (
                  <a href={`mailto:${order.primary_contact_email || order.account_email}`} style={{ color: '#1677ff', fontWeight: 500 }}>
                    <MailOutlined style={{ marginRight: 6 }} />
                    {order.primary_contact_email || order.account_email}
                  </a>
                ) : '—'
              },
              {
                label: 'Mã hợp đồng / đơn',
                value: <Text strong style={{ color: '#0C6B37', fontFamily: 'monospace' }}>{order.order_code}</Text>
              },
              {
                label: 'Trạng thái quy trình',
                value: getWorkflowStatusTag(order.workflow_status)
              },
            ]}
          />

          {/* 2. Nhân sự thực hiện */}
          <DetailInfoCard
            title="Nhân sự thực hiện"
            icon={<TeamOutlined />}
            columns={1}
            items={[
              {
                label: 'Nhân viên chốt sale (Closer)',
                value: closingSales.length > 0 ? (
                  <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 2 }}>
                    {closingSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="vmax-personnel-chip"
                        onClick={() => sale.id && navigate(`/employees/${sale.id}`)}
                      >
                        <Avatar size={22} style={{ backgroundColor: '#0C6B37', fontSize: 11, fontWeight: 700 }}>
                          {sale.name ? sale.name.charAt(0).toUpperCase() : 'S'}
                        </Avatar>
                        <span className="chip-name">{sale.name}</span>
                        {sale.code && <span className="chip-code">{sale.code}</span>}
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary" italic>Chưa ghi nhận</Text>
                )
              },
              {
                label: 'Quy mô dịch vụ',
                value: <Tag color="blue">{order.items?.length || 0} dịch vụ trong đơn</Tag>
              },
            ]}
          />

          {/* 3. Mốc thời gian */}
          <DetailInfoCard
            title="Mốc thời gian"
            icon={<ClockCircleOutlined />}
            columns={1}
            items={[
              {
                label: 'Thời điểm tạo đơn',
                value: <Text>{formatDateTime(order.created_at)}</Text>
              },
              {
                label: 'Cập nhật lần cuối',
                value: <Text>{formatDateTime(order.updated_at)}</Text>
              },
              {
                label: 'Xét duyệt gần nhất',
                value: order.auditLogs && order.auditLogs.length > 0
                  ? <Text type="secondary">{formatDateTime(order.auditLogs[0].created_at)} ({order.auditLogs[0].action})</Text>
                  : <Text type="secondary">—</Text>
              },
            ]}
          />
        </div>
      </div>

      {/* MODALS */}
      <OrderReviewModal
        visible={reviewModalVisible}
        orderId={order.id}
        actionType={reviewAction}
        onClose={() => setReviewModalVisible(false)}
        onSuccess={() => {
          setReviewModalVisible(false);
          loadOrderDetail(false);
        }}
      />

      <OrderAddItemModal
        visible={addItemModalVisible}
        orderId={order.id}
        onClose={() => setAddItemModalVisible(false)}
        onSuccess={() => {
          setAddItemModalVisible(false);
          loadOrderDetail(false);
        }}
      />

      {selectedItemId && (
        <CreateChangeRequestModal
          visible={crModalVisible}
          orderItemId={selectedItemId}
          onClose={() => {
            setCrModalVisible(false);
            setSelectedItemId(null);
          }}
          onSuccess={() => {
            setCrModalVisible(false);
            setSelectedItemId(null);
            loadOrderDetail(false);
          }}
        />
      )}

      {/* CR Detail Modal */}
      <Modal
        title={`Chi tiết Yêu cầu Thay đổi (CR) #${selectedCr?.id || ''}`}
        open={!!selectedCr}
        onCancel={() => setSelectedCr(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedCr(null)}>
            Đóng
          </Button>,
        ]}
        width={600}
      >
        {selectedCr && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã CR">{selectedCr.id}</Descriptions.Item>
            <Descriptions.Item label="Loại yêu cầu">{selectedCr.change_type}</Descriptions.Item>
            <Descriptions.Item label="Mô tả chi tiết">{selectedCr.description}</Descriptions.Item>
            <Descriptions.Item label="Chênh lệch số tiền">
              <Text strong style={{ color: selectedCr.amount_delta > 0 ? '#0C6B37' : undefined }}>
                {selectedCr.amount_delta > 0 ? '+' : ''}{formatCurrency(selectedCr.amount_delta || 0)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Chênh lệch thời gian">
              {selectedCr.days_delta ? `${selectedCr.days_delta > 0 ? '+' : ''}${selectedCr.days_delta} ngày` : '0 ngày'}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={selectedCr.status === 'IMPLEMENTED' ? 'green' : 'gold'}>{getStatusLabel(selectedCr.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Thời điểm tạo">{formatDateTime(selectedCr.created_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Audit Log Detail Modal */}
      <Modal
        title="Chi tiết Nhật ký Kiểm toán"
        open={!!selectedAuditLog}
        onCancel={() => setSelectedAuditLog(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedAuditLog(null)}>
            Đóng
          </Button>,
        ]}
        width={700}
      >
        {selectedAuditLog && (
          <div style={{ marginTop: 16 }}>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Mã log">{selectedAuditLog.id}</Descriptions.Item>
              <Descriptions.Item label="Hành động">
                <Tag color="blue">{selectedAuditLog.action}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Người thực hiện">{selectedAuditLog.actor_name || 'HỆ THỐNG'}</Descriptions.Item>
              <Descriptions.Item label="Thời gian">{formatDateTime(selectedAuditLog.created_at)}</Descriptions.Item>
            </Descriptions>

            <Title level={5}>Dữ liệu trước (Before):</Title>
            <pre style={{ background: '#f8fafc', padding: 12, borderRadius: 6, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>
              {typeof selectedAuditLog.payload_before_sanitized === 'object'
                ? JSON.stringify(selectedAuditLog.payload_before_sanitized, null, 2)
                : selectedAuditLog.payload_before_sanitized || '—'}
            </pre>

            <Title level={5} style={{ marginTop: 16 }}>Dữ liệu sau (After):</Title>
            <pre style={{ background: '#f8fafc', padding: 12, borderRadius: 6, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>
              {typeof selectedAuditLog.payload_after_sanitized === 'object'
                ? JSON.stringify(selectedAuditLog.payload_after_sanitized, null, 2)
                : selectedAuditLog.payload_after_sanitized || '—'}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
};

