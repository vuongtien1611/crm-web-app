import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Select, Input, Avatar, Button, Space, Typography, Alert, App } from 'antd';
import { UserOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { assignLeadApi } from '../../api/leads';
import { getEmployees, EmployeeItem } from '../../api/employees';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

interface Props {
  isOpen: boolean;
  leadId: string;
  currentSaleId?: string | number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadAssignModal: React.FC<Props> = ({
  isOpen,
  leadId,
  currentSaleId,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const canAssign = Boolean(
    user?.roles?.some((r) => ['ADMIN', 'BOSS', 'SUPER_ADMIN', 'SALES_TEAM_LEADER'].includes(r)) ||
    user?.permissions?.includes('LEAD_ASSIGN')
  );

  const [form] = Form.useForm();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !canAssign) return null;

  // Fetch danh sách nhân viên
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['sales-employees-list'],
    queryFn: () => getEmployees({ limit: 100 }),
    enabled: isOpen,
  });

  const salesEmployees = useMemo(() => {
    const all = employeesData?.data || [];
    // Lọc các nhân viên đang hoạt động hoặc thử việc
    const activeEmps = all.filter(
      (emp: EmployeeItem) => emp.status !== 'RESIGNED' && emp.status !== 'TERMINATED',
    );
    // Ưu tiên nhân viên thuộc bộ phận Sale / Trưởng nhóm Sale / Quản lý
    const salesOnly = activeEmps.filter((emp: EmployeeItem) => {
      const posCode = emp.position?.code;
      const hasSaleRole = (emp.roles || []).some(
        (r) =>
          r.code === 'SALE' ||
          r.code === 'SALES_TEAM_LEADER' ||
          r.code === 'BOSS' ||
          r.code === 'ADMIN',
      );
      return (
        posCode === 'SALE' ||
        posCode === 'SALES_TEAM_LEADER' ||
        posCode === 'BOSS' ||
        posCode === 'ADMIN' ||
        hasSaleRole
      );
    });
    return salesOnly.length > 0 ? salesOnly : (activeEmps.length > 0 ? activeEmps : all);
  }, [employeesData]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      if (currentSaleId) {
        form.setFieldsValue({ toSaleId: String(currentSaleId) });
      } else {
        form.resetFields();
      }
    }
  }, [isOpen, currentSaleId, form]);

  const handleSubmit = async (values: { toSaleId: string; reason?: string }) => {
    if (!values.toSaleId) {
      setError('Vui lòng chọn họ và tên nhân viên Sale phụ trách');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await assignLeadApi(leadId, String(values.toSaleId), values.reason?.trim() || undefined);
      message.success('Đã phân công Lead cho nhân viên Sale thành công');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể phân công Lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <UserSwitchOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600 }}>Phân công Lead cho Sale</span>
        </Space>
      }
      open={isOpen}
      destroyOnHidden
      onCancel={onClose}
      footer={null}
      afterClose={() => {
        form.resetFields();
        setError('');
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Chỉ định nhân viên Sale chịu trách nhiệm tiếp cận, liên hệ và chăm sóc khách hàng tiềm năng này.
        </Text>
      </div>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setError('')}
        />
      )}

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="toSaleId"
          label={
            <span style={{ fontWeight: 600 }}>
              Họ và tên nhân viên Sale phụ trách <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
          }
          rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn họ và tên nhân viên Sale' }]}
        >
          <Select
            showSearch
            placeholder="Nhập họ và tên hoặc mã nhân viên Sale..."
            loading={loadingEmployees}
            allowClear
            optionFilterProp="label"
            filterOption={(input, option) => {
              const emp = (option?.item || {}) as EmployeeItem;
              const q = input.toLowerCase();
              const name = (emp.full_name || '').toLowerCase();
              const code = (emp.employee_code || '').toLowerCase();
              const phone = (emp.phone || '').toLowerCase();
              return name.includes(q) || code.includes(q) || phone.includes(q);
            }}
            options={salesEmployees.map((emp) => ({
              value: String(emp.id),
              label: `${emp.full_name} (${emp.employee_code})`,
              item: emp,
            }))}
            optionRender={(option) => {
              const emp = option.data.item as EmployeeItem;
              const teamName = emp.currentTeam?.name;
              const posName = emp.position?.name || 'Nhân viên Kinh doanh';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                  <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }}>
                    {emp.full_name?.charAt(0)}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      {emp.full_name}{' '}
                      <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>
                        ({emp.employee_code})
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {posName} {teamName ? `• ${teamName}` : ''}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </Form.Item>

        <Form.Item
          name="reason"
          label={<span style={{ fontWeight: 600 }}>Ghi chú / Lý do phân công</span>}
        >
          <Input.TextArea
            rows={3}
            placeholder="Ví dụ: Khách hàng yêu cầu tư vấn gói giải pháp CRM, phân bổ theo địa bàn..."
          />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <Button onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
          >
            Phân công Lead
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

