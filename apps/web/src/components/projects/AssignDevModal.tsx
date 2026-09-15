import React, { useState } from 'react';
import { Modal, Form, Select, App } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { addAssignmentApi } from '../../api/projects';
import { getEmployees } from '../../api/employees';

interface AssignDevModalProps {
  visible: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignDevModal: React.FC<AssignDevModalProps> = ({
  visible,
  projectId,
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
    try {
      const values = await form.validateFields();
      setLoading(true);
      await addAssignmentApi(projectId, {
        employeeId: values.employeeId,
        assignmentType: values.assignmentType,
      });
      message.success('Đã thêm phân công dự án thành công');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.message) {
        message.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Thêm phân công dự án (Chính / Hỗ trợ)"
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
          label="Chọn nhân sự phân công"
          rules={[{ required: true, message: 'Vui lòng chọn nhân viên' }]}
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
            {(employeesData?.data || []).map((emp) => (
              <Select.Option key={emp.id} value={emp.id}>
                {emp.full_name} ({emp.employee_code} - {emp.position?.name || 'Nhân viên'})
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="assignmentType"
          label="Vai trò phân công"
          initialValue="PRIMARY"
          rules={[{ required: true }]}
        >
          <Select>
            <Select.Option value="PRIMARY">Chính (Tối đa 2 nhân sự chính đang hoạt động)</Select.Option>
            <Select.Option value="SUPPORT">Hỗ trợ (Không hưởng hoa hồng/KPI)</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};
