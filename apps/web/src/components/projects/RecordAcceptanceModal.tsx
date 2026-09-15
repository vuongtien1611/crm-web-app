import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, App } from 'antd';
import { recordAcceptanceApi } from '../../api/projects';

interface RecordAcceptanceModalProps {
  visible: boolean;
  projectId: string;
  defaultContactId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordAcceptanceModal: React.FC<RecordAcceptanceModalProps> = ({
  visible,
  projectId,
  defaultContactId,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        customerContactId: defaultContactId ? String(defaultContactId) : undefined,
      });
    }
  }, [visible, defaultContactId, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await recordAcceptanceApi(projectId, {
        customerContactId: String(values.customerContactId).trim(),
        contactId: String(values.customerContactId).trim(),
        acceptedByName: values.acceptedByName?.trim(),
        representativeName: values.acceptedByName?.trim(),
        evidenceDocument: values.evidenceDocument?.trim(),
        acceptanceEvidenceUrl: values.evidenceDocument?.trim(),
      });
      message.success('Đã ghi nhận nghiệm thu dự án! Hoàn thành triển khai dự án và mục đơn hàng.');
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
      title="Ghi nhận nghiệm thu dự án từ khách hàng"
      open={visible}
      onOk={handleSubmit}
      confirmLoading={loading}
      onCancel={onClose}
      destroyOnHidden
      afterClose={() => form.resetFields()}
    >
      <Form className="vmax-form" form={form} layout="vertical">
        <Form.Item
          name="customerContactId"
          label="ID người liên hệ khách hàng"
          rules={[{ required: true, message: 'Vui lòng nhập ID người liên hệ' }]}
        >
          <Input placeholder="Ví dụ: 769" />
        </Form.Item>

        <Form.Item
          name="acceptedByName"
          label="Tên người đại diện nghiệm thu"
          rules={[{ required: true, message: 'Vui lòng nhập tên người đại diện nghiệm thu' }]}
        >
          <Input placeholder="Ví dụ: Nguyễn Văn A (Giám đốc kỹ thuật)" />
        </Form.Item>

        <Form.Item
          name="evidenceDocument"
          label="Tài liệu / Link biên bản nghiệm thu"
          rules={[{ required: true, message: 'Vui lòng nhập URL hoặc mã tài liệu nghiệm thu' }]}
        >
          <Input placeholder="Ví dụ: https://docs.crm.loc/bien-ban-nghiem-thu.pdf" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

