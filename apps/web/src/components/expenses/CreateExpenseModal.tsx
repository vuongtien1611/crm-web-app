import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, DatePicker, App, Button } from 'antd';
import dayjs from 'dayjs';
import { createManualExpense, ExpenseCategory } from '../../api/expenses';

interface CreateExpenseModalProps {
  open: boolean;
  categories: ExpenseCategory[];
  onCancel: () => void;
  onSuccess: () => void;
}

export const CreateExpenseModal: React.FC<CreateExpenseModalProps> = ({
  open,
  categories,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const manualCategories = categories.filter(
    (c) => c.code !== 'SALARY_PAYROLL' && c.code !== 'PAYROLL',
  );

  const handleFinish = async (values: any) => {
    setLoading(true);
    try {
      await createManualExpense({
        category_id: values.category_id,
        amount: Number(values.amount),
        expense_date: values.expense_date ? values.expense_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        source_type: values.source_type,
        note: values.note,
      });
      message.success('Tạo khoản chi phí thành công');
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo khoản chi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Tạo khoản chi phí mới"
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
          form="create-expense-form"
          loading={loading}
          style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
        >
          Lưu khoản chi
        </Button>,
      ]}
    >
      <Form
        id="create-expense-form"
        className="vmax-form"
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          category_id: manualCategories.length > 0 ? manualCategories[0].id : undefined,
          expense_date: dayjs(),
          source_type: 'DIRECT_PURCHASE',
        }}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="category_id"
          label="Danh mục chi phí"
          rules={[{ required: true, message: 'Vui lòng chọn danh mục chi phí' }]}
        >
          <Select
            placeholder="Chọn danh mục"
            options={categories
              .filter((c) => c.code !== 'SALARY_PAYROLL' && c.code !== 'PAYROLL')
              .map((c) => ({
                label: `${c.name} (${c.code})`,
                value: c.id,
              }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          name="source_type"
          label="Nguồn phát sinh"
          rules={[{ required: true, message: 'Vui lòng chọn nguồn phát sinh' }]}
        >
          <Select
            options={[
              { label: 'Mua sắm trực tiếp (Direct Purchase)', value: 'DIRECT_PURCHASE' },
              { label: 'Chi phí quảng cáo (Ads)', value: 'ADS' },
              { label: 'Hạ tầng máy chủ & Công nghệ (Infrastructure)', value: 'INFRASTRUCTURE' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="amount"
          label="Số tiền chi (VNĐ)"
          rules={[
            { required: true, message: 'Vui lòng nhập số tiền' },
            {
              type: 'number',
              min: 1,
              message: 'Số tiền chi phải lớn hơn 0',
            },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Ví dụ: 5.000.000"
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number(value?.replace(/\$\s?|(,*)/g, '') || 0)}
          />
        </Form.Item>

        <Form.Item
          name="expense_date"
          label="Ngày chi"
          rules={[{ required: true, message: 'Vui lòng chọn ngày chi' }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="note" label="Mô tả / Diễn giải nội dung chi">
          <Input.TextArea
            rows={3}
            placeholder="Nhập chi tiết mục đích chi phí, số hóa đơn, thông tin nhà cung cấp..."
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
