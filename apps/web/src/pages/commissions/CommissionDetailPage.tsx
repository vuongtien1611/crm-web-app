import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tag, Button, Space, Typography, Modal, InputNumber, Input, App } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  CloseCircleOutlined,
  DollarCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import {
  fetchCommissionById,
  approveCommission,
  adjustCommission,
  rejectCommission,
  CommissionDetail,
} from '../../api/commissions';
import { getStatusLabel, getCommissionTypeLabel, formatCurrency, formatDateTime } from '../../constants/labels';
import {
  DetailPageHeader,
  DetailSummaryCard,
  DetailSummaryGrid,
  DetailInfoCard,
} from '../../components/common/detail';

const { Title, Text } = Typography;

export const CommissionDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Chỉ loading ở lần đầu mở trang
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<CommissionDetail | null>(null);
  // Quản lý trạng thái đang xử lý của các nút bấm
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals state
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [adjustedAmount, setAdjustedAmount] = useState<number>(0);
  const [decisionReason, setDecisionReason] = useState<string>('');

  // Tải chi tiết hoa hồng - không unmount màn hình khi làm mới ngầm
  const loadDetail = async (isInitial = false) => {
    if (!id) return;
    if (isInitial) setLoading(true);
    try {
      const res = await fetchCommissionById(id);
      setData(res);
      setAdjustedAmount(res.calculated_amount);
    } catch (err: any) {
      message.error('Không thể tải chi tiết hoa hồng');
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail(true);
  }, [id]);

  // Duyệt hoa hồng
  const handleApprove = async () => {
    if (!id || actionLoading) return;
    setActionLoading('approve');
    try {
      await approveCommission(id);
      message.success('Duyệt hoa hồng thành công');
      await loadDetail(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể duyệt hoa hồng');
    } finally {
      setActionLoading(null);
    }
  };

  // Điều chỉnh hoa hồng
  const handleAdjustSubmit = async () => {
    if (!id || actionLoading) return;
    setActionLoading('adjust');
    try {
      await adjustCommission(id, adjustedAmount, decisionReason);
      message.success('Điều chỉnh hoa hồng thành công');
      setIsAdjustModalOpen(false);
      await loadDetail(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể điều chỉnh hoa hồng');
    } finally {
      setActionLoading(null);
    }
  };

  // Từ chối hoa hồng
  const handleRejectSubmit = async () => {
    if (!id || actionLoading) return;
    setActionLoading('reject');
    try {
      await rejectCommission(id, decisionReason);
      message.success('Từ chối hoa hồng thành công');
      setIsRejectModalOpen(false);
      await loadDetail(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể từ chối hoa hồng');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="vmax-detail-page" style={{ padding: 60, textAlign: 'center' }}>
        <Text type="secondary">Đang tải chi tiết hoa hồng...</Text>
      </div>
    );
  }

  const isBossActionable = data.commission_type !== 'SALE' && data.status === 'CALCULATED';

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={`Hoa hồng #${data.id}`}
        code={getCommissionTypeLabel(data.commission_type)}
        icon={<DollarCircleOutlined />}
        status={
          <Tag color={data.status === 'RELEASED' ? 'success' : data.status === 'CALCULATED' ? 'warning' : 'processing'}>
            {getStatusLabel(data.status)}
          </Tag>
        }
        onBack={() => navigate('/commissions')}
        backLabel="Quay lại danh sách"
        metaTags={
          <Space size={16} wrap>
            <span>
              Người thụ hưởng: <Text strong>{data.beneficiary_name}</Text>
            </span>
            <span>
              Chính sách: <Tag color="blue">{data.policy_name || 'Tiêu chuẩn'}</Tag>
            </span>
            <span>
              Ngày tạo: <Text strong>{formatDateTime(data.created_at)}</Text>
            </span>
          </Space>
        }
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/commissions')}>
              Quay lại
            </Button>
            {isBossActionable && (
              <>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={actionLoading === 'approve'}
                  disabled={!!actionLoading}
                  onClick={handleApprove}
                >
                  Duyệt hoa hồng
                </Button>
                <Button
                  icon={<EditOutlined />}
                  disabled={!!actionLoading}
                  onClick={() => setIsAdjustModalOpen(true)}
                >
                  Điều chỉnh
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  disabled={!!actionLoading}
                  onClick={() => setIsRejectModalOpen(true)}
                >
                  Từ chối
                </Button>
              </>
            )}
          </Space>
        }
      />

      {/* KPI Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="SỐ TIỀN ĐÃ DUYỆT"
          value={data.approved_amount !== null ? formatCurrency(data.approved_amount) : 'Chờ duyệt'}
          valueColor="#0C6B37"
          icon={<DollarCircleOutlined />}
          subtitle={`Số tiền tính toán: ${formatCurrency(data.calculated_amount)}`}
        />
        <DetailSummaryCard
          title="DOANH SỐ CƠ SỞ (BASE)"
          value={formatCurrency(data.commission_base)}
          icon={<SafetyCertificateOutlined />}
          subtitle={`Tỷ lệ áp dụng: ${(Number(data.rate_snapshot) * 100).toFixed(1)}%`}
        />
        <DetailSummaryCard
          title="TRẠNG THÁI HOA HỒNG"
          value={getStatusLabel(data.status)}
          valueColor={data.status === 'RELEASED' ? '#0C6B37' : data.status === 'CALCULATED' ? '#D97706' : '#2563EB'}
          icon={<CheckCircleOutlined />}
          subtitle={`Loại: ${getCommissionTypeLabel(data.commission_type)}`}
        />
        <DetailSummaryCard
          title="NGƯỜI THỤ HƯỞNG"
          value={data.beneficiary_name}
          icon={<UserOutlined />}
          subtitle={`Chính sách: ${data.policy_name || 'Áp dụng theo vai trò'}`}
        />
      </DetailSummaryGrid>

      {/* Two-Column Responsive Layout */}
      <div className="vmax-detail-layout">
        {/* Main Column */}
        <div className="vmax-detail-main">
          <DetailInfoCard
            title="Chi tiết tính toán & Phê duyệt hoa hồng"
            columns={2}
            items={[
              { label: 'Người thụ hưởng', value: <Text strong>{data.beneficiary_name}</Text> },
              { label: 'Loại hoa hồng', value: <Tag color="geekblue">{getCommissionTypeLabel(data.commission_type)}</Tag> },
              { label: 'Tên chính sách', value: data.policy_name || 'Chính sách mặc định' },
              {
                label: 'Tỷ lệ hoa hồng',
                value: <Text strong>{(Number(data.rate_snapshot) * 100).toFixed(1)}%</Text>,
              },
              {
                label: 'Số tiền doanh số cơ sở',
                value: <Text strong>{formatCurrency(data.commission_base)}</Text>,
              },
              {
                label: 'Số tiền tính toán tự động',
                value: <Text strong style={{ color: '#2563EB' }}>{formatCurrency(data.calculated_amount)}</Text>,
              },
              {
                label: 'Số tiền phê duyệt chính thức',
                value: (
                  <Text strong style={{ color: '#0C6B37', fontSize: 16 }}>
                    {data.approved_amount !== null ? formatCurrency(data.approved_amount) : 'Chưa duyệt'}
                  </Text>
                ),
              },
              {
                label: 'Lý do quyết định / điều chỉnh',
                value: data.decision_reason || <Text type="secondary">Không có ghi chú</Text>,
              },
            ]}
          />
        </div>

        {/* Sidebar Column */}
        <div className="vmax-detail-side">
          <DetailInfoCard
            title="Thông tin hệ thống"
            columns={1}
            items={[
              { label: 'Mã hoa hồng', value: <Text strong>#{data.id}</Text> },
              { label: 'Trạng thái hiện tại', value: getStatusLabel(data.status) },
              { label: 'Thời điểm tạo', value: formatDateTime(data.created_at) },
            ]}
          />

          <DetailInfoCard
            title="Liên kết nghiệp vụ"
            columns={1}
            items={[
              {
                label: 'Danh sách hoa hồng',
                value: (
                  <Button
                    type="link"
                    icon={<DollarCircleOutlined />}
                    style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                    onClick={() => navigate('/commissions')}
                  >
                    Xem toàn bộ hoa hồng
                  </Button>
                ),
              },
              {
                label: 'Bảng lương nhân sự',
                value: (
                  <Button
                    type="link"
                    icon={<FileTextOutlined />}
                    style={{ padding: 0, height: 'auto', color: '#0C6B37' }}
                    onClick={() => navigate('/payroll')}
                  >
                    Xem bảng lương
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Adjust Modal */}
      <Modal
        title="Điều chỉnh số tiền hoa hồng"
        open={isAdjustModalOpen}
        onOk={handleAdjustSubmit}
        onCancel={() => setIsAdjustModalOpen(false)}
        confirmLoading={actionLoading === 'adjust'}
        okText="Xác nhận"
        cancelText="Hủy"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>Số tiền tính toán: {formatCurrency(data.calculated_amount)}</Text>
          <InputNumber
            style={{ width: '100%' }}
            value={adjustedAmount}
            onChange={(val) => setAdjustedAmount(val || 0)}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number(value?.replace(/\$\s?|(,*)/g, ''))}
          />
          <Input.TextArea
            placeholder="Nhập lý do điều chỉnh"
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
          />
        </Space>
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Từ chối hoa hồng"
        open={isRejectModalOpen}
        onOk={handleRejectSubmit}
        onCancel={() => setIsRejectModalOpen(false)}
        confirmLoading={actionLoading === 'reject'}
        okText="Xác nhận từ chối"
        cancelText="Hủy"
      >
        <Input.TextArea
          placeholder="Nhập lý do từ chối"
          value={decisionReason}
          onChange={(e) => setDecisionReason(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default CommissionDetailPage;

