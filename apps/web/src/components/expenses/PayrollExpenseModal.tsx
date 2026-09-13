import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Input, Alert, Tag, Typography, App, Button } from 'antd';
import { createExpenseFromPayroll } from '../../api/expenses';
import { fetchPayrollPeriods, PayrollPeriod } from '../../api/payroll';

const { Text } = Typography;

interface PayrollExpenseModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export const PayrollExpenseModal: React.FC<PayrollExpenseModalProps> = ({
  open,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [fetchingPeriods, setFetchingPeriods] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const { message } = App.useApp();

  useEffect(() => {
    setFetchingPeriods(true);
    fetchPayrollPeriods({ limit: 50 })
      .then((res) => {
        setPeriods(res.data || []);
      })
      .catch(() => {
        message.error('Không thể tải danh sách kỳ tính lương');
      })
      .finally(() => setFetchingPeriods(false));
  }, []);

  const handlePeriodChange = (periodId: string) => {
    const found = periods.find((p) => p.id === periodId) || null;
    setSelectedPeriod(found);
  };

  const handleFinish = async (values: any) => {
    if (!selectedPeriod) return;
    if (selectedPeriod.status !== 'LOCKED') {
      message.warning('Kỳ tính lương phải ở trạng thái "ĐÃ KHÓA" (LOCKED) mới có thể hạch toán chi phí');
      return;
    }

    setLoading(true);
    try {
      await createExpenseFromPayroll({
        payroll_period_id: values.payroll_period_id,
        note: values.note,
      });
      message.success(`Hạch toán chi phí lương kỳ [${selectedPeriod.period_key}] thành công`);
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('already exists') || errMsg.includes('dedup')) {
        message.info('Kỳ lương này đã được hạch toán chi phí trước đó.');
        onSuccess();
      } else {
        message.error(errMsg || 'Không thể hạch toán chi phí từ bảng lương');
      }
    } finally {
      setLoading(false);
    }
  };

  const isLocked = selectedPeriod?.status === 'LOCKED';

  return (
    <Modal
      title="Hạch toán chi phí từ Bảng lương"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Hủy
        </Button>,
        <Button
          key="submit"
          type="primary"
          htmlType="submit"
          form="payroll-expense-form"
          loading={loading}
          disabled={selectedPeriod ? !isLocked : true}
          style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
        >
          Hạch toán chi phí
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12, marginBottom: 16 }}
        message="Nguyên tắc kế toán"
        description="Chỉ những kỳ tính lương đã được Sếp duyệt và chốt khóa (LOCKED) mới đủ điều kiện ghi nhận thành khoản chi phí lương chính thức."
      />

      <Form id="payroll-expense-form" className="vmax-form" form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="payroll_period_id"
          label="Chọn kỳ tính lương"
          rules={[{ required: true, message: 'Vui lòng chọn kỳ tính lương' }]}
        >
          <Select
            placeholder="Chọn kỳ lương..."
            loading={fetchingPeriods}
            onChange={handlePeriodChange}
            options={periods.map((p) => ({
              label: `Kỳ lương ${p.period_key} (${p.status})`,
              value: p.id,
            }))}
          />
        </Form.Item>

        {selectedPeriod && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: 'var(--vmax-bg)',
              marginBottom: 16,
              border: '1px solid var(--vmax-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong>Trạng thái kỳ lương:</Text>
              <Tag color={isLocked ? 'green' : 'orange'}>
                {selectedPeriod.status === 'LOCKED'
                  ? 'ĐÃ KHÓA (Hợp lệ)'
                  : selectedPeriod.status === 'APPROVED'
                  ? 'ĐÃ DUYỆT (Chưa khóa)'
                  : selectedPeriod.status === 'REVIEW'
                  ? 'CHỜ DUYỆT'
                  : selectedPeriod.status}
              </Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong>Thời gian kỳ:</Text>
              <Text>
                {selectedPeriod.start_date} → {selectedPeriod.end_date}
              </Text>
            </div>
            {selectedPeriod.stats && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>Tổng thực lĩnh dự kiến:</Text>
                <Text strong style={{ color: 'var(--vmax-green)' }}>
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                    selectedPeriod.stats.total_net_salary || 0,
                  )}
                </Text>
              </div>
            )}
            {!isLocked && (
              <div style={{ marginTop: 8, color: 'var(--vmax-red-orange)', fontSize: 13 }}>
                ⚠️ Kỳ lương này chưa khóa. Vui lòng vào phân hệ Bảng lương để thực hiện chốt khóa trước khi hạch toán chi phí.
              </div>
            )}
          </div>
        )}

        <Form.Item name="note" label="Ghi chú hạch toán (Tùy chọn)">
          <Input.TextArea rows={2} placeholder="Nhập ghi chú hoặc diễn giải bút toán chi phí..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
