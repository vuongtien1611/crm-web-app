import React, { useState } from 'react';
import { App, Form, Modal, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { assignProjectApi } from '../../api/projects';
import { getEmployees } from '../../api/employees';

interface AssignProjectModalProps {
  visible: boolean;
  orderItemId: string;
  serviceName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignProjectModal: React.FC<AssignProjectModalProps> = ({
  visible,
  orderItemId,
  serviceName,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['assignable-employees'],
    queryFn: () => getEmployees({ limit: 100 }),
    enabled: visible,
  });

  const handleSubmit = async () => {
    let values: { employeeId: string };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setLoading(true);
    try {
      await assignProjectApi(orderItemId, {
        employeeId: values.employeeId,
        assignmentType: 'PRIMARY',
      });
      message.success('Đã tạo dự án và phân công nhân sự');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo dự án');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`Tạo dự án từ dịch vụ: ${serviceName}`}
      open={visible}
      onOk={handleSubmit}
      confirmLoading={loading}
      onCancel={onClose}
      destroyOnHidden
      afterClose={() => form.resetFields()}
    >
      <Form className="vmax-form" form={form} layout="vertical">
        <Form.Item
          name="employeeId"
          label="Nhân sự chính phụ trách dự án"
          rules={[{ required: true, message: 'Vui lòng chọn nhân viên phụ trách' }]}
        >
          <Select
            showSearch
            loading={loadingEmployees}
            placeholder="Tìm theo tên hoặc mã nhân viên..."
            optionFilterProp="children"
            filterOption={(input, option) =>
              String(option?.children || '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {(employeesData?.data || []).map((employee) => (
              <Select.Option key={employee.id} value={employee.id}>
                {employee.full_name} ({employee.employee_code} - {employee.position?.name || 'Nhân viên'})
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};
