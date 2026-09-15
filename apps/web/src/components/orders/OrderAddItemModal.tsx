import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Select, InputNumber, App, Avatar, Tag, Row, Col } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getServicesApi, ServiceItem } from '../../api/services';
import { getEmployees, EmployeeItem } from '../../api/employees';
import { addOrderItemApi } from '../../api/orders';

interface OrderAddItemModalProps {
  visible: boolean;
  orderId: string;
  defaultClosingSaleId?: string | number;
  defaultServiceId?: string | number;
  onClose: () => void;
  onSuccess: () => void;
}

export const OrderAddItemModal: React.FC<OrderAddItemModalProps> = ({
  visible,
  orderId,
  defaultClosingSaleId,
  defaultServiceId,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 1. Fetch available active services
  const { data: services = [], isLoading: loadingServices } = useQuery<ServiceItem[]>({
    queryKey: ['active-services'],
    queryFn: getServicesApi,
    enabled: visible,
  });

  // 2. Fetch sales employees
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['sales-employees-list'],
    queryFn: () => getEmployees({ limit: 100 }),
    enabled: visible,
  });

  const salesEmployees = useMemo(() => {
    return (employeesData?.data || []).filter((emp: EmployeeItem) => {
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
  }, [employeesData]);

  // Realtime watch price and discount to calculate net amount
  const originalPrice = Form.useWatch('originalPrice', form) || 0;
  const discountAmount = Form.useWatch('discountAmount', form) || 0;
  const netPrice = Math.max(0, originalPrice - discountAmount);

  // Auto-fill price when selecting service
  const handleServiceChange = (serviceId: number) => {
    const svc = services.find((s) => s.id === serviceId);
    if (svc && svc.defaultPrice > 0) {
      form.setFieldsValue({
        originalPrice: svc.defaultPrice,
        discountAmount: 0,
      });
    }
  };

  useEffect(() => {
    if (visible) {
      if (defaultServiceId) {
        const sid = Number(defaultServiceId);
        form.setFieldsValue({ serviceId: sid });
        const svc = services.find((s) => s.id === sid);
        if (svc && svc.defaultPrice > 0) {
          form.setFieldsValue({ originalPrice: svc.defaultPrice });
        }
      }
      if (defaultClosingSaleId) {
        form.setFieldsValue({ closingSaleId: Number(defaultClosingSaleId) });
      }
    }
  }, [visible, defaultServiceId, defaultClosingSaleId, services, form]);

  const handleFinish = async (values: any) => {
    setLoading(true);
    try {
      await addOrderItemApi(orderId, {
        serviceId: Number(values.serviceId),
        closingSaleId: Number(values.closingSaleId),
        originalPrice: Number(values.originalPrice),
        discountAmount: Number(values.discountAmount || 0),
      });
      message.success('Đã thêm mục dịch vụ vào đơn hàng thành công');
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || 'Thêm mục dịch vụ thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      title="Thêm mục dịch vụ mới vào đơn hàng"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnHidden
      afterClose={() => form.resetFields()}
      width={560}
    >
      <Form
        className="vmax-form"
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          originalPrice: 10000000,
          discountAmount: 0,
        }}
      >
        <Form.Item
          name="serviceId"
          label="Dịch vụ"
          rules={[{ required: true, message: 'Vui lòng chọn dịch vụ' }]}
        >
          <Select
            showSearch
            placeholder="Chọn hoặc tìm kiếm tên dịch vụ..."
            loading={loadingServices}
            optionFilterProp="label"
            onChange={handleServiceChange}
            options={services.map((s) => ({
              value: s.id,
              label: s.name,
              item: s,
            }))}
            optionRender={(option) => {
              const svc = option.data.item as ServiceItem;
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{svc.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Mã: {svc.code} {svc.service_type === 'PROJECT' ? '• Dự án' : '• Định kỳ'}
                    </div>
                  </div>
                  {svc.defaultPrice > 0 && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      {svc.defaultPrice.toLocaleString('vi-VN')} ₫
                    </Tag>
                  )}
                </div>
              );
            }}
          />
        </Form.Item>

        <Form.Item
          name="closingSaleId"
          label="Nhân viên Sale chốt"
          rules={[{ required: true, message: 'Vui lòng chọn nhân viên Sale chốt đơn' }]}
        >
          <Select
            showSearch
            placeholder="Tìm theo tên hoặc mã nhân viên..."
            loading={loadingEmployees}
            optionFilterProp="label"
            options={salesEmployees.map((emp) => ({
              value: Number(emp.id),
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
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      {emp.full_name} <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>({emp.employee_code})</span>
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

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="originalPrice"
              label="Đơn giá gốc (₫)"
              rules={[
                { required: true, message: 'Vui lòng nhập đơn giá gốc' },
                { type: 'number', min: 1, message: 'Đơn giá gốc phải lớn hơn 0' },
              ]}
            >
              <InputNumber<number>
                style={{ width: '100%' }}
                min={1}
                formatter={(val) => (val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
                parser={(val) => (val ? Number(val.replace(/\$\s?|(,*)/g, '')) : 0)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="discountAmount"
              label="Giảm giá (₫)"
              dependencies={['originalPrice']}
              rules={[
                { type: 'number', min: 0, message: 'Giảm giá không được âm' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const orig = getFieldValue('originalPrice') || 0;
                    if (value > orig) {
                      return Promise.reject(new Error('Giảm giá không vượt quá đơn giá gốc'));
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <InputNumber<number>
                style={{ width: '100%' }}
                min={0}
                formatter={(val) => (val ? `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
                parser={(val) => (val ? Number(val.replace(/\$\s?|(,*)/g, '')) : 0)}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Realtime net calculation summary */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#64748b' }}>
            <span>Đơn giá gốc:</span>
            <span>{Number(originalPrice).toLocaleString('vi-VN')} ₫</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#ef4444' }}>
            <span>Giảm giá:</span>
            <span>- {Number(discountAmount).toLocaleString('vi-VN')} ₫</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 6,
              borderTop: '1px dashed #cbd5e1',
              fontSize: 15,
              fontWeight: 700,
              color: '#0C6B37',
            }}
          >
            <span>Giá thực tế thanh toán:</span>
            <span>{Number(netPrice).toLocaleString('vi-VN')} ₫</span>
          </div>
        </div>
      </Form>
    </Modal>
  );
};
