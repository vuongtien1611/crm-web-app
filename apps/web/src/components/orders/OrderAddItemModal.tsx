import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  InputNumber,
  DatePicker,
  App,
  Avatar,
  Tag,
  Row,
  Col,
  Space,
  Divider,
  Button,
} from 'antd';
import { UserOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getServicesApi, createServiceApi, ServiceItem } from '../../api/services';
import { addOrderItemApi, fetchSalesRepsApi } from '../../api/orders';
import { useAuthStore } from '../../store/authStore';

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
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [searchServiceText, setSearchServiceText] = useState('');
  const [newServiceNameInput, setNewServiceNameInput] = useState('');
  const [creatingService, setCreatingService] = useState(false);
  const quickInputRef = useRef<any>(null);

  // 1. Fetch available active services
  const { data: services = [], isLoading: loadingServices } = useQuery<ServiceItem[]>({
    queryKey: ['active-services'],
    queryFn: getServicesApi,
    enabled: visible,
  });

  // 2. Fetch sales employees (using safe sales-reps endpoint)
  const { data: salesEmployees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['sales-reps-list'],
    queryFn: fetchSalesRepsApi,
    enabled: visible,
  });

  // Build service options with support for typing new service
  const serviceOptions = useMemo(() => {
    const list: any[] = services.map((s) => ({
      value: String(s.id),
      label: s.name,
      item: s,
      isNew: false,
    }));

    const trimmed = searchServiceText.trim();
    if (trimmed) {
      const alreadyExists = services.some(
        (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (!alreadyExists) {
        list.unshift({
          value: `__NEW__:${trimmed}`,
          label: `✨ Thêm mới dịch vụ: "${trimmed}"`,
          item: {
            id: -1,
            code: 'TỰ ĐỘNG LƯU',
            name: trimmed,
            service_type: 'PROJECT',
            defaultPrice: 10000000,
            is_active: true,
          } as ServiceItem,
          isNew: true,
        });
      }
    }

    return list;
  }, [services, searchServiceText]);

  // Realtime watch price and discount to calculate net amount
  const originalPrice = Form.useWatch('originalPrice', form) || 0;
  const discountAmount = Form.useWatch('discountAmount', form) || 0;
  const netPrice = Math.max(0, originalPrice - discountAmount);

  // Auto-fill price when selecting service
  const handleServiceChange = (val: string) => {
    if (val.startsWith('__NEW__:')) {
      const name = val.replace('__NEW__:', '').trim();
      message.info(`Đã chọn tạo dịch vụ mới: "${name}". Hệ thống sẽ lưu dịch vụ khi bạn xác nhận.`);
      return;
    }
    const sid = Number(val);
    const svc = services.find((s) => s.id === sid);
    if (svc && svc.defaultPrice > 0) {
      form.setFieldsValue({
        originalPrice: svc.defaultPrice,
        discountAmount: 0,
      });
    }
  };

  // Quick create service from dropdown footer
  const handleQuickCreateService = async (serviceName: string) => {
    const trimmed = serviceName.trim();
    if (!trimmed) {
      message.warning('Vui lòng nhập tên dịch vụ mới');
      return;
    }
    setCreatingService(true);
    try {
      const created = await createServiceApi({
        name: trimmed,
        serviceType: 'PROJECT',
        defaultPrice: Number(form.getFieldValue('originalPrice')) || 10000000,
      });
      message.success(`Đã thêm dịch vụ mới [${created.name}] vào hệ thống`);
      queryClient.invalidateQueries({ queryKey: ['active-services'] });
      form.setFieldsValue({
        serviceId: String(created.id),
        originalPrice: created.defaultPrice,
      });
      setNewServiceNameInput('');
      setSearchServiceText('');
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo dịch vụ mới');
    } finally {
      setCreatingService(false);
    }
  };

  useEffect(() => {
    if (visible) {
      if (defaultServiceId) {
        const sid = String(defaultServiceId);
        form.setFieldsValue({ serviceId: sid });
        const svc = services.find((s) => String(s.id) === sid);
        if (svc && svc.defaultPrice > 0) {
          form.setFieldsValue({ originalPrice: svc.defaultPrice });
        }
      }
      if (defaultClosingSaleId) {
        form.setFieldsValue({ closingSaleId: Number(defaultClosingSaleId) });
      } else if (user?.employeeId && !form.getFieldValue('closingSaleId')) {
        form.setFieldsValue({ closingSaleId: Number(user.employeeId) });
      }
    }
  }, [visible, defaultServiceId, defaultClosingSaleId, services, user, form]);

  const handleFinish = async (values: any) => {
    if (values.startDate && values.endDate) {
      if (values.endDate.isBefore(values.startDate, 'day')) {
        message.error('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu');
        return;
      }
    }

    setLoading(true);
    try {
      let resolvedServiceId = values.serviceId;

      // If user selected a new service not in options, create it now
      if (typeof resolvedServiceId === 'string' && resolvedServiceId.startsWith('__NEW__:')) {
        const customName = resolvedServiceId.replace('__NEW__:', '').trim();
        const created = await createServiceApi({
          name: customName,
          serviceType: 'PROJECT',
          defaultPrice: Number(values.originalPrice) || 10000000,
        });
        resolvedServiceId = created.id;
        queryClient.invalidateQueries({ queryKey: ['active-services'] });
      }

      await addOrderItemApi(orderId, {
        serviceId: resolvedServiceId,
        closingSaleId: Number(values.closingSaleId),
        originalPrice: Number(values.originalPrice),
        discountAmount: Number(values.discountAmount || 0),
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : null,
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
      afterClose={() => {
        form.resetFields();
        setSearchServiceText('');
        setNewServiceNameInput('');
      }}
      width={580}
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
          label={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span>Dịch vụ <span style={{ color: '#ef4444' }}>*</span></span>
              <span style={{ fontSize: 12, fontWeight: 400, color: '#0C6B37' }}>
                (Có thể gõ tên dịch vụ mới chưa có trong danh sách)
              </span>
            </div>
          }
          rules={[{ required: true, message: 'Vui lòng chọn hoặc nhập tên dịch vụ' }]}
        >
          <Select
            showSearch
            placeholder="Chọn hoặc gõ tìm kiếm / thêm tên dịch vụ..."
            loading={loadingServices}
            searchValue={searchServiceText}
            onSearch={(val) => setSearchServiceText(val)}
            onChange={handleServiceChange}
            options={serviceOptions}
            filterOption={(input, option: any) => {
              if (option?.isNew) return true;
              return (option?.label || '').toLowerCase().includes(input.toLowerCase());
            }}
            optionRender={(option) => {
              if (option.data.isNew) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag color="green">MỚI</Tag>
                      <span style={{ fontWeight: 600, color: '#0C6B37' }}>{option.data.label}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#059669' }}>Lưu làm dịch vụ mới</span>
                  </div>
                );
              }
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
            dropdownRender={(menu) => (
              <>
                {menu}
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ padding: '4px 8px 8px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    Thêm nhanh dịch vụ mới vào danh mục:
                  </div>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      ref={quickInputRef}
                      placeholder="Nhập tên dịch vụ mới cần thêm..."
                      value={newServiceNameInput}
                      onChange={(e) => setNewServiceNameInput(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      onPressEnter={(e) => {
                        e.preventDefault();
                        handleQuickCreateService(newServiceNameInput);
                      }}
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      loading={creatingService}
                      onClick={() => handleQuickCreateService(newServiceNameInput)}
                    >
                      Lưu & Chọn
                    </Button>
                  </Space.Compact>
                </div>
              </>
            )}
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
            options={salesEmployees.map((emp: any) => ({
              value: Number(emp.id),
              label: `${emp.full_name} (${emp.employee_code})`,
              item: emp,
            }))}
            optionRender={(option) => {
              const emp = option.data.item;
              const posName = emp.position_name || 'Nhân viên Kinh doanh';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                  <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#0C6B37' }}>
                    {emp.full_name?.charAt(0)}
                  </Avatar>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      {emp.full_name} <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>({emp.employee_code})</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {posName}
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
              label="Đơn giá gốc (đ)"
              rules={[
                { required: true, message: 'Vui lòng nhập đơn giá gốc' },
                {
                  validator(_, val) {
                    if (val === undefined || val === null || val <= 0) {
                      return Promise.reject(new Error('Đơn giá phải lớn hơn 0'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1000}
                step={500000}
                formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(val) => (val ? Number(val.replace(/\./g, '')) : 0) as any}
                placeholder="10.000.000"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="discountAmount"
              label="Giảm giá (đ)"
              dependencies={['originalPrice']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, val) {
                    const orig = getFieldValue('originalPrice') || 0;
                    if (val !== undefined && val !== null && val < 0) {
                      return Promise.reject(new Error('Giảm giá không được âm'));
                    }
                    if (val && val > orig) {
                      return Promise.reject(new Error('Giảm giá không vượt quá giá gốc'));
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={100000}
                formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={(val) => (val ? Number(val.replace(/\./g, '')) : 0) as any}
                placeholder="0"
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Pricing Summary Box */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
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

        {/* Start date & End date */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="startDate"
              label="Ngày bắt đầu"
              tooltip="Ngày bắt đầu triển khai hoặc áp dụng dịch vụ"
            >
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                placeholder="Chọn ngày bắt đầu"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="endDate"
              label="Ngày kết thúc"
              tooltip="Ngày hoàn thành dự kiến hoặc kết thúc hợp đồng"
              dependencies={['startDate']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('startDate');
                    if (start && value && value.isBefore(start, 'day')) {
                      return Promise.reject(new Error('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu'));
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                placeholder="Chọn ngày kết thúc"
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};
