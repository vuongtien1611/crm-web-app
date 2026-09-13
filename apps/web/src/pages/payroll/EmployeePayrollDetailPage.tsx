import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Modal,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  DollarOutlined,
  EyeOutlined,
  UserOutlined,
  CalendarOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  FormOutlined,
} from '@ant-design/icons';
import {
  fetchEmployeePayrollDetail,
  EmployeePayrollDetail,
  PayrollItemLine,
  PayrollAdjustment,
} from '../../api/payroll';
import { formatCurrency, formatDateTime } from '../../constants/labels';
import { createRowActionHandler } from '../../utils/tableUtils';
import { DetailPageHeader } from '../../components/common/detail/DetailPageHeader';
import { DetailSummaryCard, DetailSummaryGrid } from '../../components/common/detail/DetailSummaryCard';
import { DetailInfoCard } from '../../components/common/detail/DetailInfoCard';
import { DetailRelatedList } from '../../components/common/detail/DetailRelatedList';

const { Text } = Typography;

export const EmployeePayrollDetailPage: React.FC = () => {
  const { periodId, employeeId } = useParams<{ periodId: string; employeeId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<EmployeePayrollDetail | null>(null);
  const [selectedItem, setSelectedItem] = useState<PayrollItemLine | null>(null);
  const [selectedAdjustment, setSelectedAdjustment] = useState<PayrollAdjustment | null>(null);

  const loadData = async () => {
    if (!periodId || !employeeId) return;
    setLoading(true);
    try {
      const detail = await fetchEmployeePayrollDetail(periodId, employeeId);
      setData(detail);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải chi tiết phiếu lương nhân viên');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [periodId, employeeId]);

  if (loading || !data) {
    return (
      <div className="vmax-detail-page">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <Spin size="large" />
        </div>
      </div>
    );
  }

  const itemColumns = [
    {
      title: 'Loại khoản mục',
      dataIndex: 'item_type',
      key: 'item_type',
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: 'Diễn giải / Mô tả',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => (
        <Text strong style={{ color: 'var(--vmax-green)' }}>
          {formatCurrency(val || 0)}
        </Text>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: PayrollItemLine) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedItem(record);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  const adjColumns = [
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => (
        <Text type={val < 0 ? 'danger' : 'success'} strong>
          {formatCurrency(val || 0)}
        </Text>
      ),
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => formatDateTime(date),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: PayrollAdjustment) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAdjustment(record);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={`Phiếu lương: ${data.employee_name}`}
        code={data.employee_code}
        icon={<UserOutlined />}
        status={<Tag color="green" style={{ borderRadius: 12, padding: '2px 10px' }}>Hạch toán kỳ</Tag>}
        onBack={() => navigate(`/payroll/${periodId}`)}
        backLabel="Quay lại kỳ lương"
        metaTags={
          <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
            <span>Mã nhân viên: <Text strong>{data.employee_code}</Text></span>
            <span>Kỳ lương ID: <Text strong>#{periodId}</Text></span>
          </Space>
        }
      />

      {/* Summary Grid */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="Lương thực nhận (Net)"
          value={formatCurrency(data.net_salary_amount)}
          subtitle="Số tiền chi trả cuối cùng"
          icon={<DollarOutlined />}
          valueColor="#0C6B37"
        />
        <DetailSummaryCard
          title="Lương cơ bản"
          value={formatCurrency(data.base_salary)}
          subtitle="Ngạch bậc theo vị trí"
          icon={<DollarOutlined />}
        />
        <DetailSummaryCard
          title="Hoa hồng được nhận"
          value={formatCurrency(data.released_commission_amount)}
          subtitle="Đã chốt giải ngân"
          icon={<SafetyCertificateOutlined />}
        />
        <DetailSummaryCard
          title="Thưởng KPI & Quản lý"
          value={formatCurrency((data.kpi_bonus_amount || 0) + (data.team_override_amount || 0))}
          subtitle={`KPI: ${formatCurrency(data.kpi_bonus_amount)} | TL: ${formatCurrency(data.team_override_amount)}`}
          icon={<TeamOutlined />}
        />
      </DetailSummaryGrid>

      {/* 2-Column Responsive Layout */}
      <div className="vmax-detail-grid">
        {/* Main Column */}
        <div className="vmax-detail-main">
          {/* Item Breakdown List */}
          <DetailRelatedList
            title="Nguồn cấu thành khoản mục"
            count={data.items?.length || 0}
          >
            <Table
              rowKey="id"
              columns={itemColumns}
              dataSource={data.items}
              pagination={false}
              scroll={{ x: 'max-content' }}
              onRow={createRowActionHandler((record) => setSelectedItem(record))}
            />
          </DetailRelatedList>

          {/* Adjustments List */}
          <DetailRelatedList
            title="Khoản điều chỉnh thủ công"
            count={data.adjustments?.length || 0}
          >
            <Table
              rowKey="id"
              columns={adjColumns}
              dataSource={data.adjustments}
              pagination={false}
              scroll={{ x: 'max-content' }}
              onRow={createRowActionHandler((record) => setSelectedAdjustment(record))}
            />
          </DetailRelatedList>
        </div>

        {/* Side Column */}
        <div className="vmax-detail-side">
          <DetailInfoCard
            title="Tổng hợp thu nhập nhân sự"
            columns={1}
            items={[
              { label: 'Tên nhân viên', value: <Text strong>{data.employee_name}</Text> },
              { label: 'Mã nhân viên', value: <Tag color="blue">{data.employee_code}</Tag> },
              { label: 'Lương cơ bản', value: formatCurrency(data.base_salary) },
              { label: 'Hoa hồng kinh doanh', value: formatCurrency(data.released_commission_amount) },
              { label: 'Thưởng KPI', value: formatCurrency(data.kpi_bonus_amount) },
              { label: 'Hoa hồng quản lý (TL)', value: formatCurrency(data.team_override_amount) },
              {
                label: 'Điều chỉnh thủ công',
                value: (
                  <Text type={data.adjustment_amount < 0 ? 'danger' : data.adjustment_amount > 0 ? 'success' : undefined}>
                    {formatCurrency(data.adjustment_amount)}
                  </Text>
                ),
              },
              {
                label: 'Tổng thực lĩnh (Net)',
                value: (
                  <Text strong style={{ color: '#0C6B37', fontSize: 16 }}>
                    {formatCurrency(data.net_salary_amount)}
                  </Text>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Item Modal */}
      <Modal
        title="Chi tiết khoản mục lương"
        open={!!selectedItem}
        onCancel={() => setSelectedItem(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedItem(null)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedItem && (
          <div style={{ marginTop: 16 }}>
            <DetailInfoCard
              title="Thông tin khoản mục"
              columns={1}
              items={[
                { label: 'Mã khoản mục', value: selectedItem.id },
                { label: 'Loại khoản mục', value: <Tag color="blue">{selectedItem.item_type}</Tag> },
                { label: 'Diễn giải / Mô tả', value: selectedItem.description },
                {
                  label: 'Số tiền',
                  value: (
                    <Text strong style={{ color: '#0C6B37', fontSize: 16 }}>
                      {formatCurrency(selectedItem.amount || 0)}
                    </Text>
                  ),
                },
                {
                  label: 'Thời điểm phát sinh',
                  value: selectedItem.created_at ? formatDateTime(selectedItem.created_at) : '—',
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Adjustment Modal */}
      <Modal
        title="Chi tiết điều chỉnh thủ công"
        open={!!selectedAdjustment}
        onCancel={() => setSelectedAdjustment(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedAdjustment(null)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedAdjustment && (
          <div style={{ marginTop: 16 }}>
            <DetailInfoCard
              title="Thông tin điều chỉnh"
              columns={1}
              items={[
                { label: 'Mã điều chỉnh', value: selectedAdjustment.id },
                {
                  label: 'Số tiền điều chỉnh',
                  value: (
                    <Text
                      strong
                      type={selectedAdjustment.amount < 0 ? 'danger' : 'success'}
                      style={{ fontSize: 16 }}
                    >
                      {formatCurrency(selectedAdjustment.amount || 0)}
                    </Text>
                  ),
                },
                { label: 'Lý do điều chỉnh', value: selectedAdjustment.reason },
                {
                  label: 'Nhân viên thực hiện',
                  value: selectedAdjustment.created_by_employee_id || 'Hệ thống',
                },
                {
                  label: 'Thời điểm tạo',
                  value: selectedAdjustment.created_at ? formatDateTime(selectedAdjustment.created_at) : '—',
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EmployeePayrollDetailPage;
