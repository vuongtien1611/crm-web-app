import React, { useState } from 'react';
import { Modal, Form, Select, Input, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { replaceAssigneeApi, ProjectAssignment } from '../../api/projects';
import { getEmployees } from '../../api/employees';

interface ReplaceAssigneeModalProps {
  visible: boolean;
  projectId: string;
  activeAssignments: ProjectAssignment[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ReplaceAssigneeModal: React.FC<ReplaceAssigneeModalProps> = ({
  visible,
  projectId,
  activeAssignments,
  onClose,
  onSuccess,
}) => {
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
      await replaceAssigneeApi(projectId, {
        oldEmployeeId: values.oldEmployeeId,
        newEmployeeId: values.newEmployeeId,
        replacementReason: values.replacementReason,
      });
      message.success('Đã thay thế nhân sự thành công. Lịch sử nhân sự cũ được bảo lưu!');
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
      title="Thay thế nhân sự dự án (Lưu lịch sử)"
      open={visible}
      onOk={handleSubmit}
      confirmLoading={loading}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form className="vmax-form" form={form} layout="vertical">
        <Form.Item
          name="oldEmployeeId"
          label="Nhân sự hiện tại cần thay thế"
          rules={[{ required: true, message: 'Vui lòng chọn nhân sự' }]}
        >
          <Select placeholder="Chọn nhân sự đang hoạt động">
            {activeAssignments.map((a) => (
              <Select.Option key={a.id} value={a.employee_id}>
                {a.employee_name} ({a.assignment_type === 'PRIMARY' ? 'Chính' : 'Hỗ trợ'})
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="newEmployeeId"
          label="Nhân sự mới thay thế"
          rules={[{ required: true, message: 'Vui lòng chọn nhân sự mới' }]}
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
          name="replacementReason"
          label="Lý do thay thế"
          rules={[{ required: true, message: 'Vui lòng nhập lý do thay thế' }]}
        >
          <Input.TextArea rows={2} placeholder="Lý do thay thế nhân sự (Ví dụ: Điều chuyển công việc, nghỉ phép...)" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
