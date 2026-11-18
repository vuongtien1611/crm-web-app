import React, { useState } from 'react';
import {
  Alert,
  App,
  Card,
  Checkbox,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Table,
  Tag,
  Input,
  Select,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createSubscriptionApi,
  getEligibleSubscriptionOrderItemsApi,
  getSubscriptionsApi,
  SubscriptionListItem,
  QuerySubscriptionsParams,
} from '../../api/subscriptions';
import { useAuthStore } from '../../store/authStore';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

interface CreateSubscriptionFormValues {
  orderItemId: string;
  billingInterval: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
  intervalCount: number;
  startDate: Dayjs;
  endDate?: Dayjs | null;
  autoRenew: boolean;
}

export const SubscriptionsListPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [interval, setInterval] = useState<string | undefined>(undefined);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  const canCreateSubscription = Boolean(
    user?.roles.some((role) => ['ACCOUNTANT', 'ADMIN', 'BOSS'].includes(role)),
  );

  const queryParams: QuerySubscriptionsParams = {
    page,
    limit,
    search: search || undefined,
    status: status || undefined,
    billing_interval: interval || undefined,
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subscriptions', page, limit, search, status, interval],
    queryFn: () => getSubscriptionsApi(queryParams),
  });

  const {
    data: eligibleOrderItems = [],
    isLoading: isLoadingEligibleOrderItems,
    isError: isEligibleOrderItemsError,
    error: eligibleOrderItemsError,
  } = useQuery({
    queryKey: ['eligible-subscription-order-items'],
    queryFn: getEligibleSubscriptionOrderItemsApi,
    enabled: createModalOpen,
  });

  const handleCreateSubscription = async (values: CreateSubscriptionFormValues) => {
    if (values.endDate && values.endDate.isBefore(values.startDate, 'day')) {
      message.error('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu');
      return;
    }

    setCreateLoading(true);
    try {
      await createSubscriptionApi({
        orderItemId: values.orderItemId,
        billingInterval: values.billingInterval,
        intervalCount: values.intervalCount,
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate?.format('YYYY-MM-DD'),
        autoRenew: values.autoRenew,
      });
      message.success('Đã tạo hợp đồng định kỳ');
      setCreateModalOpen(false);
      createForm.resetFields();
      await refetch();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể tạo hợp đồng định kỳ');
    } finally {
      setCreateLoading(false);
    }
  };

  const getStatusTag = (st: string) => {
    switch (st) {
      case 'ACTIVE':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Đang hoạt động</Tag>;
      case 'PAUSED':
        return <Tag color="warning" icon={<ClockCircleOutlined />}>Tạm dừng</Tag>;
      case 'EXPIRED':
        return <Tag color="error" icon={<CloseCircleOutlined />}>Hết hạn</Tag>;
      case 'CANCELLED':
        return <Tag color="default">Đã hủy</Tag>;
      default:
        return <Tag>{st}</Tag>;
    }
  };

  const getPaymentTag = (pst: string) => {
    switch (pst) {
      case 'FULLY_PAID':
        return <Tag color="success">Đã thanh toán đủ</Tag>;
      case 'PARTIALLY_PAID':
        return <Tag color="processing">Thanh toán 1 phần</Tag>;
      case 'PENDING':
      default:
        return <Tag color="warning">Chờ thanh toán</Tag>;
    }
  };

  const getAcceptanceTag = (ast: string) => {
    switch (ast) {
      case 'ACCEPTED':
        return <Tag color="success">Đã nghiệm thu</Tag>;
      case 'REVIEW':
        return <Tag color="purple">Chờ duyệt</Tag>;
      case 'IN_PROGRESS':
        return <Tag color="processing">Đang thực hiện</Tag>;
      case 'PENDING':
      default:
        return <Tag color="default">Chưa thực hiện</Tag>;
    }
  };

  const getIntervalLabel = (iv: string, count: number) => {
    switch (iv) {
      case 'MONTH':
        return `${count} Tháng / lần`;
      case 'QUARTER':
        return `${count * 3} Tháng (Quý)`;
      case 'YEAR':
        return `${count} Năm / lần`;
      case 'CUSTOM':
      default:
        return `Tùy biến (${count})`;
    }
  };

  const formatVND = (val?: number) => {
    if (val === undefined || val === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const summary = data?.summary || {
    totalActive: 0,
    totalPaused: 0,
    totalExpired: 0,
    totalCancelled: 0,
    totalCount: 0,
  };

  const columns = [
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_: any, record: SubscriptionListItem) => (
        <div>
          <Text strong>{record.customer.name}</Text>
          {record.customer.contactName && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              LH: {record.customer.contactName}
              {record.customer.phone && ` (${record.customer.phone})`}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Dịch vụ',
      key: 'service',
      render: (_: any, record: SubscriptionListItem) => (
        <div>
          <Text strong>{record.service.name}</Text>
          <div style={{ fontSize: 12 }}>
            <Tag color="cyan">{record.service.code}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Đơn hàng & Giá trị',
      key: 'order',
      render: (_: any, record: SubscriptionListItem) => (
        <div>
          <Text strong style={{ color: '#1890ff' }}>{record.orderCode}</Text>
          <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 600 }}>
            {formatVND(record.netServiceValue)}
          </div>
        </div>
      ),
    },
    {
      title: 'Chu kỳ',
      key: 'interval',
      render: (_: any, record: SubscriptionListItem) => (
        <Tag color="blue">{getIntervalLabel(record.billingInterval, record.intervalCount)}</Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: string) => getStatusTag(st),
    },
    {
      title: 'Kỳ hiện tại',
      key: 'currentPeriod',
      render: (_: any, record: SubscriptionListItem) => {
        if (!record.currentPeriod) {
          return <Text type="secondary">Chưa tạo kỳ</Text>;
        }
        return (
          <div>
            <Space size={4}>
              <Tag color="geekblue">Kỳ #{record.currentPeriod.periodIndex}</Tag>
              {getAcceptanceTag(record.currentPeriod.executionStatus)}
            </Space>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {record.currentPeriod.startDate} → {record.currentPeriod.endDate}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Kỳ tiếp theo',
      key: 'nextPeriod',
      render: (_: any, record: SubscriptionListItem) => {
        if (!record.nextPeriod) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <div>
            <Tag>Kỳ #{record.nextPeriod.periodIndex}</Tag>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {record.nextPeriod.startDate}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Thanh toán kỳ',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (pst: string) => getPaymentTag(pst),
    },
    {
      title: 'Thời hạn',
      key: 'duration',
      render: (_: any, record: SubscriptionListItem) => (
        <div style={{ fontSize: 12 }}>
          <div>Bắt đầu: {record.startDate}</div>
          <div>Kết thúc: {record.endDate || 'Vô thời hạn'}</div>
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: SubscriptionListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/subscriptions/${record.id}`)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper vmax-fade-in">
      {/* HEADER */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Quản lý dịch vụ định kỳ (Subscriptions)
            </Title>
            <Text type="secondary">
              Theo dõi chu kỳ định kỳ, kỳ thực hiện, thanh toán và nghiệm thu dịch vụ
            </Text>
          </div>
          {canCreateSubscription && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.setFieldsValue({
                  billingInterval: 'MONTH',
                  intervalCount: 1,
                  startDate: dayjs(),
                  autoRenew: true,
                });
                setCreateModalOpen(true);
              }}
            >
              Tạo hợp đồng
            </Button>
          )}
        </div>
      </div>

      <Modal
        title="Tạo hợp đồng định kỳ"
        open={createModalOpen}
        okText="Tạo hợp đồng"
        cancelText="Hủy"
        confirmLoading={createLoading}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Hợp đồng được tạo từ một mục dịch vụ định kỳ đã duyệt trong đơn hàng."
          description="Để tạo hợp đồng test riêng, chỉ chọn mục thuộc đơn hàng test của bạn; không chọn dịch vụ từ đơn hàng cũ hoặc đơn thật. Nếu chưa có mục phù hợp, hãy tạo đơn test có dịch vụ loại Định kỳ và duyệt mục đó trước."
        />
        {isEligibleOrderItemsError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              eligibleOrderItemsError instanceof Error
                ? eligibleOrderItemsError.message
                : 'Không thể tải các mục dịch vụ đủ điều kiện'
            }
          />
        )}
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            billingInterval: 'MONTH',
            intervalCount: 1,
            startDate: dayjs(),
            autoRenew: true,
          }}
          onFinish={handleCreateSubscription}
        >
          <Form.Item
            name="orderItemId"
            label="Mục dịch vụ trong đơn hàng"
            rules={[{ required: true, message: 'Chọn mục dịch vụ định kỳ đã duyệt' }]}
          >
            <Select
              showSearch
              loading={isLoadingEligibleOrderItems}
              placeholder="Chọn đơn hàng test và dịch vụ định kỳ"
              optionFilterProp="label"
              options={eligibleOrderItems.map((item) => ({
                value: item.orderItemId,
                label: `${item.orderCode} · ${item.customerName} · ${item.serviceName} (${item.serviceCode})`,
              }))}
              notFoundContent={isLoadingEligibleOrderItems ? 'Đang tải...' : 'Không có mục dịch vụ đủ điều kiện'}
            />
          </Form.Item>
          <Form.Item
            name="billingInterval"
            label="Chu kỳ thanh toán"
            rules={[{ required: true, message: 'Chọn chu kỳ thanh toán' }]}
          >
            <Select
              options={[
                { value: 'MONTH', label: 'Hằng tháng' },
                { value: 'QUARTER', label: 'Hằng quý' },
                { value: 'YEAR', label: 'Hằng năm' },
                { value: 'CUSTOM', label: 'Tùy biến' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="intervalCount"
            label="Số chu kỳ mỗi lần"
            rules={[{ required: true, message: 'Nhập số chu kỳ' }]}
          >
            <InputNumber min={1} max={99} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="startDate"
            label="Ngày bắt đầu"
            rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="endDate" label="Ngày kết thúc (không bắt buộc)">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="autoRenew" valuePropName="checked">
            <Checkbox>Tự động gia hạn</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* STATS SUMMARY */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" className="vmax-card">
            <Statistic
              title="Tổng hợp đồng định kỳ"
              value={summary.totalCount}
              prefix={<SyncOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" className="vmax-card">
            <Statistic
              title="Đang hoạt động"
              value={summary.totalActive}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" className="vmax-card">
            <Statistic
              title="Tạm dừng"
              value={summary.totalPaused}
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" className="vmax-card">
            <Statistic
              title="Hết hạn / Đã hủy"
              value={summary.totalExpired + summary.totalCancelled}
              valueStyle={{ color: '#8c8c8c' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* FILTERS & LIST */}
      <Card variant="borderless" className="vmax-card">
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="Tìm khách hàng, dịch vụ, mã đơn..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ width: 280 }}
            allowClear
          />
          <Select
            placeholder="Trạng thái hợp đồng"
            value={status}
            onChange={(val) => {
              setStatus(val);
              setPage(1);
            }}
            style={{ width: 180 }}
            allowClear
            options={[
              { value: 'ACTIVE', label: 'Đang hoạt động' },
              { value: 'PAUSED', label: 'Tạm dừng' },
              { value: 'EXPIRED', label: 'Hết hạn' },
              { value: 'CANCELLED', label: 'Đã hủy' },
            ]}
          />
          <Select
            placeholder="Chu kỳ thanh toán"
            value={interval}
            onChange={(val) => {
              setInterval(val);
              setPage(1);
            }}
            style={{ width: 160 }}
            allowClear
            options={[
              { value: 'MONTH', label: 'Hằng tháng' },
              { value: 'QUARTER', label: 'Hằng quý' },
              { value: 'YEAR', label: 'Hằng năm' },
              { value: 'CUSTOM', label: 'Tùy biến' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>
            Làm mới
          </Button>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.data || []}
          loading={isLoading}
          scroll={{ x: 'max-content' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/subscriptions/${record.id}`)}
          pagination={{
            current: page,
            pageSize: limit,
            total: data?.total || 0,
            showTotal: (total) => `Tổng số ${total} dịch vụ định kỳ`,
            onChange: (p, l) => {
              setPage(p);
              setLimit(l);
            },
            showSizeChanger: true,
          }}
          locale={{ emptyText: 'Chưa có hợp đồng định kỳ nào' }}
        />
      </Card>
    </div>
  );
};
