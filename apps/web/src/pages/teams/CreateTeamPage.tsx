import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Row,
  Col,
  Typography,
  Space,
  Alert,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { createTeam, TeamDepartment } from '../../api/teams';

const { Title, Text, Paragraph } = Typography;

export const CreateTeamPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [form] = Form.useForm();

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Permissions check
  const permissions = user?.permissions || [];
  const roles = user?.roles || [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') || roles.includes('BOSS');
  const canCreate = isAdmin || permissions.includes('TEAM_CREATE');

  const onFinish = async (values: any) => {
    try {
      setSubmitting(true);
      setErrorMessage(null);

      const payload = {
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        department: values.department as TeamDepartment,
        description: values.description ? values.description.trim() : undefined,
      };

      const result = await createTeam(payload);
      message.success(`Tạo nhóm làm việc "${result.name || payload.name}" thành công!`);
      navigate(`/teams/${result.id || ''}`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Đã có lỗi xảy ra khi tạo nhóm làm việc');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCreate) {
    return (
      <Card variant="borderless" className="vmax-card" style={{ maxWidth: 800, margin: '24px auto' }}>
        <Alert
          type="error"
          message="Từ chối truy cập"
          description="Bạn không có quyền TEAM_CREATE để thực hiện tạo nhóm làm việc mới."
          showIcon
        />
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button onClick={() => navigate('/teams')}>Quay lại danh sách nhóm</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="vmax-fade-in" style={{ maxWidth: 900, margin: '0 auto', padding: '0 8px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/teams')}
          style={{ marginBottom: 8, paddingLeft: 0 }}
        >
          Quay lại danh sách nhóm
        </Button>
        <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
          Tạo nhóm làm việc mới
        </Title>
        <Text type="secondary">
          Thiết lập nhóm làm việc và trực thuộc phòng ban cụ thể (SALES, DEV, SEO, OPERATION)
        </Text>
      </div>

      {errorMessage && (
        <Alert
          type="error"
          message="Lỗi tạo nhóm"
          description={errorMessage}
          showIcon
          closable
          onClose={() => setErrorMessage(null)}
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        className="vmax-form"
        requiredMark="optional"
      >
        <Card
          variant="borderless"
          className="vmax-card"
          title={
            <Space>
              <TeamOutlined style={{ color: '#1677ff' }} />
              <span>Thông tin nhóm làm việc</span>
            </Space>
          }
          style={{ borderRadius: 12, marginBottom: 24 }}
        >
          <Paragraph type="secondary" style={{ marginBottom: 20 }}>
            Lưu ý: Phòng ban trực thuộc phải được lựa chọn rõ ràng. Hệ thống không cho phép để trống
            hoặc mặc định.
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="name"
                label="Tên nhóm làm việc"
                rules={[
                  { required: true, message: 'Vui lòng nhập tên nhóm làm việc' },
                  { min: 3, message: 'Tên nhóm tối thiểu 3 ký tự' },
                  { max: 100, message: 'Tên nhóm tối đa 100 ký tự' },
                ]}
              >
                <Input placeholder="Ví dụ: Đội Kinh Doanh Miền Bắc 01" size="large" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="code"
                label="Mã nhóm làm việc"
                rules={[
                  { required: true, message: 'Vui lòng nhập mã nhóm' },
                  { min: 2, message: 'Mã nhóm tối thiểu 2 ký tự' },
                  { max: 50, message: 'Mã nhóm tối đa 50 ký tự' },
                  {
                    pattern: /^[A-Za-z0-9_-]+$/,
                    message: 'Mã nhóm chỉ chứa chữ cái, số, dấu gạch nối (- hoặc _)',
                  },
                ]}
              >
                <Input
                  placeholder="Ví dụ: SALES_HN_01"
                  size="large"
                  style={{ textTransform: 'uppercase' }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="department"
                label="Phòng ban trực thuộc"
                rules={[{ required: true, message: 'Vui lòng chọn phòng ban trực thuộc' }]}
              >
                <Select placeholder="-- Chọn phòng ban --" size="large">
                  <Select.Option value="SALES">Phòng Kinh doanh (SALES)</Select.Option>
                  <Select.Option value="DEV">Phòng Kỹ thuật / Công nghệ (DEV)</Select.Option>
                  <Select.Option value="SEO">Phòng SEO & Tăng trưởng (SEO)</Select.Option>
                  <Select.Option value="OPERATION">Phòng Vận hành (OPERATION)</Select.Option>
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item name="description" label="Mô tả nhóm">
                <Input.TextArea
                  placeholder="Mô tả phạm vi hoạt động, mục tiêu hoặc ghi chú..."
                  rows={2}
                />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button size="large" onClick={() => navigate('/teams')} disabled={submitting}>
                Hủy bỏ
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                icon={<SaveOutlined />}
                loading={submitting}
                style={{ borderRadius: 8 }}
              >
                Tạo nhóm
              </Button>
            </Space>
          </div>
        </Card>
      </Form>
    </div>
  );
};
