import React from 'react';
import { Avatar, Badge, Button, Dropdown, Tag, Tooltip, Typography, App } from 'antd';
import type { MenuProps } from 'antd';
import {
  CrownOutlined,
  SearchOutlined,
  ApartmentOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
  AimOutlined,
  UpOutlined,
  DownOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  EllipsisOutlined,
  EyeOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  ShopOutlined,
  CodeOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { Handle, Position } from 'reactflow';
import { OrgEmployeeCard, OrgTeamData } from '../../api/organizationChart';

const { Title, Text } = Typography;

// Configuration per department: Colors, Labels, Icons
export const DEPT_METADATA: Record<
  string,
  {
    label: string;
    subLabel: string;
    color: string;
    accent: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
  }
> = {
  SALES: {
    label: 'PHÒNG KINH DOANH',
    subLabel: 'Khối Sales & Phát Triển Doanh Thu',
    color: '#0C6B37',
    accent: '#10B981',
    bg: '#F0FDF4',
    border: '#BBF7D0',
    icon: <ShopOutlined />,
  },
  DEV: {
    label: 'PHÒNG KỸ THUẬT & LẬP TRÌNH',
    subLabel: 'Khối Công Nghệ & Phát Triển Phần Mềm',
    color: '#1D4ED8',
    accent: '#3B82F6',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    icon: <CodeOutlined />,
  },
  SEO: {
    label: 'PHÒNG MARKETING & SEO',
    subLabel: 'Khối Tối Ưu Hóa Tìm Kiếm & Nội Dung',
    color: '#D97706',
    accent: '#F59E0B',
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: <LineChartOutlined />,
  },
  OPERATION: {
    label: 'PHÒNG VẬN HÀNH',
    subLabel: 'Khối Vận Hành Doanh Nghiệp',
    color: '#4F46E5',
    accent: '#6366F1',
    bg: '#EEF2FF',
    border: '#C7D2FE',
    icon: <ApartmentOutlined />,
  },
  BOD: {
    label: 'BAN GIÁM ĐỐC (BOD)',
    subLabel: 'Khối Điều Hành Cấp Cao',
    color: '#B45309',
    accent: '#F59E0B',
    bg: '#FEF3C7',
    border: '#FDE68A',
    icon: <CrownOutlined />,
  },
};

export const DEFAULT_DEPT = {
  label: 'PHÒNG BAN',
  subLabel: 'Đơn Vị Chuyên Môn',
  color: '#4B5563',
  accent: '#6B7280',
  bg: '#F3F4F6',
  border: '#E5E7EB',
  icon: <TeamOutlined />,
};

// ============================================================================
// 1. CUSTOM REACT FLOW NODES
// ============================================================================

// --- 1.1. BOSS NODE (Level 0) ---
interface BossNodeData {
  boss: OrgEmployeeCard;
  isSearchMatch?: boolean;
}

export const BossNode: React.FC<{ data: BossNodeData }> = ({ data }) => {
  const { boss, isSearchMatch } = data;
  return (
    <div
      style={{
        width: 340,
        background: 'linear-gradient(135deg, #FFFDF5 0%, #FFFFFF 100%)',
        borderRadius: 16,
        border: isSearchMatch ? '3px solid #F59E0B' : '2px solid #D97706',
        boxShadow: isSearchMatch
          ? '0 0 24px rgba(245, 158, 11, 0.45)'
          : '0 12px 28px -6px rgba(217, 119, 6, 0.2)',
        padding: '16px 18px',
        position: 'relative',
        cursor: 'default',
        transition: 'all 0.3s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #F59E0B, #D97706)',
          color: '#FFF',
          padding: '3px 16px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.6px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 2px 8px rgba(217, 119, 6, 0.35)',
        }}
      >
        <CrownOutlined style={{ fontSize: 13, color: '#FEF3C7' }} /> TỔNG GIÁM ĐỐC (BOSS)
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <Avatar
          size={56}
          style={{
            background: 'linear-gradient(135deg, #D97706 0%, #92400E 100%)',
            color: '#FFF',
            fontSize: 22,
            fontWeight: 800,
            boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
          }}
        >
          {boss.fullName.charAt(0).toUpperCase()}
        </Avatar>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text strong style={{ fontSize: 16, color: '#18211C' }} ellipsis>
              {boss.fullName}
            </Text>
            <Tag color="gold" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
              {boss.employeeCode}
            </Tag>
          </div>
          <div style={{ fontSize: 13, color: '#B45309', fontWeight: 600, marginTop: 2 }}>
            {boss.positionName || 'Giám Đốc Điều Hành'}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <Tag color="success" style={{ fontSize: 10, margin: 0, borderRadius: 6 }}>
              {boss.status === 'ACTIVE' ? 'Hoạt động' : boss.status}
            </Tag>
            <Tag color="blue" style={{ fontSize: 10, margin: 0, borderRadius: 6 }}>
              BOD
            </Tag>
          </div>
        </div>
      </div>

      {/* Source handle connecting down to Departments */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: '#D97706',
          width: 12,
          height: 12,
          border: '2px solid #FFF',
          bottom: -6,
        }}
      />
    </div>
  );
};

