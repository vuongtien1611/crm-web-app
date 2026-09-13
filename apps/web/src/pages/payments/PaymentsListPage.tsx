import React, { useEffect, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Tag,
  Space,
  Typography,
  Select,
  App,
  Popconfirm,
  Statistic,
  Row,
  Col,
  Popover,
  Tooltip,
} from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPaymentsApi, getGrossCashApi, rejectPaymentApi, PaymentItem } from '../../api/payments';
import { CreatePaymentModal } from '../../components/payments/CreatePaymentModal';
import { ConfirmPaymentModal } from '../../components/payments/ConfirmPaymentModal';
import { getStatusLabel, formatCurrency, formatDateTime } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

export const PaymentsListPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [grossCashTotal, setGrossCashTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    () => searchParams.get('status') || undefined
  );

  useEffect(() => {
    const qStatus = searchParams.get('status') || undefined;
    setStatusFilter(qStatus);
    setPage(1);
  }, [searchParams]);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);
  // Trạng thái đang từ chối theo từng hàng
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await getPaymentsApi({ page, limit: 10, status: statusFilter });
      setPayments(res.data);
      setTotal(res.meta.total);

      const grossRes = await getGrossCashApi();
      setGrossCashTotal(grossRes.grossCash);
    } catch (err: any) {
      message.error('Không thể tải danh sách giao dịch thanh toán');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [page, statusFilter]);

  // Từ chối giao dịch thanh toán mượt mà
  const handleReject = async (paymentId: string) => {
    if (actionLoadingId) return;
    setActionLoadingId(paymentId);
    try {
      await rejectPaymentApi(paymentId, { reason: 'Từ chối thao tác trên danh sách' });
      message.success('Đã từ chối giao dịch thanh toán');
      await fetchPayments();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Không thể từ chối thanh toán');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusTag = (status: string) => {
    const label = getStatusLabel(status);
    switch (status) {
      case 'CONFIRMED':
        return <Tag color="success">{label}</Tag>;
      case 'REJECTED':
        return <Tag color="error">{label}</Tag>;
      case 'PENDING_CONFIRMATION':
      default:
        return <Tag color="warning">{label}</Tag>;
    }
  };

  const getMethodTag = (method: string) => {
    switch (method) {
      case 'BANK_TRANSFER':
        return <Tag color="blue">Chuyển khoản</Tag>;
      case 'CASH':
        return <Tag color="green">Tiền mặt</Tag>;
      case 'CREDIT_CARD':
        return <Tag color="purple">Thẻ tín dụng</Tag>;
      case 'E_WALLET':
        return <Tag color="cyan">Ví điện tử</Tag>;
      default:
        return <Tag>{method}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Tên dự án',
      key: 'project_name',
      render: (_: any, record: PaymentItem) => {
        const projects = record.projects || [];
        if (projects.length === 0) {
          return (
            <div>
              <Tag color="default" style={{ marginBottom: 2 }}>
                Chưa phân bổ
              </Tag>
              <div>
                <a
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/payments/${record.id}`);
                  }}
                  style={{ fontSize: 12, color: 'var(--vmax-text-muted, #66736B)' }}
                >
                  Mã: {record.payment_code}
                </a>
              </div>
            </div>
          );
        }

        if (projects.length === 1) {
          return (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--vmax-text, #18211C)' }}>
                {projects[0].name}
              </div>
              <div>
                <a
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/payments/${record.id}`);
                  }}
                  style={{ fontSize: 12, color: 'var(--vmax-text-muted, #66736B)' }}
                >
                  Mã: {record.payment_code}
                </a>
              </div>
            </div>
          );
        }

        const popoverContent = (
          <div style={{ maxWidth: 340 }}>
            <div
              style={{
                fontWeight: 600,
                marginBottom: 8,
                fontSize: 13,
                borderBottom: '1px solid #f0f0f0',
                paddingBottom: 4,
              }}
            >
              Danh sách dự án liên quan ({projects.length}):
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#333' }}>
              {projects.map((p) => (
                <li key={p.id} style={{ marginBottom: 4, fontSize: 12 }}>
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        );

        return (
          <div>
            <Space size={6} align="center" wrap>
              <span style={{ fontWeight: 600, color: 'var(--vmax-text, #18211C)' }}>
                {projects[0].name}
              </span>
              <Popover content={popoverContent} title={null} trigger="hover">
                <Tag color="cyan" style={{ cursor: 'pointer', fontWeight: 600, margin: 0 }}>
                  +{projects.length - 1} dự án
                </Tag>
              </Popover>
            </Space>
            <div>
              <a
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/payments/${record.id}`);
                }}
                style={{ fontSize: 12, color: 'var(--vmax-text-muted, #66736B)' }}
              >
                Mã: {record.payment_code}
              </a>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Số tiền thực thu (Gross Cash)',
      dataIndex: 'gross_cash_amount',
      key: 'gross_cash_amount',
      render: (val: number) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatCurrency(val)}
        </Text>
      ),
    },
    {
      title: 'Phương thức thanh toán',
      dataIndex: 'payment_method',
      key: 'payment_method',
      render: (method: string) => getMethodTag(method),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatDateTime(date),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, record: PaymentItem) => (
        <Space>
          {record.status === 'PENDING_CONFIRMATION' && (
            <>
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  setSelectedPayment(record);
                  setConfirmModalVisible(true);
                }}
              >
                Xác nhận
              </Button>
              <Popconfirm
                title="Từ chối giao dịch thanh toán này?"
                description="Giao dịch sẽ được đánh dấu là Đã từ chối và không thể phân bổ."
                onConfirm={() => handleReject(record.id)}
                okText="Đồng ý từ chối"
                cancelText="Hủy"
                disabled={!!actionLoadingId}
              >
                <Button
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  loading={actionLoadingId === record.id}
                  disabled={!!actionLoadingId}
                >
                  Từ chối
                </Button>
              </Popconfirm>
            </>
          )}
          <Button size="small" onClick={() => navigate(`/payments/${record.id}`)}>
            Chi tiết
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Title level={2} className="vmax-page-title">Quản lý thanh toán & Dòng tiền</Title>
          <Text className="vmax-page-subtitle">Thu tiền thực tế, phân bổ và quyết toán doanh thu</Text>
        </Col>
        <Col xs={24} md={12} style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
          <Card size="small" className="vmax-card" style={{ width: '100%', maxWidth: 320, textAlign: 'left' }}>
            <Statistic
              title="Tổng tiền thực thu đã xác nhận"
              value={grossCashTotal}
              precision={0}
              valueStyle={{ color: 'var(--vmax-green)', fontWeight: 'bold' }}
              prefix={<DollarOutlined style={{ color: 'var(--vmax-green)' }} />}
              suffix="₫"
            />
          </Card>
        </Col>
      </Row>

      <Card className="vmax-card">
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 12 }}>
          <Select
            placeholder="Lọc theo trạng thái"
            allowClear
            style={{ minWidth: 200 }}
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
              const nextParams = new URLSearchParams(searchParams);
              if (val) {
                nextParams.set('status', val);
              } else {
                nextParams.delete('status');
              }
              setSearchParams(nextParams);
            }}
          >
            <Select.Option value="PENDING_CONFIRMATION">Chờ xác nhận</Select.Option>
            <Select.Option value="CONFIRMED">Đã xác nhận</Select.Option>
            <Select.Option value="REJECTED">Đã từ chối</Select.Option>
          </Select>

          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
            Ghi nhận thanh toán mới
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={payments}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Chưa có khoản thanh toán nào' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/payments/${record.id}`)}
          pagination={{
            current: page,
            pageSize: 10,
            total,
            showTotal: (total) => `Tổng số ${total} thanh toán`,
            onChange: (p) => setPage(p),
            showSizeChanger: true,
          }}
        />
      </Card>

      <CreatePaymentModal
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onSuccess={() => {
          setCreateModalVisible(false);
          fetchPayments();
        }}
      />

      <ConfirmPaymentModal
        payment={selectedPayment}
        visible={confirmModalVisible}
        onCancel={() => {
          setConfirmModalVisible(false);
          setSelectedPayment(null);
        }}
        onSuccess={() => {
          setConfirmModalVisible(false);
          setSelectedPayment(null);
          fetchPayments();
        }}
      />
    </div>
  );
};
