import React, { useState } from 'react';
import {
  Tag,
  Button,
  Space,
  Typography,
  Tabs,
  Table,
  Modal,
  App,
  Popconfirm,
  Progress,
  Alert,
  Descriptions,
} from 'antd';
import {
  ArrowLeftOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  StopOutlined,
  CalendarOutlined,
  ProjectOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import {
  getSubscriptionByIdApi,
  generatePeriodsApi,
  cancelSubscriptionApi,
  PeriodItem,
} from '../../api/subscriptions';
import { createRowNavigateHandler, createRowActionHandler } from '../../utils/tableUtils';
import {
  DetailPageHeader,
  DetailSummaryCard,
  DetailSummaryGrid,
  DetailInfoCard,
  DetailRelatedList,
} from '../../components/common/detail';

const { Title, Text } = Typography;

export const SubscriptionDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canMutate = user?.roles?.some((r: string) => ['ADMIN', 'BOSS'].includes(r));
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodItem | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<any | null>(null);

  const { data: sub, isLoading, refetch } = useQuery({
    queryKey: ['subscription', id],
    queryFn: () => getSubscriptionByIdApi(id!),
    enabled: !!id,
  });

  const generatePeriodMutation = useMutation({
    mutationFn: () => generatePeriodsApi(id!, 1),
    onSuccess: () => {
      message.success('Đã tạo kỳ dịch vụ tiếp theo thành công');
      refetch();
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể tạo kỳ dịch vụ');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscriptionApi(id!),
    onSuccess: () => {
      message.success('Đã hủy hợp đồng Subscription thành công');
      refetch();
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể hủy hợp đồng');
    },
  });

  if (isLoading) {
    return (
      <div className="vmax-detail-page" style={{ padding: 60, textAlign: 'center' }}>
        <Text type="secondary">Đang tải hợp đồng định kỳ...</Text>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="vmax-detail-page" style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Không tìm thấy hợp đồng định kỳ"
          description={`Không thể tải dữ liệu Subscription #${id}`}
        />
        <Button
          style={{ marginTop: 16 }}
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/subscriptions')}
        >
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  const formatVND = (val?: number) => {
    if (val === undefined || val === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
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

  const getExecutionTag = (est: string) => {
    switch (est) {
      case 'ACCEPTED':
        return <Tag color="success">Đã nghiệm thu</Tag>;
      case 'REVIEW':
        return <Tag color="purple">Đang kiểm duyệt</Tag>;
      case 'IN_PROGRESS':
        return <Tag color="processing">Đang thực hiện</Tag>;
      case 'PENDING':
      default:
        return <Tag color="default">Chờ thực hiện</Tag>;
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

  const periodColumns = [
    {
      title: 'Kỳ #',
      dataIndex: 'periodIndex',
      key: 'periodIndex',
      width: 80,
      render: (idx: number) => <Tag color="blue" style={{ fontSize: 13 }}>Kỳ {idx}</Tag>,
    },
    {
      title: 'Khoảng thời gian',
      key: 'dateRange',
      render: (_: any, r: PeriodItem) => (
        <Space size={6}>
          <CalendarOutlined style={{ color: '#1890ff' }} />
          <span>{r.startDate}</span>
          <Text type="secondary">→</Text>
          <span>{r.endDate}</span>
        </Space>
      ),
    },
    {
      title: 'Giá trị kỳ (có VAT)',
      dataIndex: 'grossPayable',
      key: 'grossPayable',
      render: (val?: number) => <Text strong style={{ color: '#0C6B37' }}>{formatVND(val)}</Text>,
    },
    {
      title: 'Tiến độ thực hiện',
      dataIndex: 'executionStatus',
      key: 'executionStatus',
      render: (st: string) => getExecutionTag(st),
    },
    {
      title: 'Thanh toán',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (pst: string) => getPaymentTag(pst),
    },
    {
      title: 'Phân công nhân sự',
      key: 'assignments',
      render: (_: any, r: PeriodItem) => {
        const assigns = r.assignments || [];
        if (assigns.length === 0) return <Text type="secondary">Chưa phân công</Text>;
        return (
          <Space direction="vertical" size={2}>
            {assigns.map((a) => (
              <div key={a.id} style={{ fontSize: 12 }}>
                <Tag color={a.assignmentType === 'PRIMARY' ? 'geekblue' : 'default'}>
                  {a.assignmentType === 'PRIMARY' ? 'Chính' : 'Hỗ trợ'}
                </Tag>
                <Text strong>{a.fullName}</Text>
                {!a.isActive && <Tag color="error" style={{ marginLeft: 4 }}>Đã thay thế</Tag>}
              </div>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Nghiệm thu khách hàng',
      key: 'acceptance',
      render: (_: any, r: PeriodItem) => {
        if (!r.acceptance) {
          return <Text type="secondary">Chưa nghiệm thu</Text>;
        }
        return (
          <div style={{ fontSize: 12 }}>
            <Tag color="success">Đã ký nghiệm thu</Tag>
            <div style={{ marginTop: 2 }}>
              Người ký: <strong>{r.acceptance.acceptedByName}</strong>
            </div>
            <div style={{ color: '#64748b' }}>
              Ngày ký: {new Date(r.acceptance.acceptedAt).toLocaleDateString('vi-VN')}
            </div>
            {r.acceptance.evidenceDocument && (
              <div style={{ color: '#0C6B37', wordBreak: 'break-all' }}>
                HS: {r.acceptance.evidenceDocument}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  const installmentColumns = [
    {
      title: 'Đợt #',
      dataIndex: 'installmentNumber',
      key: 'installmentNumber',
      render: (num: number) => <Tag color="purple">Đợt {num}</Tag>,
    },
    {
      title: 'Hạn thanh toán',
      dataIndex: 'dueDate',
      key: 'dueDate',
    },
    {
      title: 'Số tiền phải thu',
      dataIndex: 'grossAmountDue',
      key: 'grossAmountDue',
      render: (val: number) => <Text strong style={{ color: '#0C6B37' }}>{formatVND(val)}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: string) => {
        if (st === 'PAID') return <Tag color="success">Đã thanh toán</Tag>;
        if (st === 'PARTIALLY_PAID') return <Tag color="processing">Một phần</Tag>;
        if (st === 'OVERDUE') return <Tag color="error">Quá hạn</Tag>;
        return <Tag color="warning">Chờ thanh toán</Tag>;
      },
    },
  ];

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={`Hợp đồng #${sub.id} – ${sub.service.name}`}
        code="ĐỊNH KỲ (SUB)"
        icon={<SyncOutlined />}
        status={getStatusTag(sub.status)}
        onBack={() => navigate('/subscriptions')}
        backLabel="Quay lại danh sách"
        metaTags={
          <Space size={16} wrap>
            <span>Khách hàng: <Text strong>{sub.customer.name}</Text></span>
            <span>Mã đơn hàng: <Text strong>{sub.orderCode}</Text></span>
            <span>Chu kỳ: <Tag color="blue">{sub.intervalCount} {sub.billingInterval}</Tag></span>
          </Space>
        }
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/subscriptions')}>
              Quay lại
            </Button>
            {canMutate && sub.status === 'ACTIVE' && (
              <>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  loading={generatePeriodMutation.isPending}
                  onClick={() => generatePeriodMutation.mutate()}
                >
                  Tạo kỳ tiếp theo
                </Button>
                <Popconfirm
                  title="Hủy hợp đồng định kỳ"
                  description="Bạn có chắc chắn muốn hủy hợp đồng Subscription này? Các kỳ tiếp theo sẽ không thể tạo tự động."
                  onConfirm={() => cancelMutation.mutate()}
                  okText="Đồng ý hủy"
                  cancelText="Bỏ qua"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<StopOutlined />} loading={cancelMutation.isPending}>
                    Hủy hợp đồng
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        }
      />

      {/* KPI Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="GIÁ TRỊ DỊCH VỤ (NET)"
          value={formatVND(sub.netServiceValue)}
          valueColor="#0C6B37"
          icon={<DollarOutlined />}
          subtitle={`Thuế VAT: ${formatVND(sub.vatAmount)}`}
        />
        <DetailSummaryCard
          title="TRẠNG THÁI HỢP ĐỒNG"
          value={sub.status === 'ACTIVE' ? 'Đang hoạt động' : sub.status}
          valueColor={sub.status === 'ACTIVE' ? '#0C6B37' : '#D97706'}
          icon={<SyncOutlined />}
          subtitle={`Chu kỳ: ${sub.intervalCount} ${sub.billingInterval}`}
        />
        <DetailSummaryCard
          title="TIẾN ĐỘ DỰ ÁN"
          value={sub.linkedProject ? `${sub.linkedProject.progressPercent}%` : 'Chưa kích hoạt'}
          icon={<ProjectOutlined />}
          subtitle={sub.linkedProject ? `Dự án: ${sub.linkedProject.projectName}` : 'Chưa có Project liên kết'}
        />
        <DetailSummaryCard
          title="KHÁCH HÀNG & LIÊN HỆ"
          value={sub.customer.name}
          icon={<CalendarOutlined />}
          subtitle={sub.customer.contactPhone || sub.customer.phone || 'Chưa cập nhật SĐT'}
        />
      </DetailSummaryGrid>

      {/* Two-Column Responsive Layout */}
      <div className="vmax-detail-layout">
        {/* Main Column */}
        <div className="vmax-detail-main">
          <div className="vmax-card" style={{ padding: '8px 20px 20px 20px', marginBottom: 20 }}>
            <Tabs
              defaultActiveKey="periods"
              items={[
                {
                  key: 'periods',
                  label: (
                    <span>
                      <CalendarOutlined /> Lịch sử Kỳ dịch vụ ({sub.periods.length})
                    </span>
                  ),
                  children: (
                    <Table
                      rowKey="id"
                      columns={periodColumns}
                      dataSource={sub.periods}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      locale={{ emptyText: 'Chưa có kỳ dịch vụ nào được khởi tạo' }}
                      onRow={createRowActionHandler((record: PeriodItem) => setSelectedPeriod(record))}
                    />
                  ),
                },
                {
                  key: 'paymentPlan',
                  label: (
                    <span>
                      <DollarOutlined /> Kế hoạch thanh toán
                    </span>
                  ),
                  children: (
                    <div>
                      {sub.paymentPlan ? (
                        <div>
                          <Descriptions column={{ xs: 1, sm: 3 }} size="small" style={{ marginBottom: 16 }}>
                            <Descriptions.Item label="Mã kế hoạch">#{sub.paymentPlan.id}</Descriptions.Item>
                            <Descriptions.Item label="Phiên bản">v{sub.paymentPlan.version}</Descriptions.Item>
                            <Descriptions.Item label="Trạng thái duyệt">
                              <Tag color="success">{sub.paymentPlan.status}</Tag>
                            </Descriptions.Item>
                          </Descriptions>

                          <Table
                            rowKey="id"
                            columns={installmentColumns}
                            dataSource={sub.paymentPlan.installments}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            locale={{ emptyText: 'Chưa có đợt thanh toán nào' }}
                            onRow={createRowActionHandler((record: any) => setSelectedInstallment(record))}
                          />
                        </div>
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="Không có kế hoạch thanh toán hiển thị hoặc thông tin tài chính được bảo mật theo vai trò truy cập"
                        />
                      )}
                    </div>
                  ),
                },
                {
                  key: 'project',
                  label: (
                    <span>
                      <ProjectOutlined /> Dự án triển khai
                    </span>
                  ),
                  children: (
                    <div>
                      {sub.linkedProject ? (
                        <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
                          <Descriptions.Item label="Tên dự án">
                            <Text strong>{sub.linkedProject.projectName}</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="Trạng thái">
                            <Tag color="blue">{sub.linkedProject.status}</Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label="Tiến độ hoàn thành">
                            <Progress percent={sub.linkedProject.progressPercent} size="small" />
                          </Descriptions.Item>
                          <Descriptions.Item label="Ngày bắt đầu">
                            {sub.linkedProject.startedAt ? new Date(sub.linkedProject.startedAt).toLocaleDateString('vi-VN') : 'Chưa bắt đầu'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Ngày hoàn thành">
                            {sub.linkedProject.completedAt ? new Date(sub.linkedProject.completedAt).toLocaleDateString('vi-VN') : 'Đang triển khai'}
                          </Descriptions.Item>
                        </Descriptions>
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="Chưa có Dự án (Project) kỹ thuật nào được kích hoạt từ Order Item này"
                        />
                      )}
                    </div>
                  ),
                },
                {
                  key: 'history',
                  label: (
                    <span>
                      <SyncOutlined /> Lịch sử Gia hạn & Quan hệ
                    </span>
                  ),
                  children: (
                    <div>
                      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="Hợp đồng gốc (Gia hạn từ)">
                          {sub.previousSubscriptionId ? (
                            <Button
                              type="link"
                              onClick={() => navigate(`/subscriptions/${sub.previousSubscriptionId}`)}
                            >
                              Xem hợp đồng gốc #{sub.previousSubscriptionId}
                            </Button>
                          ) : (
                            'Đây là hợp đồng khởi tạo ban đầu'
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Ngày tạo hợp đồng">
                          {new Date(sub.createdAt).toLocaleString('vi-VN')}
                        </Descriptions.Item>
                        <Descriptions.Item label="Lần cập nhật cuối">
                          {new Date(sub.updatedAt).toLocaleString('vi-VN')}
                        </Descriptions.Item>
                      </Descriptions>

                      {sub.renewalHistory && sub.renewalHistory.length > 0 && (
                        <div>
                          <Title level={5}>Hợp đồng kế thừa sau gia hạn:</Title>
                          <Table
                            rowKey="id"
                            dataSource={sub.renewalHistory}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            onRow={createRowNavigateHandler(navigate, (rid: any) => `/subscriptions/${rid.id}`)}
                            columns={[
                              {
                                title: 'Mã HĐ mới',
                                dataIndex: 'id',
                                key: 'id',
                                render: (rid: string) => (
                                  <Button
                                    type="link"
                                    onClick={() => navigate(`/subscriptions/${rid}`)}
                                  >
                                    Hợp đồng #{rid}
                                  </Button>
                                ),
                              },
                              {
                                title: 'Trạng thái',
                                dataIndex: 'status',
                                key: 'status',
                                render: (st: string) => getStatusTag(st),
                              },
                              {
                                title: 'Ngày bắt đầu',
                                dataIndex: 'startDate',
                                key: 'startDate',
                              },
                              {
                                title: 'Ngày kết thúc',
                                dataIndex: 'endDate',
                                key: 'endDate',
                                render: (d: string | null) => d || 'Vô thời hạn',
                              },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="vmax-detail-side">
          <DetailInfoCard
            title="Thông tin hợp đồng"
            columns={1}
            items={[
              { label: 'Trạng thái', value: getStatusTag(sub.status) },
              { label: 'Chu kỳ tính phí', value: <Tag color="blue">{sub.intervalCount} {sub.billingInterval}</Tag> },
              { label: 'Ngày bắt đầu', value: sub.startDate },
              { label: 'Ngày kết thúc', value: sub.endDate || 'Vô thời hạn (Liên tục)' },
              { label: 'Gia hạn tiếp theo', value: sub.renewalDate || 'Chưa xác định' },
              { label: 'Tự động gia hạn', value: sub.autoRenew ? <Tag color="green">Bật</Tag> : <Tag>Tắt</Tag> },
              { label: 'Giá trị Net', value: <Text strong style={{ color: '#0C6B37' }}>{formatVND(sub.netServiceValue)}</Text> },
              { label: 'Thuế VAT', value: formatVND(sub.vatAmount) },
              {
                label: 'Nhân viên chốt (Sale)',
                value: sub.closingSale ? `${sub.closingSale.fullName} (${sub.closingSale.employeeCode})` : 'N/A',
              },
            ]}
          />

          <DetailInfoCard
            title="Khách hàng & Doanh nghiệp"
            columns={1}
            items={[
              { label: 'Công ty', value: <Text strong>{sub.customer.name}</Text> },
              { label: 'Mã số thuế', value: sub.customer.taxCode || '—' },
              { label: 'Người liên hệ', value: sub.customer.contactName || 'Chưa có' },
              { label: 'Điện thoại', value: sub.customer.contactPhone || sub.customer.phone || 'Chưa có' },
              { label: 'Email', value: sub.customer.contactEmail || sub.customer.email || 'Chưa có' },
              { label: 'Địa chỉ', value: sub.customer.address || '—' },
            ]}
          />
        </div>
      </div>


      {/* Period Detail Modal */}
      <Modal
        title={`Chi tiết Kỳ dịch vụ #${selectedPeriod?.periodIndex || ''}`}
        open={!!selectedPeriod}
        onCancel={() => setSelectedPeriod(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedPeriod(null)}>
            Đóng
          </Button>,
        ]}
        width={650}
      >
        {selectedPeriod && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã kỳ">{selectedPeriod.id}</Descriptions.Item>
            <Descriptions.Item label="Kỳ thứ">Kỳ {selectedPeriod.periodIndex}</Descriptions.Item>
            <Descriptions.Item label="Thời gian thực hiện">
              {selectedPeriod.startDate} → {selectedPeriod.endDate}
            </Descriptions.Item>
            <Descriptions.Item label="Giá trị kỳ (Gross Payable)">
              <Text strong style={{ color: 'var(--vmax-green)', fontSize: 16 }}>
                {formatVND(selectedPeriod.grossPayable)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Tiến độ thực hiện">
              {getExecutionTag(selectedPeriod.executionStatus)}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái thanh toán">
              {getPaymentTag(selectedPeriod.paymentStatus)}
            </Descriptions.Item>
            <Descriptions.Item label="Nhân sự phân công">
              {selectedPeriod.assignments && selectedPeriod.assignments.length > 0 ? (
                <Space direction="vertical" size={4}>
                  {selectedPeriod.assignments.map((a: any) => (
                    <Space key={a.id}>
                      <Tag color={a.assignmentType === 'PRIMARY' ? 'blue' : 'default'}>
                        {a.assignmentType === 'PRIMARY' ? 'Chính' : 'Hỗ trợ'}
                      </Tag>
                      <Button
                        type="link"
                        style={{ padding: 0 }}
                        onClick={() => navigate(`/employees/${a.employeeId}`)}
                      >
                        {a.fullName}
                      </Button>
                      {!a.isActive && <Tag color="error">Đã thay thế</Tag>}
                    </Space>
                  ))}
                </Space>
              ) : (
                'Chưa phân công'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Nghiệm thu khách hàng">
              {selectedPeriod.acceptance ? (
                <Space direction="vertical" size={2}>
                  <Tag color="success">Đã ký nghiệm thu</Tag>
                  <div>Người ký: <strong>{selectedPeriod.acceptance.acceptedByName}</strong></div>
                  <div>Ngày ký: {new Date(selectedPeriod.acceptance.acceptedAt).toLocaleDateString('vi-VN')}</div>
                  {selectedPeriod.acceptance.evidenceDocument && (
                    <div>Hồ sơ: {selectedPeriod.acceptance.evidenceDocument}</div>
                  )}
                </Space>
              ) : (
                'Chưa nghiệm thu'
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Installment Detail Modal */}
      <Modal
        title={`Chi tiết đợt thanh toán #${selectedInstallment?.installmentNumber || ''}`}
        open={!!selectedInstallment}
        onCancel={() => setSelectedInstallment(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedInstallment(null)}>
            Đóng
          </Button>,
        ]}
        width={550}
      >
        {selectedInstallment && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã đợt">{selectedInstallment.id}</Descriptions.Item>
            <Descriptions.Item label="Đợt số">Đợt {selectedInstallment.installmentNumber}</Descriptions.Item>
            <Descriptions.Item label="Hạn thanh toán">{selectedInstallment.dueDate}</Descriptions.Item>
            <Descriptions.Item label="Số tiền phải thu">
              <Text strong style={{ color: 'var(--vmax-green)', fontSize: 16 }}>
                {formatVND(selectedInstallment.grossAmountDue)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              {selectedInstallment.status === 'PAID' ? (
                <Tag color="success">Đã thanh toán</Tag>
              ) : selectedInstallment.status === 'PARTIALLY_PAID' ? (
                <Tag color="processing">Một phần</Tag>
              ) : selectedInstallment.status === 'OVERDUE' ? (
                <Tag color="error">Quá hạn</Tag>
              ) : (
                <Tag color="warning">Chờ thanh toán</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};
