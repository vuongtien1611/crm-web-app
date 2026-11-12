import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Select, Avatar, Button, Space, Typography, Alert } from 'antd';
import { UserOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { assignDealApi } from '../../api/deals';
import { getEmployees, EmployeeItem } from '../../api/employees';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

interface Props {
  isOpen: boolean;
  dealId: string;
  currentSaleId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealAssignModal: React.FC<Props> = ({
  isOpen,
  dealId,
  currentSaleId,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const canAssign = Boolean(
    user?.roles?.some((r) => ['ADMIN', 'BOSS', 'SUPER_ADMIN', 'SALES_TEAM_LEADER'].includes(r)) ||
    user?.permissions?.includes('DEAL_ASSIGN') ||
    user?.permissions?.includes('LEAD_ASSIGN')
  );

  const [form] = Form.useForm();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !canAssign) return null;

  // Fetch sales employees
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['sales-employees-list'],
    queryFn: () => getEmployees({ limit: 100 }),
    enabled: isOpen,
  });

  const salesEmployees = useMemo(() => {
    const all = employeesData?.data || [];
    const salesOnly = all.filter((emp: EmployeeItem) => {
      const posCode = emp.position?.code;
      const hasSaleRole = (emp.roles || []).some(
        (r) => r.code === 'SALE' || r.code === 'SALES_TEAM_LEADER' || r.code === 'BOSS' || r.code === 'ADMIN',
      );
      return (
        posCode === 'SALE' ||
        posCode === 'SALES_TEAM_LEADER' ||
        posCode === 'BOSS' ||
        posCode === 'ADMIN' ||
        hasSaleRole
      );
    });
    return salesOnly.length > 0 ? salesOnly : all;
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

  const handleSubmit = async (values: { toSaleId: string }) => {
    if (!values.toSaleId) {
      setError('Vui lòng chọn họ và tên nhân viên Sale phụ trách');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await assignDealApi(dealId, String(values.toSaleId));
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể phân công phụ trách cơ hội');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <UserSwitchOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600 }}>Phân công phụ trách Cơ hội</span>
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
          Chỉ định nhân viên Sale chịu trách nhiệm theo dõi và chăm sóc cơ hội bán hàng này.
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
            placeholder="Nhập họ và tên hoặc mã nhân viên sale..."
            loading={loadingEmployees}
            allowClear
            optionFilterProp="label"
            filterOption={(input, option) => {
              const label = (option?.label ?? '') as string;
              return label.toLowerCase().includes(input.toLowerCase());
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <Button onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
          >
            Phân công Deal
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