// --- 1.2. DEPARTMENT NODE (Level 1 - Intermediate) ---
interface DepartmentNodeData {
  department: string;
  label: string;
  subLabel: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  teamCount: number;
  memberCount: number;
  isSearchMatch?: boolean;
}

export const DepartmentNode: React.FC<{ data: DepartmentNodeData }> = ({ data }) => {
  const { label, subLabel, color, bg, border, icon, teamCount, memberCount, isSearchMatch } = data;

  return (
    <div
      style={{
        width: 320,
        background: '#FFFFFF',
        borderRadius: 14,
        border: isSearchMatch ? `2.5px solid ${color}` : `2px solid ${border}`,
        boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
        position: 'relative',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Target handle from BOSS */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: color,
          width: 10,
          height: 10,
          border: '2px solid #FFF',
          top: -5,
        }}
      />

      {/* Header Banner */}
      <div
        style={{
          background: bg,
          borderBottom: `1.5px solid ${border}`,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: color,
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            boxShadow: `0 3px 8px ${color}40`,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color, letterSpacing: '0.5px' }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{subLabel}</div>
        </div>
      </div>

      {/* Stats Summary */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          background: '#FAFCFA',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Text style={{ fontSize: 11, color: '#6B7280', display: 'block' }}>Số lượng Team</Text>
          <Text strong style={{ fontSize: 16, color: '#18211C' }}>
            {teamCount}
          </Text>
        </div>
        <div style={{ width: 1, height: 24, background: '#E5E7EB' }} />
        <div style={{ textAlign: 'center' }}>
          <Text style={{ fontSize: 11, color: '#6B7280', display: 'block' }}>Tổng Nhân Sự</Text>
          <Text strong style={{ fontSize: 16, color }}>
            {memberCount}
          </Text>
        </div>
      </div>

      {/* Source handle connecting down to Teams */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: color,
          width: 10,
          height: 10,
          border: '2px solid #FFF',
          bottom: -5,
        }}
      />
    </div>
  );
};

// --- 1.3. TEAM NODE (Level 2) ---
interface TeamNodeData {
  team: OrgTeamData;
  isCollapsed: boolean;
  onToggleCollapse: (teamId: string) => void;
  onDragStartMember: (member: OrgEmployeeCard, sourceTeam: OrgTeamData) => void;
  onDropMemberOnTeam: (targetTeam: OrgTeamData) => void;
  draggedMember: { employee: OrgEmployeeCard; sourceTeam: OrgTeamData } | null;
  isDragOver: boolean;
  onDragEnterTeam: (teamId: string) => void;
  onDragLeaveTeam: (teamId: string) => void;
  onOpenMemberDetail: (member: OrgEmployeeCard, team: OrgTeamData) => void;
  onOpenMoveModal: (member: OrgEmployeeCard, team: OrgTeamData) => void;
  searchKeyword?: string;
}

export const TeamCardView: React.FC<{
  team: OrgTeamData;
  isCollapsed: boolean;
  onToggleCollapse: (teamId: string) => void;
  onDragStartMember: (member: OrgEmployeeCard, sourceTeam: OrgTeamData) => void;
  onDropMemberOnTeam: (targetTeam: OrgTeamData) => void;
  draggedMember: { employee: OrgEmployeeCard; sourceTeam: OrgTeamData } | null;
  isDragOver: boolean;
  onDragEnterTeam: (teamId: string) => void;
  onDragLeaveTeam: (teamId: string) => void;
  onOpenMemberDetail: (member: OrgEmployeeCard, team: OrgTeamData) => void;
  onOpenMoveModal: (member: OrgEmployeeCard, team: OrgTeamData) => void;
  searchKeyword?: string;
  hasHandle?: boolean;
}> = ({
  team,
  isCollapsed,
  onToggleCollapse,
  onDragStartMember,
  onDropMemberOnTeam,
  draggedMember,
  isDragOver,
  onDragEnterTeam,
  onDragLeaveTeam,
  onOpenMemberDetail,
  onOpenMoveModal,
  searchKeyword = '',
  hasHandle = false,
}) => {
  const { message } = App.useApp();
  const deptConf = DEPT_METADATA[team.department.toUpperCase()] || DEFAULT_DEPT;

  const isCrossDeptWithDragged =
    draggedMember &&
    (draggedMember.sourceTeam.department || '').toUpperCase() !==
      (team.department || '').toUpperCase();

  const isSameTeamWithDragged =
    draggedMember && String(draggedMember.sourceTeam.id) === String(team.id);

  // Target team must be in the same department and not the source team
  const canDropHere = Boolean(draggedMember && !isSameTeamWithDragged && !isCrossDeptWithDragged);

  const isTeamMatch =
    searchKeyword &&
    (team.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      team.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (team.leader && team.leader.fullName.toLowerCase().includes(searchKeyword.toLowerCase())));

  // Style adjustments when dragging
  let cardBorder = '1px solid #DDE7E1';
  let cardBg = '#FFFFFF';
  let cardOpacity = 1;

  if (draggedMember) {
    if (isSameTeamWithDragged) {
      cardOpacity = 0.7;
    } else if (isCrossDeptWithDragged) {
      cardOpacity = 0.45;
      cardBorder = '1px dashed #D1D5DB';
    } else if (canDropHere) {
      cardBorder = isDragOver ? '2px dashed #0C6B37' : '1.5px dashed #10B981';
      cardBg = isDragOver ? '#F0FDF4' : '#FAFCFA';
    }
  } else if (isTeamMatch) {
    cardBorder = '2px solid #F59E0B';
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = canDropHere ? 'move' : 'none';
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnterTeam(team.id);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        onDragLeaveTeam(team.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (isCrossDeptWithDragged) {
          message.warning(
            'Chưa hỗ trợ điều chuyển liên phòng ban (CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED)',
          );
          return;
        }
        if (canDropHere) {
          onDropMemberOnTeam(team);
        }
      }}
      style={{
        width: 330,
        background: cardBg,
        opacity: cardOpacity,
        borderRadius: 16,
        border: cardBorder,
        boxShadow: isDragOver && canDropHere
          ? '0 0 22px rgba(12, 107, 55, 0.3)'
          : '0 8px 24px -4px rgba(0, 0, 0, 0.06)',
        overflow: 'hidden',
        position: 'relative',
        transition: 'all 0.25s ease',
      }}
    >
      {hasHandle && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: deptConf.color,
            width: 10,
            height: 10,
            border: '2px solid #FFF',
            top: -5,
          }}
        />
      )}

      {/* Team Header */}
      <div
        style={{
          padding: '12px 14px',
          background: deptConf.bg,
          borderBottom: `1px solid ${deptConf.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: deptConf.color,
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            <TeamOutlined />
          </div>
          <div style={{ minWidth: 0 }}>
            <Text
              strong
              style={{
                fontSize: 13,
                color: '#18211C',
                display: 'block',
                lineHeight: 1.2,
              }}
              ellipsis
            >
              {team.name}
            </Text>
            <Tag
              style={{
                fontSize: 10,
                color: deptConf.color,
                borderColor: deptConf.border,
                background: '#FFF',
                marginTop: 2,
                borderRadius: 4,
              }}
            >
              {deptConf.label}
            </Tag>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Badge
            count={team.members.length + (team.leader ? 1 : 0)}
            overflowCount={99}
            style={{
              backgroundColor: deptConf.color,
              color: '#FFF',
              fontSize: 11,
              fontWeight: 700,
            }}
          />
          <Tooltip title={isCollapsed ? 'Mở rộng thành viên' : 'Thu gọn thành viên'}>
            <Button
              type="text"
              size="small"
              icon={isCollapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => onToggleCollapse(team.id)}
              style={{ color: '#66736B' }}
            />
          </Tooltip>
        </div>
      </div>

      {/* Drag Over Indicators */}
      {isDragOver && isCrossDeptWithDragged && (
        <div
          style={{
            padding: '8px 12px',
            background: '#FEF2F2',
            borderBottom: '1px dashed #EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 11,
            color: '#DC2626',
            fontWeight: 700,
          }}
        >
          <WarningOutlined /> Không thể chuyển liên phòng ban
        </div>
      )}

      {isDragOver && canDropHere && (
        <div
          style={{
            padding: '8px 12px',
            background: '#EAF3ED',
            borderBottom: '1px dashed #0C6B37',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 11,
            color: '#0C6B37',
            fontWeight: 700,
          }}
        >
          <CheckCircleOutlined /> Thả vào [{team.name}]
        </div>
      )}

      {/* Team Leader Section (Fixed, not draggable) */}
      <div style={{ padding: 12, borderBottom: '1px solid #EEF4F0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#B45309',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <CrownOutlined style={{ color: '#F59E0B' }} /> TRƯỞNG TEAM (CỐ ĐỊNH)
          </div>
          <Tooltip title="Chưa hỗ trợ: TEAM_LEADER_ROLE_POLICY_NOT_DEFINED (Chưa có chính sách đồng bộ role/position khi đổi Trưởng nhóm)">
            <Button
              type="link"
              size="small"
              disabled
              style={{
                fontSize: 11,
                padding: 0,
                height: 'auto',
                fontWeight: 600,
                color: '#9CA3AF',
                cursor: 'not-allowed',
              }}
            >
              Đổi trưởng Team
            </Button>
          </Tooltip>
        </div>

        {team.leader ? (
          <div
            style={{
              background: '#FFFDF5',
              border: '1.5px solid #FDE68A',
              borderRadius: 10,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Avatar
              size={36}
              style={{
                background: '#D97706',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {team.leader.fullName.charAt(0).toUpperCase()}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text strong style={{ fontSize: 13, color: '#18211C' }} ellipsis>
                  {team.leader.fullName}
                </Text>
                <Tag color="gold" style={{ margin: 0, fontSize: 9 }}>
                  {team.leader.employeeCode}
                </Tag>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#92400E',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <span>{team.leader.positionName || 'Trưởng nhóm'}</span>
                <Tag
                  color="success"
                  style={{ margin: 0, fontSize: 9, padding: '0 3px', lineHeight: '14px' }}
                >
                  {team.leader.status === 'ACTIVE' ? 'Hoạt động' : team.leader.status}
                </Tag>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: '#F9FAFB',
              border: '1px dashed #D1D5DB',
              borderRadius: 10,
              padding: '10px',
              textAlign: 'center',
              color: '#9CA3AF',
              fontSize: 11,
            }}
          >
            Chưa có Trưởng nhóm
          </div>
        )}
      </div>

      {/* Members Section (Collapsible & Draggable) */}
      {!isCollapsed && (
        <div style={{ padding: 12, background: '#FAFCFA' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#66736B',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>THÀNH VIÊN ({team.members.length})</span>
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>Kéo hoặc click ... để chuyển</span>
          </div>

          {team.members.length === 0 ? (
            <div
              style={{
                padding: '14px',
                textAlign: 'center',
                color: '#9CA3AF',
                fontSize: 12,
                background: '#FFF',
                borderRadius: 8,
                border: '1px dashed #E5E7EB',
              }}
            >
              Chưa có thành viên
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 280,
                overflowY: 'auto',
                paddingRight: 2,
              }}
            >
              {team.members.map((member) => {
                const isMemberMatch =
                  searchKeyword &&
                  (member.fullName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                    member.employeeCode.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                    (member.positionName &&
                      member.positionName.toLowerCase().includes(searchKeyword.toLowerCase())));

                const menuItems: MenuProps['items'] = [
                  {
                    key: 'detail',
                    icon: <EyeOutlined />,
                    label: 'Xem chi tiết nhân sự',
                    onClick: () => onOpenMemberDetail(member, team),
                  },
                  {
                    key: 'move',
                    icon: <SwapOutlined style={{ color: '#0C6B37' }} />,
                    label: <span style={{ color: '#0C6B37', fontWeight: 600 }}>Chuyển Team</span>,
                    onClick: () => onOpenMoveModal(member, team),
                  },
                ];

                return (
                  <div
                    key={member.employeeId}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', member.employeeId);
                      onDragStartMember(member, team);
                    }}
                    style={{
                      background: isMemberMatch ? '#FEF3C7' : '#FFFFFF',
                      border: isMemberMatch ? '1.5px solid #F59E0B' : '1px solid #E5E7EB',
                      borderRadius: 10,
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'grab',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = deptConf.color;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isMemberMatch ? '#F59E0B' : '#E5E7EB';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                    }}
                  >
                    <Avatar
                      size={32}
                      style={{
                        backgroundColor: deptConf.color,
                        color: '#FFF',
                        fontSize: 13,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {member.fullName.charAt(0).toUpperCase()}
                    </Avatar>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Text strong style={{ fontSize: 12, color: '#18211C' }} ellipsis>
                          {member.fullName}
                        </Text>
                        <Tag style={{ margin: 0, fontSize: 9, padding: '0 4px', borderRadius: 4 }}>
                          {member.employeeCode}
                        </Tag>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#66736B',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 2,
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {member.positionName || 'Nhân viên'}
                        </span>
                        <Tag
                          color="success"
                          style={{ margin: 0, fontSize: 9, padding: '0 3px', lineHeight: '14px' }}
                        >
                          {member.status === 'ACTIVE' ? 'Hoạt động' : member.status}
                        </Tag>
                      </div>
                    </div>

                    {/* Action Menu button */}
                    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EllipsisOutlined />}
                        style={{ color: '#9CA3AF' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Dropdown>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TeamNode: React.FC<{ data: TeamNodeData }> = ({ data }) => {
  return <TeamCardView {...data} hasHandle={true} />;
};

export const nodeTypes = {
  bossNode: BossNode,
  deptNode: DepartmentNode,
  teamNode: TeamNode,
};

