import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  message,
  Button,
  Tag,
  Row,
  Col,
  Alert,
  Table,
  Space,
  Spin,
} from 'antd';
import {
  BankOutlined,
  FileTextOutlined,
  LinkOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  DollarOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  LoadingOutlined,
  ShoppingOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { getDealDetailApi, startNegotiationApi, DealDetail } from '../../api/deals';
import { DealAssignModal } from '../../components/deals/DealAssignModal';
import { DealClosingSaleModal } from '../../components/deals/DealClosingSaleModal';
import { DealLostModal } from '../../components/deals/DealLostModal';
import { DealWonConfirmModal } from '../../components/deals/DealWonConfirmModal';
import { ActivityTimeline } from '../../components/leads/ActivityTimeline';
import { formatCurrency, getStatusLabel } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';
import {
  DetailPageHeader,
  DetailSummaryGrid,
  DetailSummaryItem,
  DetailSummaryCard,
  DetailInfoCard,
  DetailRelatedList,
  DetailActivityBox,
} from '../../components/common/detail';

export const DealDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  // Chỉ loading toàn màn hình khi mới truy cập trang
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Loading cho các thao tác nút bấm
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isClosingSaleOpen, setIsClosingSaleOpen] = useState(false);
  const [isLostOpen, setIsLostOpen] = useState(false);
  const [isWonOpen, setIsWonOpen] = useState(false);

  // Lấy chi tiết cơ hội bán hàng - không unmount khi refresh ngầm
  const fetchDetail = async (isInitial = false) => {
    if (!id) return;
    if (isInitial) setLoading(true);
    try {
      const data = await getDealDetailApi(id);
      setDeal(data);
    } catch (err: any) {
      if (isInitial) {
        setError(err.message || 'Không thể tải chi tiết cơ hội');
      } else {
        message.error(err.message || 'Không thể đồng bộ dữ liệu mới');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail(true);
  }, [id]);

  // Chuyển deal sang giai đoạn đàm phán mượt mà không reload
  const handleStartNegotiation = async () => {
    if (!id || actionLoading) return;
    setActionLoading('negotiate');
    try {
      await startNegotiationApi(id);
      setDeal((prev) => (prev ? { ...prev, status: 'NEGOTIATING' } : prev));
      message.success('Đã chuyển cơ hội sang trạng thái Đang đàm phán');
      await fetchDetail(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể bắt đầu đàm phán');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="vmax-page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="vmax-page-wrapper" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Alert
          type="error"
          showIcon
          message="Lỗi tải dữ liệu"
          description={error || 'Không tìm thấy cơ hội bán hàng'}
          style={{ maxWidth: 500, margin: '0 auto 24px auto' }}
        />
        <Button type="primary" onClick={() => navigate('/deals')}>
          Quay lại danh sách Cơ hội
        </Button>
      </div>
    );
  }

  // Render Status Badge
  const renderStatusTag = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Tag color="processing" style={{ fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>ĐANG MỞ</Tag>;
      case 'NEGOTIATING':
        return <Tag color="warning" style={{ fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>ĐANG ĐÀM PHÁN</Tag>;
      case 'WON':
        return <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>THẮNG DEAL</Tag>;
      case 'LOST':
        return <Tag color="error" icon={<CloseCircleOutlined />} style={{ fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>THẤT BẠI</Tag>;
      default:
        return <Tag style={{ fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>{getStatusLabel(status)}</Tag>;
    }
  };

  // Columns for related orders
  const orderColumns = [
    {
      title: 'Mã đơn hàng',
      dataIndex: 'order_code',
      key: 'order_code',
      render: (code: string) => <strong style={{ color: 'var(--vmax-green)' }}>{code}</strong>,
    },
    {
      title: 'Tên dịch vụ',
      dataIndex: 'service_name',
      key: 'service_name',
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'order_status',
      key: 'order_status',
      render: (st: string) => <Tag color="orange">{getStatusLabel(st)}</Tag>,
    },
    {
      title: 'Giá trị thực tế',
      dataIndex: 'net_service_value',
      key: 'net_service_value',
      render: (val: number) => <strong style={{ color: 'var(--vmax-green)' }}>{formatCurrency(val)}</strong>,
    },
    {
      title: 'Sale chốt',
      dataIndex: 'closing_sale_name',
      key: 'closing_sale_name',
      render: (name: string) => name || '—',
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      {/* 1. Header tổng quan */}
      <DetailPageHeader
        title={deal.deal_name}
        code={deal.id}
        backUrl="/deals"
        backLabel="Quay lại danh sách Cơ hội"
        icon={<FireOutlined />}
        status={renderStatusTag(deal.status)}
        subtitle={
          <span>
            Khách hàng: <strong>{deal.company_name}</strong> | Phụ trách: <strong>{deal.assigned_sale_name}</strong>
          </span>
        }
        actions={
          <>
            {deal.status === 'OPEN' && (
              <Button
                type="primary"
                icon={actionLoading === 'negotiate' ? <LoadingOutlined /> : <SyncOutlined />}
                disabled={!!actionLoading}
                onClick={handleStartNegotiation}
                style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
              >
                Bắt đầu đàm phán
              </Button>
            )}

            <Button
              icon={<UserOutlined />}
              disabled={!!actionLoading}
              onClick={() => setIsAssignOpen(true)}
            >
              Phân công phụ trách
            </Button>

            <Button
              icon={<TeamOutlined />}
              disabled={!!actionLoading}
              onClick={() => setIsClosingSaleOpen(true)}
            >
              Thiết lập Sale chốt
            </Button>

            {deal.status !== 'WON' && deal.status !== 'LOST' && (
              <>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!!actionLoading}
                  onClick={() => setIsWonOpen(true)}
                  style={{ background: '#0C6B37', borderColor: '#0C6B37' }}
                >
                  Đánh dấu Thắng Deal
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  disabled={!!actionLoading}
                  onClick={() => setIsLostOpen(true)}
                >
                  Đánh dấu Thất bại
                </Button>
              </>
            )}
          </>
        }
      />

      {/* 2. Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Giá trị kỳ vọng"
            value={formatCurrency(deal.expected_value)}
            valueColor="var(--vmax-green)"
            icon={<DollarOutlined />}
            subtitle="Dự toán hợp đồng"
          />
        </DetailSummaryItem>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Doanh nghiệp / Khách hàng"
            value={deal.company_name}
            icon={<BankOutlined />}
            subtitle={deal.tax_code ? `MST: ${deal.tax_code}` : 'Chưa có MST'}
          />
        </DetailSummaryItem>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Nhân viên phụ trách"
            value={deal.assigned_sale_name || 'Chưa phân công'}
            icon={<UserOutlined />}
            subtitle="Chăm sóc & tư vấn"
          />
        </DetailSummaryItem>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Sale chốt hợp đồng"
            value={deal.closing_sale_name || 'Chưa thiết lập'}
            icon={<TeamOutlined />}
            subtitle="Ghi nhận doanh số chốt"
          />
        </DetailSummaryItem>
      </DetailSummaryGrid>

      {/* Cảnh báo thất bại nếu có */}
      {deal.lost_reason && (
        <Alert
          type="error"
          showIcon
          icon={<CloseCircleOutlined />}
          message="Lý do cơ hội bán hàng thất bại:"
          description={deal.lost_reason}
          style={{ marginBottom: 20, borderRadius: 12 }}
        />
      )}

      {/* 3. Main 2-Column Responsive Layout */}
      <Row gutter={[20, 20]}>
        {/* Cột trái: Thông tin khách hàng & Các đơn hàng liên quan */}
        <Col xs={24} lg={13}>
          {/* Thông tin khách hàng & thương mại */}
          <DetailInfoCard
            title="Thông tin Doanh nghiệp & Liên hệ"
            icon={<BankOutlined />}
            items={[
              {
                label: 'Tên công ty / Tổ chức',
                value: deal.company_name,
                icon: <BankOutlined />,
                span: 2,
              },
              {
                label: 'Mã số thuế (MST)',
                value: deal.tax_code || 'Chưa cập nhật',
                icon: <FileTextOutlined />,
              },
              {
                label: 'Chuyển đổi từ Lead',
                icon: <LinkOutlined />,
                value: deal.lead_id ? (
                  <Button
                    type="link"
                    style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                    onClick={() => navigate(`/leads/${deal.lead_id}`)}
                  >
                    {deal.lead_name || `Lead #${deal.lead_id}`} →
                  </Button>
                ) : (
                  deal.lead_name || 'Tạo trực tiếp'
                ),
              },
              {
                label: 'Người liên hệ chính',
                value: deal.primary_contact_name || 'Chưa cập nhật',
                icon: <UserOutlined />,
              },
              {
                label: 'Số điện thoại',
                icon: <PhoneOutlined />,
                value: deal.primary_contact_phone ? (
                  <Space>
                    <span className="font-mono">{deal.primary_contact_phone}</span>
                    <a
                      href={`tel:${deal.primary_contact_phone}`}
                      style={{ color: 'var(--vmax-green)', fontSize: 13 }}
                      title="Gọi điện"
                    >
                      <PhoneOutlined />
                    </a>
                  </Space>
                ) : (
                  'Chưa cập nhật'
                ),
              },
              {
                label: 'Email liên hệ',
                icon: <MailOutlined />,
                span: 2,
                value: deal.primary_contact_email ? (
                  <Space>
                    <a href={`mailto:${deal.primary_contact_email}`}>
                      {deal.primary_contact_email}
                    </a>
                  </Space>
                ) : (
                  'Chưa cập nhật'
                ),
              },
            ]}
          />

          {/* Danh sách đơn hàng liên quan */}
          <DetailRelatedList
            title="Các mục đơn hàng được tạo"
            icon={<ShoppingOutlined />}
            count={deal.orderItems.length}
          >
            {deal.orderItems.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--vmax-text-muted)' }}>
                Chưa có mục đơn hàng nào được tạo (Đánh dấu <strong>THẮNG DEAL</strong> để khởi tạo đơn hàng).
              </div>
            ) : (
              <Table
                columns={orderColumns}
                dataSource={deal.orderItems}
                rowKey="id"
                pagination={false}
                scroll={{ x: 'max-content' }}
                onRow={createRowNavigateHandler(navigate, (record: any) =>
                  record.order_id ? `/orders/${record.order_id}` : `/orders/${record.id}`
                )}
              />
            )}
          </DetailRelatedList>
        </Col>

        {/* Cột phải: Dòng thời gian hoạt động */}
        <Col xs={24} lg={11}>
          <DetailActivityBox title="Nhật ký Hoạt động & Tương tác">
            <ActivityTimeline
              leadId={deal.lead_id || ''}
              activities={deal.activities}
              onRefresh={fetchDetail}
            />
          </DetailActivityBox>
        </Col>
      </Row>

      {/* Modals */}
      <DealAssignModal
        isOpen={isAssignOpen}
        dealId={deal.id}
        currentSaleId={deal.assigned_sale_id}
        onClose={() => setIsAssignOpen(false)}
        onSuccess={() => fetchDetail(false)}
      />

      <DealClosingSaleModal
        isOpen={isClosingSaleOpen}
        dealId={deal.id}
        currentClosingSaleId={deal.closing_sale_id}
        currentClosingSaleName={deal.closing_sale_name}
        onClose={() => setIsClosingSaleOpen(false)}
        onSuccess={() => fetchDetail(false)}
      />

      <DealLostModal
        isOpen={isLostOpen}
        dealId={deal.id}
        onClose={() => setIsLostOpen(false)}
        onSuccess={() => fetchDetail(false)}
      />

      <DealWonConfirmModal
        isOpen={isWonOpen}
        dealId={deal.id}
        dealName={deal.deal_name}
        closingSaleName={deal.closing_sale_name}
        expectedValue={deal.expected_value}
        onClose={() => setIsWonOpen(false)}
        onSuccess={() => fetchDetail(false)}
      />
    </div>
  );
};
