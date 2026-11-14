import React, { useEffect, useState } from 'react';
import {
  Tag,
  Button,
  Typography,
  Spin,
  Table,
  Space,
  Modal,
  Descriptions,
  App,
  Form,
  Select,
  InputNumber,
} from 'antd';
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  EyeOutlined,
  DollarCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPaymentByIdApi,
  getAllocatableInstallmentsApi,
  allocateConfirmedPaymentApi,
  AllocatableInstallment,
  PaymentItem,
} from '../../api/payments';
import { getStatusLabel, getPaymentMethodLabel, formatCurrency, formatDateTime } from '../../constants/labels';
import { createRowActionHandler } from '../../utils/tableUtils';
import {
  DetailPageHeader,
  DetailSummaryCard,
  DetailSummaryGrid,
  DetailInfoCard,
  DetailRelatedList,
} from '../../components/common/detail';
import { FilePreview, FilePreviewSource } from '../../components/storage/FilePreview';

const { Title, Text } = Typography;

export const PaymentDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<PaymentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAllocation, setSelectedAllocation] = useState<any | null>(null);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [allocatableInstallments, setAllocatableInstallments] = useState<AllocatableInstallment[]>([]);
  const [paymentRemaining, setPaymentRemaining] = useState(0);
  const [allocationMax, setAllocationMax] = useState(0);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationSubmitting, setAllocationSubmitting] = useState(false);
  const [allocationForm] = Form.useForm();

  useEffect(() => {
    if (id) {
      getPaymentByIdApi(id)
        .then((data) => setPayment(data))
        .catch(() => message.error('Không thể tải chi tiết thanh toán'))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!payment) {
    return <div style={{ padding: 24 }}>Không tìm thấy thông tin giao dịch thanh toán.</div>;
  }

  const evidenceUrl = payment.evidence_url;
  const evidenceSource: FilePreviewSource =
    evidenceUrl && /^https?:\/\//i.test(evidenceUrl)
      ? { type: 'direct', directUrl: evidenceUrl }
      : { type: 'payment', paymentId: payment.id };
  const evidenceFilename = evidenceUrl?.split(/[\\/]/).pop()?.split(/[?#]/)[0];

  const totalAllocated = payment.allocations?.reduce(
    (sum, a: any) => sum + (Number(a.gross_allocated_amount || a.grossAllocatedAmount) || 0),
    0
  ) || 0;
  const unallocatedAmount = Math.max(0, Number(payment.gross_cash_amount) - totalAllocated);

  const openAllocationModal = async () => {
    if (!payment) return;
    setAllocationLoading(true);
    try {
      const data = await getAllocatableInstallmentsApi(payment.id);
      setPaymentRemaining(data.paymentRemaining);
      setAllocatableInstallments(data.installments);
      if (data.installments.length === 0) {
        message.info('Không có đợt thanh toán nào còn dư nợ để phân bổ');
        return;
      }
      const firstInstallment = data.installments[0];
      const initialAmount = Math.min(data.paymentRemaining, firstInstallment.remaining_amount);
      setAllocationMax(initialAmount);
      allocationForm.setFieldsValue({
        installmentId: firstInstallment.installment_id,
        grossAllocatedAmount: initialAmount,
      });
      setAllocationModalOpen(true);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải các đợt thanh toán còn dư nợ');
    } finally {
      setAllocationLoading(false);
    }
  };

  const handleAllocatePayment = async () => {
    if (!payment) return;
    try {
      const values = await allocationForm.validateFields();
      setAllocationSubmitting(true);
      await allocateConfirmedPaymentApi(payment.id, values);
      message.success('Đã phân bổ khoản thanh toán');
      setAllocationModalOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err.message || 'Không thể phân bổ khoản thanh toán');
    } finally {
      setAllocationSubmitting(false);
    }
    try {
      setPayment(await getPaymentByIdApi(payment.id));
    } catch {
      message.error('Đã phân bổ nhưng không thể tải lại chi tiết thanh toán');
    }
  };

  const allocationColumns = [
    {
      title: 'Mã phân bổ',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => <Text strong style={{ color: '#0F172A' }}>#{val}</Text>,
    },
    {
      title: 'Đợt thanh toán',
      key: 'installment_id',
      render: (_: any, record: any) => {
        const instId = record.installment_id || record.installmentId;
        return instId ? `Đợt #${instId}` : '—';
      },
    },
    {
      title: 'Thực thu phân bổ',
      key: 'gross_allocated_amount',
      render: (_: any, record: any) => {
        const val = record.gross_allocated_amount ?? record.grossAllocatedAmount;
        return <Text strong style={{ color: '#0C6B37' }}>{formatCurrency(val || 0)}</Text>;
      },
    },
    {
      title: 'VAT phân bổ',
      key: 'vat_allocated_amount',
      render: (_: any, record: any) => {
        const val = record.vat_allocated_amount ?? record.vatAllocatedAmount;
        return formatCurrency(val || 0);
      },
    },
    {
      title: 'Giá trị dịch vụ',
      key: 'service_amount',
      render: (_: any, record: any) => {
        const val = record.service_amount ?? record.serviceAmount;
        return formatCurrency(val || 0);
      },
    },
    {
      title: 'Thời điểm xác nhận',
      key: 'confirmed_at',
      render: (_: any, record: any) => {
        const date = record.confirmed_at || record.confirmedAt;
        return date ? formatDateTime(date) : '—';
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: any) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAllocation(record);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  const getPaymentStatusTag = (status: string) => {
    if (status === 'CONFIRMED') {
      return <Tag color="success">{getStatusLabel(status)}</Tag>;
    }
    if (status === 'REJECTED') {
      return <Tag color="error">{getStatusLabel(status)}</Tag>;
    }
    return <Tag color="warning">{getStatusLabel(status)}</Tag>;
  };

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={`Thanh toán #${payment.payment_code}`}
        code="GIAO DỊCH"
        icon={<DollarCircleOutlined />}
        status={getPaymentStatusTag(payment.status)}
        onBack={() => navigate('/payments')}
        backLabel="Quay lại danh sách"
        metaTags={
          <Space size={16} wrap>
            <span>Phương thức: <Tag color="blue">{getPaymentMethodLabel(payment.payment_method)}</Tag></span>
            <span>Số tiền: <Text strong style={{ color: '#0C6B37' }}>{formatCurrency(payment.gross_cash_amount)}</Text></span>
            <span>
              Xác nhận: <Text strong>{payment.confirmed_at ? formatDateTime(payment.confirmed_at) : 'Chờ xác nhận'}</Text>
            </span>
          </Space>
        }
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/payments')}>
              Quay lại
            </Button>
            {payment.status === 'CONFIRMED' && unallocatedAmount > 0 && (
              <Button
                type="primary"
                loading={allocationLoading}
                onClick={openAllocationModal}
              >
                Phân bổ khoản tiền
              </Button>
            )}
            {evidenceUrl && (
              <FilePreview
                source={evidenceSource}
                filename={evidenceFilename}
                buttonText="Xem chứng từ"
                type="primary"
              />
            )}
          </Space>
        }
      />

      {/* KPI Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="THỰC THU (GROSS CASH)"
          value={formatCurrency(payment.gross_cash_amount)}
          valueColor="#0C6B37"
          icon={<DollarCircleOutlined />}
          subtitle={`Phương thức: ${getPaymentMethodLabel(payment.payment_method)}`}
        />
        <DetailSummaryCard
          title="TRẠNG THÁI GIAO DỊCH"
          value={getStatusLabel(payment.status)}
          valueColor={payment.status === 'CONFIRMED' ? '#0C6B37' : payment.status === 'REJECTED' ? '#DC2626' : '#D97706'}
          icon={<SafetyCertificateOutlined />}
          subtitle={payment.confirmed_at ? `Xác nhận lúc ${formatDateTime(payment.confirmed_at)}` : 'Chờ kế toán đối soát'}
        />
        <DetailSummaryCard
          title="TỔNG PHÂN BỔ ĐỢT"
          value={formatCurrency(totalAllocated)}
          icon={<CheckCircleOutlined />}
          subtitle={`${payment.allocations?.length || 0} đợt phân bổ đã ghi nhận`}
        />
        <DetailSummaryCard
          title="CHỨNG TỪ THANH TOÁN"
          value={payment.evidence_url ? 'Đã đính kèm' : 'Chưa có'}
          valueColor={payment.evidence_url ? '#0C6B37' : undefined}
          icon={<FileTextOutlined />}
          subtitle={payment.evidence_url ? 'Có file chứng từ hợp lệ' : 'Chưa tải file bằng chứng'}
        />
      </DetailSummaryGrid>

      {/* Two-Column Responsive Layout */}
      <div className="vmax-detail-layout">
        {/* Main Column */}
        <div className="vmax-detail-main">
          <DetailRelatedList
            title="Chi tiết phân bổ thanh toán"
            count={payment.allocations?.length || 0}
          >
            <Table
              columns={allocationColumns}
              dataSource={payment.allocations || []}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              onRow={createRowActionHandler((record) => setSelectedAllocation(record))}
            />
          </DetailRelatedList>

          {/* Section bằng chứng / chứng từ */}
          {evidenceUrl && (
            <div className="vmax-card" style={{ padding: 20, marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <Title level={5} style={{ margin: 0, color: '#0F172A', fontWeight: 600 }}>
                    Tài liệu & Chứng từ thanh toán
                  </Title>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    File chứng từ hoặc ảnh chụp ủy nhiệm chi / chuyển khoản
                  </Text>
                </div>
                <FilePreview
                  source={evidenceSource}
                  filename={evidenceFilename}
                  buttonText="Mở chứng từ"
                  type="primary"
                />
              </div>
              <div
                style={{
                  background: '#F8FAFC',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <FileTextOutlined style={{ fontSize: 24, color: '#0C6B37' }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Text strong ellipsis style={{ display: 'block', color: '#1E293B' }}>
                    {evidenceUrl}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Bấm nút "Mở chứng từ" để kiểm tra tính hợp lệ
                  </Text>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="vmax-detail-side">
          <DetailInfoCard
            title="Thông tin thanh toán"
            columns={1}
            items={[
              { label: 'Mã thanh toán', value: <Text strong>{payment.payment_code}</Text> },
              { label: 'Số tiền thực thu', value: <Text strong style={{ color: '#0C6B37', fontSize: 16 }}>{formatCurrency(payment.gross_cash_amount)}</Text> },
              { label: 'Phương thức', value: <Tag color="blue">{getPaymentMethodLabel(payment.payment_method)}</Tag> },
              { label: 'Trạng thái', value: getPaymentStatusTag(payment.status) },
            ]}
          />

          <DetailInfoCard
            title="Kiểm duyệt & Đối soát"
            columns={1}
            items={[
              {
                label: 'Nhân viên tạo',
                value: payment.created_by_employee_id ? (
                  <Button
                    type="link"
                    style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                    onClick={() => navigate(`/employees/${payment.created_by_employee_id}`)}
                  >
                    Xem hồ sơ #{payment.created_by_employee_id}
                  </Button>
                ) : '—'
              },
              {
                label: 'Nhân viên xác nhận',
                value: payment.confirmed_by_employee_id ? (
                  <Button
                    type="link"
                    style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                    onClick={() => navigate(`/employees/${payment.confirmed_by_employee_id}`)}
                  >
                    Xem hồ sơ #{payment.confirmed_by_employee_id}
                  </Button>
                ) : <Text type="secondary">Chưa có</Text>
              },
              {
                label: 'Thời điểm xác nhận',
                value: payment.confirmed_at ? formatDateTime(payment.confirmed_at) : <Text type="secondary">Chưa xác nhận</Text>
              },
              {
                label: 'Chứng từ đính kèm',
                value: evidenceUrl ? (
                  <FilePreview
                    source={evidenceSource}
                    filename={evidenceFilename}
                    buttonText="Xem tài liệu"
                    size="small"
                    type="link"
                  />
                ) : <Text type="secondary">Chưa tải lên</Text>
              },
            ]}
          />
        </div>
      </div>

      {/* Modal chi tiết phân bổ */}
      <Modal
        title={`Phân bổ thanh toán #${payment.payment_code}`}
        open={allocationModalOpen}
        onCancel={() => setAllocationModalOpen(false)}
        onOk={handleAllocatePayment}
        confirmLoading={allocationSubmitting}
        okText="Xác nhận phân bổ"
        cancelText="Hủy"
      >
        <Form
          form={allocationForm}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={(changedValues) => {
            if (changedValues.installmentId) {
              const installment = allocatableInstallments.find(
                (item) => item.installment_id === changedValues.installmentId,
              );
              if (installment) {
                const maxAmount = Math.min(paymentRemaining, installment.remaining_amount);
                setAllocationMax(maxAmount);
                allocationForm.setFieldValue(
                  'grossAllocatedAmount',
                  maxAmount,
                );
              }
            }
          }}
        >
          <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Chưa phân bổ">
              <Text strong>{formatCurrency(paymentRemaining)}</Text>
            </Descriptions.Item>
          </Descriptions>
          <Form.Item
            name="installmentId"
            label="Đợt thanh toán"
            rules={[{ required: true, message: 'Chọn đợt cần phân bổ' }]}
          >
            <Select
              options={allocatableInstallments.map((item) => ({
                value: item.installment_id,
                label: `${item.order_code} · ${item.service_name} · Đợt ${item.installment_number} · Còn ${formatCurrency(item.remaining_amount)}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="grossAllocatedAmount"
            label="Số tiền phân bổ"
            rules={[{ required: true, message: 'Nhập số tiền phân bổ' }]}
          >
            <InputNumber
              min={0.01}
              max={allocationMax}
              precision={2}
              style={{ width: '100%' }}
              formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => Number(String(value || '').replace(/,/g, ''))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal chi tiết phân bổ */}
      <Modal
        title={`Chi tiết phân bổ thanh toán #${selectedAllocation?.id || ''}`}
        open={!!selectedAllocation}
        onCancel={() => setSelectedAllocation(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedAllocation(null)}>
            Đóng
          </Button>,
        ]}
        width={600}
      >
        {selectedAllocation && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="ID phân bổ">{selectedAllocation.id}</Descriptions.Item>
            <Descriptions.Item label="Đợt thanh toán (Installment)">
              {selectedAllocation.installment_id || selectedAllocation.installmentId ? `Đợt #${selectedAllocation.installment_id || selectedAllocation.installmentId}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền thực thu phân bổ">
              <Text strong style={{ color: '#0C6B37' }}>
                {formatCurrency(selectedAllocation.gross_allocated_amount || selectedAllocation.grossAllocatedAmount || 0)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="VAT phân bổ">
              {formatCurrency(selectedAllocation.vat_allocated_amount || selectedAllocation.vatAllocatedAmount || 0)}
            </Descriptions.Item>
            <Descriptions.Item label="Giá trị dịch vụ">
              {formatCurrency(selectedAllocation.service_amount || selectedAllocation.serviceAmount || 0)}
            </Descriptions.Item>
            <Descriptions.Item label="Doanh thu hợp lệ (Net Eligible)">
              {formatCurrency(selectedAllocation.net_eligible_amount || selectedAllocation.netEligibleAmount || 0)}
            </Descriptions.Item>
            <Descriptions.Item label="Thời điểm xác nhận">
              {selectedAllocation.confirmed_at ? formatDateTime(selectedAllocation.confirmed_at) : '—'}
            </Descriptions.Item>
            {(selectedAllocation.closing_sale_id || selectedAllocation.closingSaleId) && (
              <Descriptions.Item label="Nhân viên chốt sale">
                <Button
                  type="link"
                  style={{ padding: 0 }}
                  onClick={() => {
                    navigate(`/employees/${selectedAllocation.closing_sale_id || selectedAllocation.closingSaleId}`);
                  }}
                >
                  Xem hồ sơ nhân sự #{selectedAllocation.closing_sale_id || selectedAllocation.closingSaleId}
                </Button>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};
