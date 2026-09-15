import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Card,
  Typography,
  Tag,
  Avatar,
  Button,
  Input,
  Select,
  Modal,
  Space,
  Badge,
  Tooltip,
  Drawer,
  Empty,
  Spin,
  Alert,
  message,
  Dropdown,
  Tabs,
  Segmented,
  Descriptions,
} from 'antd';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  fetchOrganizationChart,
  moveOrgChartMember,
  OrgChartResponse,
  OrgEmployeeCard,
  OrgTeamData,
} from '../../api/organizationChart';

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

const DEFAULT_DEPT = {
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

const BossNode: React.FC<{ data: BossNodeData }> = ({ data }) => {
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

const DepartmentNode: React.FC<{ data: DepartmentNodeData }> = ({ data }) => {
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

const nodeTypes = {
  bossNode: BossNode,
  deptNode: DepartmentNode,
  teamNode: TeamNode,
};

// ============================================================================
// 2. MAIN ORGANIZATION CHART COMPONENT
// ============================================================================

export const OrganizationChartPageContent: React.FC = () => {
  const queryClient = useQueryClient();
  const reactFlowInstance = useReactFlow();

  // View Mode: 'tree' (Hierarchical Flow) or 'grid' (Dashboard Responsive Grid)
  const [viewMode, setViewMode] = useState<'tree' | 'grid'>('tree');

  // Search & Filter State - Default to 'SALES' tab as recommended to avoid canvas sprawl
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('SALES');
  const [teamFilterId, setTeamFilterId] = useState<string>('ALL');

  // Collapse State for teams
  const [collapsedTeamIds, setCollapsedTeamIds] = useState<Set<string>>(new Set());

  // Drag & Drop State
  const [draggedMember, setDraggedMember] = useState<{
    employee: OrgEmployeeCard;
    sourceTeam: OrgTeamData;
  } | null>(null);
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null);

  // Modals & Drawers
  const [confirmMoveModalOpen, setConfirmMoveModalOpen] = useState(false);
  const [pendingMoveData, setPendingMoveData] = useState<{
    employee: OrgEmployeeCard;
    sourceTeam: OrgTeamData;
    targetTeam: OrgTeamData;
  } | null>(null);
  const [moveReason, setMoveReason] = useState<string>('');

  // Action: Move member without dragging
  const [manualMoveModalOpen, setManualMoveModalOpen] = useState(false);
  const [selectedMemberToMove, setSelectedMemberToMove] = useState<{
    employee: OrgEmployeeCard;
    sourceTeam: OrgTeamData;
  } | null>(null);
  const [manualTargetTeamId, setManualTargetTeamId] = useState<string | null>(null);
  const [manualMoveReason, setManualMoveReason] = useState<string>('');

  // Drawer: Member detail
  const [selectedMemberForDetail, setSelectedMemberForDetail] = useState<{
    employee: OrgEmployeeCard;
    team: OrgTeamData;
  } | null>(null);

  // Drawer: External Staff
  const [externalStaffDrawerOpen, setExternalStaffDrawerOpen] = useState(false);

  // -------------------------------------------------------------
  // DATA FETCHING (REACT QUERY)
  // -------------------------------------------------------------
  const { data: chartData, isLoading, isError, error, refetch } = useQuery<OrgChartResponse>({
    queryKey: ['organization-chart'],
    queryFn: fetchOrganizationChart,
  });

  // -------------------------------------------------------------
  // MUTATIONS (MOVE MEMBER)
  // -------------------------------------------------------------
  const moveMutation = useMutation({
    mutationFn: moveOrgChartMember,
    onSuccess: (data) => {
      message.success(data.message || 'Chuyển nhóm làm việc thành công');
      queryClient.invalidateQueries({ queryKey: ['organization-chart'] });
      setConfirmMoveModalOpen(false);
      setPendingMoveData(null);
      setMoveReason('');
      setManualMoveModalOpen(false);
      setSelectedMemberToMove(null);
      setManualTargetTeamId(null);
      setManualMoveReason('');
      setDraggedMember(null);
      setDragOverTeamId(null);
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể chuyển nhóm cho nhân viên');
    },
  });

  // -------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------
  const handleToggleCollapse = useCallback((teamId: string) => {
    setCollapsedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }, []);

  const handleCollapseAll = () => {
    if (!chartData?.teams) return;
    setCollapsedTeamIds(new Set(chartData.teams.map((t) => t.id)));
  };

  const handleExpandAll = () => {
    setCollapsedTeamIds(new Set());
  };

  const handleDragStartMember = useCallback(
    (member: OrgEmployeeCard, sourceTeam: OrgTeamData) => {
      setDraggedMember({ employee: member, sourceTeam });
    },
    [],
  );

  const handleDragEnterTeam = useCallback((teamId: string) => {
    setDragOverTeamId(teamId);
  }, []);

  const handleDragLeaveTeam = useCallback((teamId: string) => {
    setDragOverTeamId((prev) => (prev === teamId ? null : prev));
  }, []);

  const handleDropMemberOnTeam = useCallback(
    (targetTeam: OrgTeamData) => {
      if (!draggedMember) return;

      if (String(draggedMember.sourceTeam.id) === String(targetTeam.id)) {
        message.info(`Nhân viên ${draggedMember.employee.fullName} đã thuộc nhóm này`);
        setDraggedMember(null);
        setDragOverTeamId(null);
        return;
      }

      // Check cross department
      if (
        (draggedMember.sourceTeam.department || '').toUpperCase() !==
        (targetTeam.department || '').toUpperCase()
      ) {
        message.warning(
          `Chưa hỗ trợ điều chuyển liên phòng ban (CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED): [${draggedMember.sourceTeam.department}] -> [${targetTeam.department}]`,
        );
        setDraggedMember(null);
        setDragOverTeamId(null);
        return;
      }

      // Open confirm modal
      setPendingMoveData({
        employee: draggedMember.employee,
        sourceTeam: draggedMember.sourceTeam,
        targetTeam,
      });
      setConfirmMoveModalOpen(true);
      setDragOverTeamId(null);
    },
    [draggedMember],
  );

  const handleConfirmMove = () => {
    if (!pendingMoveData) return;
    moveMutation.mutate({
      employeeId: pendingMoveData.employee.employeeId,
      targetTeamId: pendingMoveData.targetTeam.id,
      reason: moveReason.trim() || undefined,
    });
  };

  // Open direct Move Modal (from "..." menu)
  const handleOpenMoveModal = useCallback(
    (member: OrgEmployeeCard, team: OrgTeamData) => {
      setSelectedMemberToMove({ employee: member, sourceTeam: team });
      setManualTargetTeamId(null);
      setManualMoveReason('');
      setManualMoveModalOpen(true);
    },
    [],
  );

  const handleConfirmManualMove = () => {
    if (!selectedMemberToMove || !manualTargetTeamId) {
      message.warning('Vui lòng chọn Team đích tiếp nhận');
      return;
    }
    moveMutation.mutate({
      employeeId: selectedMemberToMove.employee.employeeId,
      targetTeamId: manualTargetTeamId,
      reason: manualMoveReason.trim() || undefined,
    });
  };

  // Open Member Detail Drawer
  const handleOpenMemberDetail = useCallback(
    (member: OrgEmployeeCard, team: OrgTeamData) => {
      setSelectedMemberForDetail({ employee: member, team });
    },
    [],
  );

  // Group teams by department
  const groupedDepartments = useMemo(() => {
    if (!chartData?.teams) return [];

    const depts = ['SALES', 'DEV', 'SEO'];
    return depts.map((dKey) => {
      const teamsInDept = chartData.teams.filter(
        (t) => t.department.toUpperCase() === dKey.toUpperCase(),
      );
      const totalMembers = teamsInDept.reduce(
        (acc, t) => acc + t.members.length + (t.leader ? 1 : 0),
        0,
      );
      const meta = DEPT_METADATA[dKey] || DEFAULT_DEPT;
      return {
        key: dKey,
        ...meta,
        teams: teamsInDept,
        teamCount: teamsInDept.length,
        memberCount: totalMembers,
      };
    });
  }, [chartData]);

  // Candidates for manual move (same department, excluding source team)
  const eligibleManualTargetTeams = useMemo(() => {
    if (!selectedMemberToMove || !chartData?.teams) return [];
    return chartData.teams.filter(
      (t) =>
        t.department.toUpperCase() ===
          selectedMemberToMove.sourceTeam.department.toUpperCase() &&
        String(t.id) !== String(selectedMemberToMove.sourceTeam.id),
    );
  }, [selectedMemberToMove, chartData]);

  // -------------------------------------------------------------
  // BUILD HIERARCHICAL NODES AND EDGES FOR REACT FLOW
  // Level 0: BOSS
  // Level 1: Department Nodes (SALES, DEV, SEO)
  // Level 2: Team Nodes under each Department
  // -------------------------------------------------------------
  const { nodes, edges } = useMemo(() => {
    if (!chartData || !chartData.boss) {
      return { nodes: [], edges: [] };
    }

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Filter departments to display
    const visibleDepts = groupedDepartments.filter((dept) => {
      if (departmentFilter === 'ALL') return true;
      return dept.key.toUpperCase() === departmentFilter.toUpperCase();
    });

    const isBossSearchMatch =
      searchKeyword &&
      (chartData.boss.fullName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        chartData.boss.employeeCode.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (chartData.boss.positionName &&
          chartData.boss.positionName.toLowerCase().includes(searchKeyword.toLowerCase())));

    // Layout configuration
    const TEAM_WIDTH = 330;
    const TEAM_GAP_X = 32;
    const TEAM_GAP_Y = 36;
    const TEAM_EST_HEIGHT = 420;
    const DEPT_WIDTH = 320;
    const DEPT_GAP_X = 64;

    const BOSS_Y = 30;
    const DEPT_Y = 220;
    const TEAMS_START_Y = 400;

    // Calculate columns per department branch
    const branchConfigs = visibleDepts.map((dept) => {
      // Filter teams by search & team filter
      const filteredTeams = dept.teams.filter((t) => {
        if (teamFilterId !== 'ALL' && String(t.id) !== String(teamFilterId)) return false;
        if (!searchKeyword) return true;
        const kw = searchKeyword.toLowerCase();
        const teamMatch =
          t.name.toLowerCase().includes(kw) ||
          t.code.toLowerCase().includes(kw) ||
          (t.leader && t.leader.fullName.toLowerCase().includes(kw));
        const memberMatch = t.members.some(
          (m) =>
            m.fullName.toLowerCase().includes(kw) ||
            m.employeeCode.toLowerCase().includes(kw) ||
            (m.positionName && m.positionName.toLowerCase().includes(kw)),
        );
        return teamMatch || memberMatch;
      });

      const cols =
        visibleDepts.length === 1
          ? Math.max(1, Math.min(filteredTeams.length, 3))
          : Math.max(1, Math.min(filteredTeams.length, 2));

      const branchWidth = Math.max(
        DEPT_WIDTH,
        cols * TEAM_WIDTH + Math.max(0, cols - 1) * TEAM_GAP_X,
      );

      return {
        dept,
        filteredTeams,
        cols,
        branchWidth,
      };
    });

    // Total width across all department branches
    const totalBranchesWidth =
      branchConfigs.reduce((sum, b) => sum + b.branchWidth, 0) +
      Math.max(0, branchConfigs.length - 1) * DEPT_GAP_X;

    let currentBranchLeft = -totalBranchesWidth / 2;

    // 1. Root Node: BOSS (Level 0)
    flowNodes.push({
      id: 'node-boss',
      type: 'bossNode',
      position: { x: -170, y: BOSS_Y },
      data: {
        boss: chartData.boss,
        isSearchMatch: Boolean(isBossSearchMatch),
      },
    });

    // 2. Department Nodes (Level 1) & Team Nodes (Level 2)
    branchConfigs.forEach(({ dept, filteredTeams, cols, branchWidth }) => {
      const branchCenter = currentBranchLeft + branchWidth / 2;
      const deptNodeX = branchCenter - DEPT_WIDTH / 2;

      // Add Department Node
      flowNodes.push({
        id: `node-dept-${dept.key}`,
        type: 'deptNode',
        position: { x: deptNodeX, y: DEPT_Y },
        data: {
          department: dept.key,
          label: dept.label,
          subLabel: dept.subLabel,
          color: dept.color,
          bg: dept.bg,
          border: dept.border,
          icon: dept.icon,
          teamCount: dept.teamCount,
          memberCount: dept.memberCount,
          isSearchMatch: false,
        },
      });

      // Edge from BOSS to Department Node
      flowEdges.push({
        id: `edge-boss-dept-${dept.key}`,
        source: 'node-boss',
        target: `node-dept-${dept.key}`,
        type: 'smoothstep',
        style: { stroke: dept.color, strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: dept.color,
        },
      });

      // Calculate teams starting X so that teams grid is centered inside the department branch
      const teamsGridWidth = cols * TEAM_WIDTH + Math.max(0, cols - 1) * TEAM_GAP_X;
      const teamsStartLeft = branchCenter - teamsGridWidth / 2;

      // Add Team Nodes under this Department
      filteredTeams.forEach((team, tIdx) => {
        const row = Math.floor(tIdx / cols);
        const col = tIdx % cols;
        const nodeX = teamsStartLeft + col * (TEAM_WIDTH + TEAM_GAP_X);
        const nodeY = TEAMS_START_Y + row * (TEAM_EST_HEIGHT + TEAM_GAP_Y);

        flowNodes.push({
          id: `node-team-${team.id}`,
          type: 'teamNode',
          position: { x: nodeX, y: nodeY },
          data: {
            team,
            isCollapsed: collapsedTeamIds.has(team.id),
            onToggleCollapse: handleToggleCollapse,
            onDragStartMember: handleDragStartMember,
            onDropMemberOnTeam: handleDropMemberOnTeam,
            draggedMember,
            isDragOver: dragOverTeamId === team.id,
            onDragEnterTeam: handleDragEnterTeam,
            onDragLeaveTeam: handleDragLeaveTeam,
            onOpenMemberDetail: handleOpenMemberDetail,
            onOpenMoveModal: handleOpenMoveModal,
            searchKeyword,
          },
        });

        // Edge from Department Node to Team Node
        flowEdges.push({
          id: `edge-dept-${dept.key}-team-${team.id}`,
          source: `node-dept-${dept.key}`,
          target: `node-team-${team.id}`,
          type: 'smoothstep',
          style: { stroke: dept.border, strokeWidth: 1.8 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: dept.color,
          },
        });
      });

      currentBranchLeft += branchWidth + DEPT_GAP_X;
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [
    chartData,
    groupedDepartments,
    departmentFilter,
    teamFilterId,
    collapsedTeamIds,
    searchKeyword,
    draggedMember,
    dragOverTeamId,
    handleToggleCollapse,
    handleDragStartMember,
    handleDropMemberOnTeam,
    handleDragEnterTeam,
    handleDragLeaveTeam,
    handleOpenMemberDetail,
    handleOpenMoveModal,
  ]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  useEffect(() => {
    setRfNodes(nodes);
  }, [nodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(edges);
  }, [edges, setRfEdges]);

  // Fit View helper
  const handleFitView = useCallback(() => {
    try {
      reactFlowInstance.fitView({ padding: 0.15, duration: 400 });
    } catch {
      // ignore
    }
  }, [reactFlowInstance]);

  // Auto fit view on department filter change in tree mode
  useEffect(() => {
    if (viewMode === 'tree') {
      const timer = setTimeout(() => {
        handleFitView();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [departmentFilter, viewMode, handleFitView]);

  if (isLoading) {
    return (
      <div
        style={{
          height: 'calc(100vh - 120px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F7FAF8',
        }}
      >
        <Spin size="large" />
        <Text style={{ marginTop: 16, color: '#66736B', fontWeight: 500 }}>
          Đang tải cơ cấu sơ đồ nhân sự công ty...
        </Text>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Không thể tải sơ đồ nhân sự"
          description={
            (error as any)?.message || 'Vui lòng kiểm tra quyền BOSS hoặc kết nối máy chủ.'
          }
          showIcon
          action={
            <Button size="small" type="primary" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      </div>
    );
  }

  // Active departments to display in Dashboard Grid view
  const visibleGridDepartments = groupedDepartments.filter((dept) => {
    if (departmentFilter === 'ALL') return true;
    return dept.key.toUpperCase() === departmentFilter.toUpperCase();
  });

  const tabItems = [
    ...groupedDepartments.map((dept) => ({
      key: dept.key,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          {dept.icon}
          <span>{dept.label}</span>
          <Badge
            count={dept.teamCount}
            style={{
              backgroundColor: dept.color,
              fontSize: 10,
              fontWeight: 700,
            }}
          />
        </span>
      ),
    })),
    {
      key: 'ALL',
      label: `Tất Cả Phòng Ban (${chartData?.teams.length || 0} Teams)`,
    },
  ];

  return (
    <div style={{ height: 'calc(100vh - 84px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header & Toolbar */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #DDE7E1',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0C6B37 0%, #167A45 100%)',
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            <ApartmentOutlined />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#18211C', lineHeight: 1.2 }}>
              Sơ Đồ Nhân Sự (Organization Chart)
            </Title>
            <Text style={{ fontSize: 12, color: '#66736B' }}>
              Bố cục phân cấp từ trên xuống: BOSS → Phòng Ban → Team → Trưởng Team → Thành viên
            </Text>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* View Mode Toggle */}
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as 'tree' | 'grid')}
            options={[
              {
                value: 'tree',
                label: 'Sơ đồ cây (Flow)',
                icon: <BranchesOutlined />,
              },
              {
                value: 'grid',
                label: 'Bảng quản trị (Grid)',
                icon: <AppstoreOutlined />,
              },
            ]}
          />

          {/* Search Input */}
          <Input
            prefix={<SearchOutlined style={{ color: '#9CA3AF' }} />}
            placeholder="Tìm theo tên, mã NV, chức vụ..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />

          {/* Team Filter Select */}
          <Select
            value={teamFilterId}
            onChange={setTeamFilterId}
            style={{ width: 170 }}
            options={[
              { value: 'ALL', label: 'Tất cả Team' },
              ...(chartData?.teams
                .filter((t) =>
                  departmentFilter === 'ALL'
                    ? true
                    : t.department.toUpperCase() === departmentFilter.toUpperCase(),
                )
                .map((t) => ({ value: t.id, label: t.name })) || []),
            ]}
          />

          {/* Expand / Collapse All */}
          <Space>
            <Tooltip title="Thu gọn tất cả">
              <Button icon={<UpOutlined />} onClick={handleCollapseAll} />
            </Tooltip>
            <Tooltip title="Mở rộng tất cả">
              <Button icon={<DownOutlined />} onClick={handleExpandAll} />
            </Tooltip>
            {viewMode === 'tree' && (
              <Tooltip title="Thu phóng vừa màn hình">
                <Button icon={<AimOutlined />} onClick={handleFitView} />
              </Tooltip>
            )}
            <Tooltip title="Tải lại sơ đồ">
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            </Tooltip>
          </Space>

          {/* External Staff */}
          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => setExternalStaffDrawerOpen(true)}
            style={{ borderColor: '#D1D5DB', fontWeight: 600 }}
          >
            Ngoài cơ cấu ({chartData?.externalStaff.length || 0})
          </Button>
        </div>
      </div>

      {/* Dedicated Department Tabs Bar (Always visible for fast switching without sprawl) */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
          padding: '4px 24px 0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <Tabs
          activeKey={departmentFilter}
          onChange={(key) => {
            setDepartmentFilter(key);
            setTeamFilterId('ALL');
          }}
          items={tabItems}
          style={{ marginBottom: -1 }}
        />
      </div>

      {/* Main Content Area */}
      {viewMode === 'tree' ? (
        /* React Flow Canvas (Tree Direction: Top to Bottom) */
        <div style={{ flex: 1, position: 'relative', background: '#F8FAF9' }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={1.8}
          >
            <Background color="#DDE7E1" gap={20} size={1.2} />
            <Controls position="bottom-right" />
            <MiniMap
              nodeColor={(n) => {
                if (n.type === 'bossNode') return '#F59E0B';
                if (n.type === 'deptNode') return '#1D4ED8';
                return '#0C6B37';
              }}
              maskColor="rgba(240, 245, 242, 0.7)"
              style={{ border: '1px solid #DDE7E1', borderRadius: 10 }}
            />
          </ReactFlow>
        </div>
      ) : (
        /* Dashboard Grid View (Responsive CSS Grid) */
        <div style={{ flex: 1, overflowY: 'auto', background: '#F8FAF9', padding: '24px 32px' }}>
          {/* BOSS Section */}
          {chartData?.boss && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: 32,
              }}
            >
              <BossNode data={{ boss: chartData.boss }} />
              <div
                style={{
                  width: 2,
                  height: 28,
                  background: '#D97706',
                  marginTop: 6,
                }}
              />
            </div>
          )}

          {/* Department Sections & Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {visibleGridDepartments.map((dept) => {
              const deptTeams = dept.teams.filter((t) => {
                if (teamFilterId !== 'ALL' && String(t.id) !== String(teamFilterId)) return false;
                if (!searchKeyword) return true;
                const kw = searchKeyword.toLowerCase();
                const teamMatch =
                  t.name.toLowerCase().includes(kw) ||
                  t.code.toLowerCase().includes(kw) ||
                  (t.leader && t.leader.fullName.toLowerCase().includes(kw));
                const memberMatch = t.members.some(
                  (m) =>
                    m.fullName.toLowerCase().includes(kw) ||
                    m.employeeCode.toLowerCase().includes(kw) ||
                    (m.positionName && m.positionName.toLowerCase().includes(kw)),
                );
                return teamMatch || memberMatch;
              });

              return (
                <div key={dept.key}>
                  {/* Department Banner */}
                  <div
                    style={{
                      background: dept.bg,
                      border: `1.5px solid ${dept.border}`,
                      borderRadius: 14,
                      padding: '14px 20px',
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: dept.color,
                          color: '#FFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                        }}
                      >
                        {dept.icon}
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            color: dept.color,
                            letterSpacing: '0.5px',
                          }}
                        >
                          {dept.label}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280' }}>{dept.subLabel}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16 }}>
                      <Tag color="default" style={{ padding: '4px 10px', fontSize: 12 }}>
                        Số Teams: <b>{deptTeams.length}</b>
                      </Tag>
                      <Tag color="success" style={{ padding: '4px 10px', fontSize: 12 }}>
                        Tổng nhân sự: <b>{dept.memberCount}</b>
                      </Tag>
                    </div>
                  </div>

                  {/* Responsive Grid: 3-4 teams/row desktop, 2 tablet, 1 mobile */}
                  {deptTeams.length === 0 ? (
                    <Empty
                      description="Không tìm thấy Team nào phù hợp bộ lọc"
                      style={{ padding: 24 }}
                    />
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: 24,
                        alignItems: 'start',
                      }}
                    >
                      {deptTeams.map((team) => (
                        <div key={team.id} style={{ display: 'flex', justifyContent: 'center' }}>
                          <TeamCardView
                            team={team}
                            isCollapsed={collapsedTeamIds.has(team.id)}
                            onToggleCollapse={handleToggleCollapse}
                            onDragStartMember={handleDragStartMember}
                            onDropMemberOnTeam={handleDropMemberOnTeam}
                            draggedMember={draggedMember}
                            isDragOver={dragOverTeamId === team.id}
                            onDragEnterTeam={handleDragEnterTeam}
                            onDragLeaveTeam={handleDragLeaveTeam}
                            onOpenMemberDetail={handleOpenMemberDetail}
                            onOpenMoveModal={handleOpenMoveModal}
                            searchKeyword={searchKeyword}
                            hasHandle={false}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal 1: Confirm Move Member (via Drag & Drop) */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SwapOutlined style={{ color: '#0C6B37' }} />
            <span>Xác nhận điều chuyển nhân sự</span>
          </div>
        }
        open={confirmMoveModalOpen}
        onCancel={() => {
          setConfirmMoveModalOpen(false);
          setPendingMoveData(null);
          setMoveReason('');
        }}
        onOk={handleConfirmMove}
        confirmLoading={moveMutation.isPending}
        okText="Xác nhận chuyển"
        cancelText="Hủy"
        okButtonProps={{ style: { backgroundColor: '#0C6B37', fontWeight: 600 } }}
      >
        {pendingMoveData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {/* Cross-Department Warning if applicable */}
            {pendingMoveData.sourceTeam.department.toUpperCase() !==
              pendingMoveData.targetTeam.department.toUpperCase() && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message="Lưu ý: Chuyển nhân sự liên phòng ban"
                description={`Bạn đang chuyển nhân viên từ phòng ban [${pendingMoveData.sourceTeam.department}] sang [${pendingMoveData.targetTeam.department}]. Hệ thống sẽ áp dụng quy tắc kiểm toán liên phòng ban.`}
              />
            )}

            {/* Employee Card Overview */}
            <div
              style={{
                background: '#F7FAF8',
                borderRadius: 12,
                padding: 14,
                border: '1px solid #DDE7E1',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Avatar
                size={46}
                style={{ backgroundColor: '#0C6B37', fontWeight: 700, fontSize: 18 }}
              >
                {pendingMoveData.employee.fullName.charAt(0).toUpperCase()}
              </Avatar>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#18211C' }}>
                  {pendingMoveData.employee.fullName}
                </div>
                <div style={{ fontSize: 12, color: '#66736B' }}>
                  Mã NV: <Tag color="blue">{pendingMoveData.employee.employeeCode}</Tag>
                  Chức vụ: <b>{pendingMoveData.employee.positionName || 'Nhân viên'}</b>
                </div>
              </div>
            </div>

            {/* Transfer Visual */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#FFF',
                borderRadius: 10,
                border: '1px solid #EEF4F0',
              }}
            >
              <div style={{ textAlign: 'center', flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>NHÓM HIỆN TẠI</Text>
                <div style={{ fontWeight: 700, color: '#E1523A', marginTop: 2 }}>
                  {pendingMoveData.sourceTeam.name}
                </div>
                <Tag style={{ marginTop: 4 }}>{pendingMoveData.sourceTeam.department}</Tag>
              </div>

              <SwapOutlined style={{ fontSize: 20, color: '#0C6B37', margin: '0 12px' }} />

              <div style={{ textAlign: 'center', flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>NHÓM MỚI</Text>
                <div style={{ fontWeight: 700, color: '#0C6B37', marginTop: 2 }}>
                  {pendingMoveData.targetTeam.name}
                </div>
                <Tag color="green" style={{ marginTop: 4 }}>
                  {pendingMoveData.targetTeam.department}
                </Tag>
              </div>
            </div>

            {/* Transaction Explanation Note */}
            <div
              style={{
                fontSize: 11,
                color: '#66736B',
                background: '#F9FAFB',
                padding: '10px 12px',
                borderRadius: 8,
                lineHeight: 1.5,
              }}
            >
              <InfoCircleOutlined style={{ marginRight: 6, color: '#10B981' }} />
              Thao tác này sẽ thực hiện <b>Database Transaction</b>: đóng phân công nhóm cũ và mở
              phân công nhóm mới trong cùng phòng ban, lưu vết Audit Log.
            </div>

            {/* Reason Input */}
            <div>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Lý do điều chuyển (tùy chọn):
              </Text>
              <Input.TextArea
                rows={2}
                placeholder="Nhập ghi chú hoặc lý do chuyển nhóm..."
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal 2: Direct Move Member without drag (via Action Menu "...") */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SwapOutlined style={{ color: '#0C6B37' }} />
            <span>Chuyển Team: {selectedMemberToMove?.employee.fullName}</span>
          </div>
        }
        open={manualMoveModalOpen}
        onCancel={() => {
          setManualMoveModalOpen(false);
          setSelectedMemberToMove(null);
          setManualTargetTeamId(null);
          setManualMoveReason('');
        }}
        onOk={handleConfirmManualMove}
        confirmLoading={moveMutation.isPending}
        okText="Xác nhận chuyển"
        cancelText="Hủy"
        okButtonProps={{ style: { backgroundColor: '#0C6B37', fontWeight: 600 } }}
      >
        {selectedMemberToMove && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
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
                {selectedMemberToMove.employee.fullName.charAt(0).toUpperCase()}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#18211C' }}>
                  {selectedMemberToMove.employee.fullName}
                </div>
                <div style={{ fontSize: 12, color: '#66736B' }}>
                  Mã: <Tag color="blue">{selectedMemberToMove.employee.employeeCode}</Tag> | Nhóm
                  hiện tại: <b>{selectedMemberToMove.sourceTeam.name}</b> (
                  {selectedMemberToMove.sourceTeam.department})
                </div>
              </div>
            </div>

            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                Chọn Team tiếp nhận (Cùng phòng ban {selectedMemberToMove.sourceTeam.department}):
              </Text>
              <Select
                placeholder="Chọn Team đích tiếp nhận..."
                style={{ width: '100%' }}
                value={manualTargetTeamId}
                onChange={setManualTargetTeamId}
                options={eligibleManualTargetTeams.map((t) => ({
                  value: t.id,
                  label: `${t.name} (Trưởng nhóm: ${t.leader ? t.leader.fullName : 'Chưa có'} | ${t.members.length} thành viên)`,
                }))}
              />
              {eligibleManualTargetTeams.length === 0 && (
                <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Hiện không có Team khác trong cùng phòng ban để chuyển.
                </Text>
              )}
            </div>

            <div>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Lý do điều chuyển (tùy chọn):
              </Text>
              <Input.TextArea
                rows={2}
                placeholder="Nhập lý do điều chuyển nhân sự..."
                value={manualMoveReason}
                onChange={(e) => setManualMoveReason(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Drawer: Member Detail Profile */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserOutlined style={{ color: '#0C6B37' }} />
            <span>Hồ Sơ Nhân Sự</span>
          </div>
        }
        placement="right"
        width={400}
        open={Boolean(selectedMemberForDetail)}
        onClose={() => setSelectedMemberForDetail(null)}
      >
        {selectedMemberForDetail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header Profile Card */}
            <div
              style={{
                textAlign: 'center',
                padding: '20px 16px',
                background: '#F8FAF9',
                borderRadius: 12,
                border: '1px solid #DDE7E1',
              }}
            >
              <Avatar
                size={64}
                style={{
                  backgroundColor: '#0C6B37',
                  fontSize: 24,
                  fontWeight: 800,
                  marginBottom: 12,
                }}
              >
                {selectedMemberForDetail.employee.fullName.charAt(0).toUpperCase()}
              </Avatar>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#18211C' }}>
                {selectedMemberForDetail.employee.fullName}
              </div>
              <div style={{ fontSize: 13, color: '#66736B', marginTop: 2 }}>
                {selectedMemberForDetail.employee.positionName || 'Nhân viên'}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <Tag color="blue">{selectedMemberForDetail.employee.employeeCode}</Tag>
                <Tag color="success">
                  {selectedMemberForDetail.employee.status === 'ACTIVE'
                    ? 'Hoạt động'
                    : selectedMemberForDetail.employee.status}
                </Tag>
              </div>
            </div>

            {/* Profile Info Table */}
            <Descriptions title="Thông tin cơ cấu" column={1} size="small" bordered>
              <Descriptions.Item label="Phòng Ban">
                <Tag color="green">{selectedMemberForDetail.team.department}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Nhóm công tác">
                <b>{selectedMemberForDetail.team.name}</b>
              </Descriptions.Item>
              <Descriptions.Item label="Trưởng Team">
                {selectedMemberForDetail.team.leader?.fullName || 'Chưa có'}
              </Descriptions.Item>
              <Descriptions.Item label="Vai trò hệ thống">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selectedMemberForDetail.employee.roles.map((r) => (
                    <Tag key={r} color="purple">
                      {r}
                    </Tag>
                  ))}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">
                {selectedMemberForDetail.employee.phone || 'Chưa cập nhật'}
              </Descriptions.Item>
            </Descriptions>

            {/* Quick Action Button */}
            <Button
              type="primary"
              icon={<SwapOutlined />}
              onClick={() => {
                const item = selectedMemberForDetail;
                setSelectedMemberForDetail(null);
                handleOpenMoveModal(item.employee, item.team);
              }}
              style={{ backgroundColor: '#0C6B37', fontWeight: 600 }}
              block
            >
              Chuyển Sang Team Khác
            </Button>
          </div>
        )}
      </Drawer>

      {/* Drawer: External Staff (ADMIN, ACCOUNTANT, Corporate support) */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined style={{ color: '#4B5563' }} />
            <span>Nhân Sự Ngoài Cơ Cấu Quản Lý Trực Tiếp</span>
          </div>
        }
        placement="right"
        width={420}
        open={externalStaffDrawerOpen}
        onClose={() => setExternalStaffDrawerOpen(false)}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Vị trí Executive / Corporate Support"
          description="Các tài khoản ADMIN và KẾ TOÁN (ACCOUNTANT) không nằm trong cây quản lý phân cấp kinh doanh/kỹ thuật trực tiếp của BOSS."
        />

        {chartData?.externalStaff.length === 0 ? (
          <Empty description="Không có nhân sự ngoài cơ cấu" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chartData?.externalStaff.map((staff) => (
              <Card key={staff.employeeId} size="small" style={{ borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar size={38} style={{ backgroundColor: '#4B5563', fontWeight: 700 }}>
                    {staff.fullName.charAt(0).toUpperCase()}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#18211C' }}>
                      {staff.fullName}
                    </div>
                    <div style={{ fontSize: 11, color: '#66736B' }}>
                      <Tag color="default">{staff.employeeCode}</Tag>
                      <span>{staff.positionName || 'Chuyên viên'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {staff.roles.map((r) => (
                        <Tag key={r} color="purple" style={{ fontSize: 9, margin: 0 }}>
                          {r}
                        </Tag>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export const OrganizationChartPage: React.FC = () => {
  return (
    <ReactFlowProvider>
      <OrganizationChartPageContent />
    </ReactFlowProvider>
  );
};
