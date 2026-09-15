import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, App } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { createTaskApi, ProjectAssignment } from '../../api/projects';
import { getEmployees } from '../../api/employees';
import { DynamicOptionSelect } from '../common/DynamicOptionSelect';

interface CreateTaskModalProps {
  visible: boolean;
  projectId: string;
  activeAssignments?: ProjectAssignment[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  visible,
  projectId,
  activeAssignments = [],
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['assignable-employees'],
    queryFn: () => getEmployees({ limit: 100 }),
    enabled: visible && activeAssignments.length === 0,
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await createTaskApi(projectId, {
        title: values.title,
        weight: values.weight,
        assignedToEmployeeId: values.assignedToEmployeeId,
      });
      message.success('Tạo công việc thành công');
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
      title="Tạo công việc dự án (Tính toán tiến độ)"
      open={visible}
      onOk={handleSubmit}
      confirmLoading={loading}
      onCancel={onClose}
      destroyOnHidden
      afterClose={() => form.resetFields()}
    >
      <Form className="vmax-form" form={form} layout="vertical">
        <Form.Item
          name="title"
          label="Tiêu đề công việc"
          rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn tiêu đề công việc' }]}
        >
          <DynamicOptionSelect
            fieldKey="project_task_title"
            placeholder="Nhập hoặc chọn tiêu đề công việc..."
            defaultOptions={[
              'Khảo sát & Phân tích yêu cầu',
              'Thiết kế giao diện UI/UX',
              'Xây dựng Database & API Backend',
              'Phát triển giao diện Frontend',
              'Tích hợp Cổng thanh toán & Dịch vụ ngoài',
              'Kiểm thử UAT & Tối ưu hiệu năng',
              'Cấu hình Server, CI/CD & Triển khai',
              'Bàn giao hệ thống & Hướng dẫn sử dụng',
            ]}
          />
        </Form.Item>

        <Form.Item
          name="weight"
          label="Tỷ trọng công việc (dùng tính % tiến độ dự án)"
          initialValue={10}
          rules={[{ required: true }]}
        >
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="assignedToEmployeeId" label="Người thực hiện (Không bắt buộc)">
          <Select
            allowClear
            showSearch
            placeholder="Chọn nhân sự thực hiện..."
            optionFilterProp="children"
            loading={loadingEmployees}
            filterOption={(input, option) =>
              String(option?.children || '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {activeAssignments.length > 0
              ? activeAssignments.map((a) => (
                  <Select.Option key={a.id} value={a.employee_id}>
                    {a.employee_name} ({a.assignment_type === 'PRIMARY' ? 'Chính' : 'Hỗ trợ'})
                  </Select.Option>
                ))
              : (employeesData?.data || []).map((emp) => (
                  <Select.Option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_code} - {emp.position?.name || 'Nhân viên'})
                  </Select.Option>
                ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};
