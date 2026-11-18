import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Select, Avatar, Button, Space, Typography, Alert, Tag } from 'antd';
import { UserOutlined, TrophyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { setClosingSaleApi } from '../../api/deals';
import { getEmployees, EmployeeItem } from '../../api/employees';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

interface Props {
  isOpen: boolean;
  dealId: string;
  currentClosingSaleId?: string | null;
  currentClosingSaleName?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealClosingSaleModal: React.FC<Props> = ({
  isOpen,
  dealId,
  currentClosingSaleId,
  currentClosingSaleName,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const canAssign = Boolean(
    user?.roles?.some((r) => ['ADMIN', 'BOSS', 'SUPER_ADMIN', 'SALES_TEAM_LEADER'].includes(r)) ||
    user?.permissions?.includes('DEAL_SET_CLOSING_SALE') ||
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
      if (currentClosingSaleId) {
        form.setFieldsValue({ closingSaleId: String(currentClosingSaleId) });
      } else {
        form.resetFields();
      }
    }
  }, [isOpen, currentClosingSaleId, form]);

  const handleSubmit = async (values: { closingSaleId: string }) => {
    if (!values.closingSaleId) {
      setError('Vui lòng chọn họ và tên nhân viên Sale chốt');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await setClosingSaleApi(dealId, String(values.closingSaleId));
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể thiết lập Sale chốt hợp đồng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <TrophyOutlined style={{ color: '#0C6B37', fontSize: 18 }} />
          <span style={{ fontWeight: 600 }}>Thiết lập Sale chốt hợp đồng</span>
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
          Chỉ định nhân viên Sale được ghi nhận hoa hồng chốt cơ hội này. Bắt buộc trước khi đánh dấu{' '}
          <Tag color="green">THẮNG DEAL</Tag>.
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
          name="closingSaleId"
          label={
            <span style={{ fontWeight: 600 }}>
              Họ và tên nhân viên Sale chốt <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
          }
          rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn họ và tên nhân viên Sale chốt' }]}
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
                  <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#0C6B37' }}>
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
            style={{ backgroundColor: '#0C6B37', borderColor: '#0C6B37' }}
          >
            Lưu Sale chốt
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
