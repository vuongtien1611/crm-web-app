import React, { useState, useEffect } from 'react';
import {
  Modal,
  Select,
  Input,
  Alert,
  Tag,
  Avatar,
  Typography,
  Spin,
  App,
} from 'antd';
import {
  SwapOutlined,
  CrownOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import {
  fetchOrganizationChart,
  fetchEmployeeWorkload,
  moveOrgChartMember,
  OrgTeamData,
  EmployeeWorkloadResponse,
} from '../../api/organizationChart';

const { Text } = Typography;

interface TransferDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  currentDepartment?: string | null;
  currentTeamName?: string | null;
  currentTeamId?: string | null;
  isLeader?: boolean;
}

export const TransferDepartmentModal: React.FC<TransferDepartmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  employeeId,
  employeeName,
  employeeCode,
  currentDepartment,
  currentTeamName,
  currentTeamId,
  isLeader,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [teams, setTeams] = useState<OrgTeamData[]>([]);
  const [targetTeamId, setTargetTeamId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [workload, setWorkload] = useState<EmployeeWorkloadResponse | null>(null);

  useEffect(() => {
    if (isOpen && employeeId) {
      setTargetTeamId(null);
      setReason('');
      setWorkload(null);
      loadModalData();
    }
  }, [isOpen, employeeId]);

  const loadModalData = async () => {
    setLoading(true);
    try {
      const [chartRes, workloadRes] = await Promise.all([
        fetchOrganizationChart().catch(() => null),
        fetchEmployeeWorkload(employeeId).catch(() => null),
      ]);

      if (chartRes?.teams) {
        setTeams(chartRes.teams);
      }
      if (workloadRes) {
        setWorkload(workloadRes);
      }
    } catch (err: any) {
      console.error('Failed to load transfer modal data', err);
    } finally {
      setLoading(false);
    }
  };

  // Eligible target teams: exclude current team
  const eligibleTeams = teams.filter((t) => String(t.id) !== String(currentTeamId));

  const selectedTargetTeam = teams.find((t) => String(t.id) === String(targetTeamId));
  const isCrossDept =
    selectedTargetTeam &&
    currentDepartment &&
    selectedTargetTeam.department.toUpperCase() !== currentDepartment.toUpperCase();

  const getNewRoleLabel = (dept: string) => {
    const d = dept.toUpperCase();
    if (d === 'SALES') return 'Chuyên Viên Kinh Doanh (SALE)';
    if (d === 'DEV') return 'Lập Trình Viên (DEV)';
    if (d === 'SEO') return 'Chuyên Viên SEO (SEO)';
    return dept;
  };

  const handleConfirmMove = async () => {
    if (!targetTeamId) {
      message.warning('Vui lòng chọn Team / Phòng ban đích tiếp nhận');
      return;
    }

    setSubmitting(true);
    try {
      const res = await moveOrgChartMember({
        employeeId,
        targetTeamId,
        reason: reason.trim() || undefined,
      });

      message.success(res.message || 'Chuyển bộ phận / nhóm cho nhân sự thành công!');
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || 'Không thể chuyển bộ phận cho nhân viên');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SwapOutlined style={{ color: '#0C6B37', fontSize: 18 }} />
          <span>Chuyển Bộ Phận / Team Nhân Sự</span>
        </div>
      }
      open={isOpen}
      destroyOnHidden
      onCancel={onClose}
      onOk={handleConfirmMove}
      confirmLoading={submitting}
      okText="Xác nhận chuyển"
      cancelText="Hủy"
      okButtonProps={{
        style: { backgroundColor: '#0C6B37', fontWeight: 600 },
        disabled: !targetTeamId,
      }}
      width={560}
    >
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#66736B', fontSize: 13 }}>
            Đang tải dữ liệu phòng ban và khối lượng công việc...
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          {/* Employee Current Profile Card */}
          <div
            style={{
              background: '#F7FAF8',
              borderRadius: 10,
              padding: 12,
              border: '1px solid #DDE7E1',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Avatar size={42} style={{ backgroundColor: '#0C6B37', fontWeight: 700 }}>
              {employeeName.charAt(0).toUpperCase()}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#18211C' }}>
                {employeeName}
              </div>
              <div style={{ fontSize: 12, color: '#66736B', marginTop: 2 }}>
                Mã: <Tag color="blue">{employeeCode}</Tag>
                {currentDepartment && (
                  <Tag color="purple">Phòng: {currentDepartment}</Tag>
                )}
                {currentTeamName ? (
                  <span>
                    Nhóm hiện tại: <b>{currentTeamName}</b>
                  </span>
                ) : (
                  <span style={{ color: '#9CA3AF' }}>Chưa phân nhóm</span>
                )}
              </div>
            </div>
            {isLeader && (
              <Tag color="gold" icon={<CrownOutlined />} style={{ fontWeight: 600 }}>
                Trưởng nhóm
              </Tag>
            )}
          </div>

          {/* Workload Warning Alert */}
          {workload?.hasActiveWorkload && (
            <Alert
              type="warning"
              showIcon
              message="Cảnh báo: Nhân sự đang phụ trách khối lượng công việc"
              description={
                <div style={{ fontSize: 12 }}>
                  {workload.activeProjectsCount > 0 && (
                    <div>• Đang tham gia <b>{workload.activeProjectsCount}</b> dự án</div>
                  )}
                  {workload.activeTasksCount > 0 && (
                    <div>• Đang có <b>{workload.activeTasksCount}</b> công việc dở dang</div>
                  )}
                  {workload.activeDealsCount > 0 && (
                    <div>• Đang quản lý <b>{workload.activeDealsCount}</b> deals</div>
                  )}
                  <div style={{ marginTop: 4, fontStyle: 'italic', color: '#92400E' }}>
                    * Toàn bộ lịch sử công việc cũ vẫn được giữ nguyên vẹn trong hệ thống sau khi chuyển.
                  </div>
                </div>
              }
            />
          )}

          {/* Leader Notice */}
          {isLeader && (
            <Alert
              type="info"
              showIcon
              message="Chuyển đổi vai trò: Trưởng nhóm -> Nhân viên thường"
              description="Khi chuyển sang nhóm mới, nhân sự sẽ mặc định là nhân viên của nhóm/phòng ban mới. Nhóm cũ sẽ tạm thời khuyết Trưởng nhóm."
            />
          )}

          {/* Target Team Selection */}
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
              Chọn Team tiếp nhận (Hỗ trợ toàn bộ phòng ban SALES, DEV, SEO):
            </Text>
            <Select
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
              placeholder="Tìm và chọn Team đích tiếp nhận..."
              style={{ width: '100%' }}
              value={targetTeamId}
              onChange={setTargetTeamId}
              options={eligibleTeams.map((t) => ({
                value: t.id,
                label: `[${t.department}] ${t.name} (Trưởng nhóm: ${
                  t.leader ? t.leader.fullName : 'Chưa có'
                } | ${t.members.length} TV)`,
              }))}
            />
            {eligibleTeams.length === 0 && (
              <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                Hiện không tìm thấy Team nào khác để tiếp nhận.
              </Text>
            )}
          </div>

          {/* Dynamic Target Preview */}
          {selectedTargetTeam && (
            <div
              style={{
                padding: '10px 14px',
                background: isCrossDept ? '#FFFBEB' : '#F0FDF4',
                borderRadius: 8,
                border: isCrossDept ? '1px solid #FCD34D' : '1px solid #BBF7D0',
                fontSize: 12,
              }}
            >
              <div>
                Đích đến:{' '}
                <b>{selectedTargetTeam.name}</b> (Phòng ban:{' '}
                <Tag color={isCrossDept ? 'orange' : 'green'}>
                  {selectedTargetTeam.department}
                </Tag>
                )
              </div>
              {isCrossDept ? (
                <div style={{ marginTop: 6, color: '#B45309' }}>
                  <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                  <b>Mặc định là nhân viên phòng ban mới:</b> Vai trò và quyền hạn sẽ là{' '}
                  <b>{getNewRoleLabel(selectedTargetTeam.department)}</b>. Phiên đăng nhập
                  của nhân sự sẽ tự động được làm mới. Dữ liệu lịch sử cũ được bảo lưu 100%.
                </div>
              ) : isLeader ? (
                <div style={{ marginTop: 6, color: '#047857' }}>
                  <CheckCircleOutlined style={{ marginRight: 4 }} />
                  <b>Mặc định là nhân viên của nhóm mới:</b> Nhân sự sẽ chuyển thành thành viên
                  thường của <b>{selectedTargetTeam.name}</b>. Chức danh Trưởng nhóm ở nhóm cũ sẽ kết thúc.
                </div>
              ) : (
                <div style={{ marginTop: 6, color: '#047857' }}>
                  <CheckCircleOutlined style={{ marginRight: 4 }} />
                  <b>Chuyển nội bộ phòng ban {selectedTargetTeam.department}:</b> Nhân sự tiếp tục
                  là nhân viên của nhóm <b>{selectedTargetTeam.name}</b>.
                </div>
              )}
            </div>
          )}

          {/* Reason Field */}
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Lý do điều chuyển (ghi vào audit log):
            </Text>
            <Input.TextArea
              rows={2}
              placeholder="Ví dụ: Điều chuyển cơ cấu dự án, thay đổi phân công nhân sự..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
      )}
    </Modal>
  );
};
