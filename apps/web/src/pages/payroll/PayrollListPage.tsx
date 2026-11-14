import React, { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Typography, Tag, Button, Space, Modal, Form, Input, DatePicker, App } from 'antd';
import { BankOutlined, PlusOutlined, LockOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { fetchPayrollPeriods, createPayrollPeriod, PayrollPeriod } from '../../api/payroll';
import { getStatusLabel, formatCurrency, formatDate } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

export const PayrollListPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [form] = Form.useForm();

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const res = await fetchPayrollPeriods({ page, limit: 10 });
      setPeriods(res.data);
      setTotal(res.meta.total);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải danh sách kỳ tính lương');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, [page]);

  const handleCreate = async (values: any) => {
    try {
      const startDate = values.dates[0].format('YYYY-MM-DD');
      const endDate = values.dates[1].format('YYYY-MM-DD');
      await createPayrollPeriod({
        periodKey: values.periodKey,
        startDate,
        endDate,
      });
      message.success('Tạo kỳ tính lương thành công');
      setIsModalOpen(false);
      form.resetFields();
      loadPeriods();
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo kỳ tính lương');
    }
  };

  const columns = [
    {
      title: 'Kỳ tính lương',
      dataIndex: 'period_key',
      key: 'period_key',
      render: (text: string, record: PayrollPeriod) => (
        <a onClick={() => navigate(`/payroll/${record.id}`)}>
          <Text strong>{text}</Text>
        </a>
      ),
    },
    {
      title: 'Ngày bắt đầu',
      dataIndex: 'start_date',
      key: 'start_date',
      render: (date: string) => formatDate(date),
    },
    {
      title: 'Ngày kết thúc',
      dataIndex: 'end_date',
      key: 'end_date',
      render: (date: string) => formatDate(date),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          OPEN: 'blue',
          CALCULATING: 'orange',
          REVIEW: 'gold',
          APPROVED: 'cyan',
          LOCKED: 'green',
        };
        return <Tag color={colorMap[status] || 'default'}>{getStatusLabel(status)}</Tag>;
      },
    },
    {
      title: 'Số nhân viên',
      dataIndex: 'employee_count',
      key: 'employee_count',
      render: (count: number) => count || 0,
    },
    {
      title: 'Tổng lương Gross',
      dataIndex: 'total_gross_payroll',
      key: 'total_gross_payroll',
      render: (val: number) => formatCurrency(val || 0),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: PayrollPeriod) => (
        <Button type="link" onClick={() => navigate(`/payroll/${record.id}`)}>
          Xem chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} className="vmax-page-title" style={{ margin: 0 }}>
            <BankOutlined style={{ color: 'var(--vmax-green)' }} /> Quản lý bảng lương theo kỳ
          </Title>
          <Text className="vmax-page-subtitle">
            Tính lương hàng tháng chính xác, khấu trừ và khóa chốt bảng lương
          </Text>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            Tạo kỳ tính lương
          </Button>
        </Col>
      </Row>

      <Card className="vmax-card" title="Danh sách kỳ tính lương">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={periods}
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Chưa có kỳ tính lương nào' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/payroll/${record.id}`)}
          pagination={{
            current: page,
            pageSize: 10,
            total,
            showTotal: (total) => `Tổng số ${total} kỳ tính lương`,
            showSizeChanger: true,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>

      <Modal
        title="Tạo kỳ tính lương mới"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        okText="Tạo kỳ lương"
        cancelText="Hủy"
      >
        <Form className="vmax-form" form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="periodKey"
            label="Mã kỳ tính lương (Ví dụ: 2026-09)"
            rules={[{ required: true, message: 'Vui lòng nhập mã kỳ tính lương' }]}
          >
            <Input placeholder="2026-09" />
          </Form.Item>
          <Form.Item
            name="dates"
            label="Ngày bắt đầu & Ngày kết thúc"
            rules={[{ required: true, message: 'Vui lòng chọn ngày bắt đầu và kết thúc' }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PayrollListPage;
