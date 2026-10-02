import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  Radio,
  Switch,
  Alert,
  Avatar,
  Space,
  Typography,
  Button,
  Tag,
  Divider,
  message,
} from 'antd';
import {
  CrownOutlined,
  UserOutlined,
  SwapOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  getEmployeeFormOptions,
  changeEmployeePosition,
  ChangePositionPayload,
} from '../../api/employees';

const { Text, Title } = Typography;

interface Props {
  isOpen: boolean;
  employee: {
    id: string;
    employee_code: string;
    full_name: string;
    position?: { id?: string; code?: string; name?: string } | null;
    currentTeam?: { id?: string; name?: string; department?: string; isLeader?: boolean } | null;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PromoteDemoteModal: React.FC<Props> = ({
  isOpen,
  employee,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lấy danh mục chức vụ & vai trò
  const { data: formOptions, isLoading: loadingOptions } = useQuery({
    queryKey: ['employee-form-options'],
    queryFn: getEmployeeFormOptions,
    enabled: isOpen,
  });

  const currentPosCode = employee?.position?.code || '';
  const hasTeam = Boolean(employee?.currentTeam);
  const isCurrentLeader = Boolean(employee?.currentTeam?.isLeader);

  // Watch positionCode in form
  const selectedPositionCode = Form.useWatch('positionCode', form);
  const selectedActionType = Form.useWatch('actionType', form);

  // Gợi ý actionType mặc định khi chọn chức vụ mới
  useEffect(() => {
    if (!selectedPositionCode || !currentPosCode) return;

    const isNewLeader = selectedPositionCode.endsWith('_TEAM_LEADER');
    const isOldLeader = currentPosCode.endsWith('_TEAM_LEADER');

    if (isNewLeader && !isOldLeader) {
      form.setFieldsValue({ actionType: 'PROMOTION', updateTeamLeaderStatus: true });
    } else if (!isNewLeader && isOldLeader) {
      form.setFieldsValue({ actionType: 'DEMOTION', updateTeamLeaderStatus: false });
    } else if (selectedPositionCode !== currentPosCode) {
      if (!selectedActionType) {
        form.setFieldsValue({ actionType: 'TRANSFER' });
      }
    }
  }, [selectedPositionCode, currentPosCode, form]);

  useEffect(() => {
    if (isOpen && employee) {
      setError(null);
      form.setFieldsValue({
        actionType: 'PROMOTION',
        positionCode: undefined,
        reason: '',
        updateTeamLeaderStatus: false,
      });
    }
  }, [isOpen, employee, form]);

  if (!employee) return null;

  const handleSubmit = async (values: any) => {
    if (!values.positionCode) {
      setError('Vui lòng chọn chức vụ mới');
      return;
    }

    if (values.positionCode === currentPosCode) {
      setError('Chức vụ mới phải khác chức vụ hiện tại của nhân sự');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload: ChangePositionPayload = {
        positionCode: values.positionCode,
        actionType: values.actionType || 'TRANSFER',
        reason: values.reason?.trim() || undefined,
        updateTeamLeaderStatus: hasTeam ? values.updateTeamLeaderStatus : undefined,
      };

      await changeEmployeePosition(employee.id, payload);
      message.success(
        `Đã ${values.actionType === 'PROMOTION' ? 'tăng chức' : values.actionType === 'DEMOTION' ? 'giáng chức' : 'điều chuyển chức vụ'} cho nhân sự ${employee.full_name} thành công!`,
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể thay đổi chức vụ nhân viên');
    } finally {
      setLoading(false);
    }
  };

  const isTargetLeader = (selectedPositionCode || '').endsWith('_TEAM_LEADER');

  return (
    <Modal
      title={
        <Space align="center" size={10}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D97706',
              fontSize: 18,
            }}
          >
            <CrownOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Quyết định Tăng / Giáng chức nhân sự</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>
              Quyền hạn dành cho Giám đốc điều hành (Boss) & Quản trị viên
            </div>
          </div>
        </Space>
      }
      open={isOpen}
      destroyOnClose
      onCancel={onClose}
      footer={null}
      width={600}
      afterClose={() => {
        form.resetFields();
        setError(null);
      }}
    >
      {/* Banner thông tin nhân sự hiện tại */}
      <div
        style={{
          margin: '16px 0 20px',
          padding: '14px 16px',
          backgroundColor: '#F8FAFC',
          borderRadius: 8,
          border: '1px solid #E2E8F0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            size={48}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#1D4ED8', fontWeight: 600 }}
          >
            {employee.full_name?.charAt(0)}
          </Avatar>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
                {employee.full_name}
              </span>
              <Tag color="blue" style={{ margin: 0 }}>
                {employee.employee_code}
              </Tag>
            </div>
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span>
                Chức vụ hiện tại:{' '}
                <Tag color="purple" style={{ fontWeight: 600 }}>
                  {employee.position?.name || employee.position?.code || 'Chưa gán'}
                </Tag>
              </span>
              {employee.currentTeam && (
                <span>
                  Nhóm:{' '}
                  <Tag color="cyan">
                    {employee.currentTeam.name}{' '}
                    {employee.currentTeam.isLeader ? '(Trưởng nhóm 👑)' : ''}
                  </Tag>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setError(null)}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ actionType: 'PROMOTION', updateTeamLeaderStatus: false }}
      >
        {/* Loại quyết định */}
        <Form.Item
          name="actionType"
          label={<span style={{ fontWeight: 600 }}>Loại quyết định</span>}
          rules={[{ required: true }]}
        >
          <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
            <Radio.Button
              value="PROMOTION"
              style={{ width: '33.33%', textAlign: 'center' }}
            >
              <ArrowUpOutlined style={{ color: '#10B981', marginRight: 4 }} /> Tăng chức
            </Radio.Button>
            <Radio.Button
              value="DEMOTION"
              style={{ width: '33.33%', textAlign: 'center' }}
            >
              <ArrowDownOutlined style={{ color: '#EF4444', marginRight: 4 }} /> Giáng chức
            </Radio.Button>
            <Radio.Button
              value="TRANSFER"
              style={{ width: '33.33%', textAlign: 'center' }}
            >
              <SwapOutlined style={{ color: '#3B82F6', marginRight: 4 }} /> Điều chuyển
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        {/* Chức vụ mới */}
        <Form.Item
          name="positionCode"
          label={
            <span style={{ fontWeight: 600 }}>
              Chức vụ mới <span style={{ color: '#EF4444' }}>*</span>
            </span>
          }
          rules={[{ required: true, message: 'Vui lòng chọn chức vụ mới' }]}
        >
          <Select
            placeholder="Chọn chức vụ bổ nhiệm mới..."
            loading={loadingOptions}
            showSearch
            optionFilterProp="label"
            options={(formOptions?.positions || [])
              .filter((p) => p.code !== currentPosCode)
              .map((pos) => ({
                value: pos.code,
                label: `${pos.name} (${pos.code})`,
              }))}
          />
        </Form.Item>

        {/* Cảnh báo nếu chọn BOSS */}
        {selectedPositionCode === 'BOSS' && (
          <Alert
            type="warning"
            showIcon
            message="Ràng buộc Giám đốc điều hành (Single Active BOSS)"
            description="Hệ thống chỉ cho phép duy nhất một BOSS hoạt động tại một thời điểm. Nếu bổ nhiệm nhân sự này làm BOSS, tài khoản BOSS hiện tại phải được miễn nhiệm trước."
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Tùy chọn quyền Trưởng nhóm (Team Leader) */}
        {hasTeam && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#1E3A8A', fontSize: 13 }}>
                  {isTargetLeader
                    ? 'Chỉ định làm Trưởng nhóm trong nhóm hiện tại'
                    : 'Bổ nhiệm / duy trì quyền Trưởng nhóm'}
                </div>
                <div style={{ fontSize: 12, color: '#3B82F6' }}>
                  Áp dụng cho nhóm: <strong>{employee.currentTeam?.name}</strong>
                </div>
              </div>
              <Form.Item name="updateTeamLeaderStatus" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>
          </div>
        )}

        {/* Lý do / Quyết định bổ nhiệm */}
        <Form.Item
          name="reason"
          label={<span style={{ fontWeight: 600 }}>Lý do / Căn cứ quyết định</span>}
        >
          <Input.TextArea
            rows={3}
            placeholder="Ví dụ: Đạt KPI xuất sắc quý 3/2026, Theo quyết định bổ nhiệm số 15/QĐ-BGD..."
          />
        </Form.Item>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            icon={<CrownOutlined />}
            style={{
              backgroundColor: '#0C6B37',
              borderColor: '#0C6B37',
            }}
          >
            Xác nhận quyết định
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
