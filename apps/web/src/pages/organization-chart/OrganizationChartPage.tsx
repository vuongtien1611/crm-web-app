import React, { useState, useMemo, useCallback, useRef } from 'react';
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
} from 'antd';
import {
  CrownOutlined,
  SearchOutlined,
  ApartmentOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  AimOutlined,
  UpOutlined,
  DownOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  CheckCircleOutlined,
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
  changeOrgChartLeader,
  OrgChartResponse,
  OrgEmployeeCard,
  OrgTeamData,
} from '../../api/organizationChart';

const { Title, Text } = Typography;

// Color palette per department
const DEPT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  SALES: { label: 'Kinh Doanh', color: '#0C6B37', bg: '#F2F8F4', border: '#B7DFC6' },
  DEV: { label: 'Lập Trình / Kỹ Thuật', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  SEO: { label: 'Marketing / SEO', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  OPERATION: { label: 'Vận Hành', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
  BOD: { label: 'Ban Giám Đốc', color: '#B45309', bg: '#FEF3C7', border: '#F59E0B' },
  EXECUTIVE_SUPPORT: { label: 'Ngoài cơ cấu quản lý', color: '#6B7280', bg: '#F3F4F6', border: '#D1D5DB' },
};

// ============================================================================
// 1. CUSTOM REACT FLOW NODES
// ============================================================================

interface BossNodeData {
  boss: OrgEmployeeCard;
  isSearchMatch?: boolean;
}

const BossNode: React.FC<{ data: BossNodeData }> = ({ data }) => {
  const { boss, isSearchMatch } = data;
  return (
    <div
      style={{
        width: 320,
        background: 'linear-gradient(135deg, #FFFDF5 0%, #FFFFFF 100%)',
        borderRadius: 16,
        border: isSearchMatch ? '3px solid #f59e0b' : '2px solid #D97706',
        boxShadow: isSearchMatch
          ? '0 0 20px rgba(245, 158, 11, 0.4)'
          : '0 10px 25px -5px rgba(217, 119, 6, 0.15)',
        padding: 16,
        position: 'relative',
        cursor: 'default',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
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
          padding: '2px 14px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          boxShadow: '0 2px 6px rgba(217, 119, 6, 0.3)',
        }}
      >
        <CrownOutlined style={{ fontSize: 13, color: '#FEF3C7' }} /> TỔNG GIÁM ĐỐC (BOSS)
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
        <Avatar
          size={54}
          style={{
            background: 'linear-gradient(135deg, #D97706 0%, #92400E 100%)',
            color: '#FFF',
            fontSize: 22,
            fontWeight: 800,
            boxShadow: '0 4px 10px rgba(217, 119, 6, 0.25)',
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

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: '#D97706',
          width: 10,
          height: 10,
          border: '2px solid #FFF',
        }}
      />
    </div>
  );
};

interface TeamNodeData {
  team: OrgTeamData;
  isCollapsed: boolean;
  onToggleCollapse: (teamId: string) => void;
  onOpenChangeLeaderModal: (team: OrgTeamData) => void;
  onDragStartMember: (member: OrgEmployeeCard, sourceTeam: OrgTeamData) => void;
  onDropMemberOnTeam: (targetTeam: OrgTeamData) => void;
  draggedMember: { employee: OrgEmployeeCard; sourceTeam: OrgTeamData } | null;
  isDragOver: boolean;
  onDragEnterTeam: (teamId: string) => void;
  onDragLeaveTeam: (teamId: string) => void;
  searchKeyword?: string;
}

const TeamNode: React.FC<{ data: TeamNodeData }> = ({ data }) => {
  const {
    team,
    isCollapsed,
    onToggleCollapse,
    onOpenChangeLeaderModal,
    onDragStartMember,
    onDropMemberOnTeam,
    draggedMember,
    isDragOver,
    onDragEnterTeam,
    onDragLeaveTeam,
    searchKeyword = '',
  } = data;

  const deptConf = DEPT_CONFIG[team.department.toUpperCase()] || {
    label: team.department,
    color: '#0C6B37',
    bg: '#F2F8F4',
    border: '#DDE7E1',
  };

  const isCrossDeptWithDragged =
    draggedMember &&
    (draggedMember.sourceTeam.department || '').toUpperCase() !==
      (team.department || '').toUpperCase();

  const isSameTeamWithDragged =
    draggedMember && String(draggedMember.sourceTeam.id) === String(team.id);

  // Target team khác department KHÔNG cho phép drop
  const canDropHere = Boolean(draggedMember && !isSameTeamWithDragged && !isCrossDeptWithDragged);

  const isTeamMatch =
    searchKeyword &&
    (team.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      team.code.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (team.leader && team.leader.fullName.toLowerCase().includes(searchKeyword.toLowerCase())));

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
          message.warning('Chưa hỗ trợ điều chuyển liên phòng ban (CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED)');
          return;
        }
        if (canDropHere) {
          onDropMemberOnTeam(team);
        }
      }}
      style={{
        width: 330,
        background: '#FFFFFF',
        borderRadius: 16,
        border: isDragOver
          ? canDropHere
            ? '2px dashed #0C6B37'
            : '2px dashed #EF4444'
          : isTeamMatch
          ? '2px solid #F59E0B'
          : '1px solid #DDE7E1',
        boxShadow: isDragOver
          ? canDropHere
            ? '0 0 20px rgba(12, 107, 55, 0.25)'
            : '0 0 20px rgba(239, 68, 68, 0.25)'
          : '0 8px 24px -4px rgba(0, 0, 0, 0.06)',
        overflow: 'hidden',
        transition: 'all 0.25s ease',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: deptConf.color,
          width: 10,
          height: 10,
          border: '2px solid #FFF',
        }}
      />

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
            count={team.memberCount}
            overflowCount={99}
            style={{
              backgroundColor: deptConf.color,
              color: '#FFF',
              fontSize: 11,
              fontWeight: 700,
            }}
          />
          <Button
            type="text"
            size="small"
            icon={isCollapsed ? <DownOutlined /> : <UpOutlined />}
            onClick={() => onToggleCollapse(team.id)}
            style={{ color: '#66736B' }}
          />
        </div>
      </div>

      {/* Drop Zone Visual Highlight Indicator */}
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
          <WarningOutlined /> Chưa hỗ trợ điều chuyển liên phòng ban
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

      {/* Team Leader Section */}
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
            <CrownOutlined style={{ color: '#F59E0B' }} /> TRƯỞNG NHÓM (LEADER)
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
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 500 }}>
                {team.leader.positionName || 'Trưởng nhóm'}
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

      {/* Members Section (Collapsible) */}
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
            }}
          >
            <span>THÀNH VIÊN ({team.members.length})</span>
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>Kéo thẻ để chuyển</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {team.members.map((member) => {
                const isMemberMatch =
                  searchKeyword &&
                  (member.fullName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                    member.employeeCode.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                    (member.positionName &&
                      member.positionName.toLowerCase().includes(searchKeyword.toLowerCase())));

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
                      e.currentTarget.style.borderColor = '#0C6B37';
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
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.positionName || 'Nhân viên'}
                        </span>
                        <Tag color="success" style={{ margin: 0, fontSize: 9, padding: '0 3px', lineHeight: '14px' }}>
                          {member.status === 'ACTIVE' ? 'Hoạt động' : member.status}
                        </Tag>
                      </div>
                    </div>

                    <div style={{ color: '#9CA3AF', fontSize: 13, cursor: 'grab' }}>
                      <SwapOutlined />
                    </div>
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

const nodeTypes = {
  bossNode: BossNode,
  teamNode: TeamNode,
};

// ============================================================================
// 2. MAIN ORGANIZATION CHART COMPONENT
// ============================================================================

export const OrganizationChartPageContent: React.FC = () => {
  const queryClient = useQueryClient();
  const reactFlowInstance = useReactFlow();

  // Search & Filter State
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');

  // Collapse State for teams
  const [collapsedTeamIds, setCollapsedTeamIds] = useState<Set<string>>(new Set());

  // Drag & Drop State
  const [draggedMember, setDraggedMember] = useState<{
    employee: OrgEmployeeCard;
    sourceTeam: OrgTeamData;
  } | null>(null);

  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null);

  // Modals
  const [confirmMoveModalOpen, setConfirmMoveModalOpen] = useState(false);
  const [pendingMoveData, setPendingMoveData] = useState<{
    employee: OrgEmployeeCard;
    sourceTeam: OrgTeamData;
    targetTeam: OrgTeamData;
  } | null>(null);
  const [moveReason, setMoveReason] = useState<string>('');

  const [changeLeaderModalOpen, setChangeLeaderModalOpen] = useState(false);
  const [selectedTeamForLeader, setSelectedTeamForLeader] = useState<OrgTeamData | null>(null);
  const [selectedNewLeaderId, setSelectedNewLeaderId] = useState<string | null>(null);

  const [externalStaffDrawerOpen, setExternalStaffDrawerOpen] = useState(false);

  // -------------------------------------------------------------
  // DATA FETCHING (REACT QUERY)
  // -------------------------------------------------------------
  const { data: chartData, isLoading, isError, error, refetch } = useQuery<OrgChartResponse>({
    queryKey: ['organization-chart'],
    queryFn: fetchOrganizationChart,
  });

  // -------------------------------------------------------------
  // MUTATIONS (MOVE MEMBER & CHANGE LEADER)
  // -------------------------------------------------------------
  const moveMutation = useMutation({
    mutationFn: moveOrgChartMember,
    onSuccess: (data) => {
      message.success(data.message || 'Chuyển nhóm làm việc thành công');
      queryClient.invalidateQueries({ queryKey: ['organization-chart'] });
      setConfirmMoveModalOpen(false);
      setPendingMoveData(null);
      setMoveReason('');
      setDraggedMember(null);
      setDragOverTeamId(null);
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể chuyển nhóm cho nhân viên');
    },
  });

  const changeLeaderMutation = useMutation({
    mutationFn: changeOrgChartLeader,
    onSuccess: (data) => {
      message.success(data.message || 'Bổ nhiệm Trưởng nhóm thành công');
      queryClient.invalidateQueries({ queryKey: ['organization-chart'] });
      setChangeLeaderModalOpen(false);
      setSelectedTeamForLeader(null);
      setSelectedNewLeaderId(null);
    },
    onError: (err: any) => {
      message.error(err.message || 'Không thể đổi trưởng nhóm');
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

      // Open confirm modal with source & target details
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

  const handleOpenChangeLeaderModal = useCallback((team: OrgTeamData) => {
    setSelectedTeamForLeader(team);
    setSelectedNewLeaderId(null);
    setChangeLeaderModalOpen(true);
  }, []);

  const handleConfirmChangeLeader = () => {
    if (!selectedTeamForLeader || !selectedNewLeaderId) {
      message.warning('Vui lòng chọn nhân viên làm Trưởng nhóm mới');
      return;
    }
    changeLeaderMutation.mutate({
      teamId: selectedTeamForLeader.id,
      newLeaderEmployeeId: selectedNewLeaderId,
    });
  };

  // -------------------------------------------------------------
  // BUILD NODES AND EDGES FOR REACT FLOW
  // -------------------------------------------------------------
  const { nodes, edges } = useMemo(() => {
    if (!chartData || !chartData.boss) {
      return { nodes: [], edges: [] };
    }

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Filter teams by department
    const visibleTeams = chartData.teams.filter((t) => {
      if (departmentFilter === 'ALL') return true;
      return t.department.toUpperCase() === departmentFilter.toUpperCase();
    });

    const isBossSearchMatch =
      searchKeyword &&
      (chartData.boss.fullName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        chartData.boss.employeeCode.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (chartData.boss.positionName &&
          chartData.boss.positionName.toLowerCase().includes(searchKeyword.toLowerCase())));

    // Calculate layout coordinates
    const TEAM_CARD_WIDTH = 330;
    const HORIZONTAL_GAP = 50;
    const VERTICAL_LEVEL_1 = 200;

    const totalWidth =
      visibleTeams.length * TEAM_CARD_WIDTH + Math.max(0, visibleTeams.length - 1) * HORIZONTAL_GAP;
    const startX = -(totalWidth / 2) + TEAM_CARD_WIDTH / 2;

    // 1. Root Node: BOSS
    flowNodes.push({
      id: 'node-boss',
      type: 'bossNode',
      position: { x: -160, y: 20 },
      data: {
        boss: chartData.boss,
        isSearchMatch: Boolean(isBossSearchMatch),
      },
    });

    // 2. Team Nodes & Connecting Edges
    visibleTeams.forEach((team, index) => {
      const nodeX = startX + index * (TEAM_CARD_WIDTH + HORIZONTAL_GAP) - TEAM_CARD_WIDTH / 2;
      const nodeY = VERTICAL_LEVEL_1;

      flowNodes.push({
        id: `node-team-${team.id}`,
        type: 'teamNode',
        position: { x: nodeX, y: nodeY },
        data: {
          team,
          isCollapsed: collapsedTeamIds.has(team.id),
          onToggleCollapse: handleToggleCollapse,
          onOpenChangeLeaderModal: handleOpenChangeLeaderModal,
          onDragStartMember: handleDragStartMember,
          onDropMemberOnTeam: handleDropMemberOnTeam,
          draggedMember,
          isDragOver: dragOverTeamId === team.id,
          onDragEnterTeam: handleDragEnterTeam,
          onDragLeaveTeam: handleDragLeaveTeam,
          searchKeyword,
        },
      });

      // Edge from BOSS to Team Node
      const deptConf = DEPT_CONFIG[team.department.toUpperCase()] || { color: '#0C6B37' };
      flowEdges.push({
        id: `edge-boss-team-${team.id}`,
        source: 'node-boss',
        target: `node-team-${team.id}`,
        type: 'smoothstep',
        style: { stroke: deptConf.color, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: deptConf.color,
        },
      });
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [
    chartData,
    departmentFilter,
    collapsedTeamIds,
    searchKeyword,
    draggedMember,
    dragOverTeamId,
    handleToggleCollapse,
    handleOpenChangeLeaderModal,
    handleDragStartMember,
    handleDropMemberOnTeam,
    handleDragEnterTeam,
    handleDragLeaveTeam,
  ]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  // Sync state when nodes/edges recalculate
  React.useEffect(() => {
    setRfNodes(nodes);
  }, [nodes, setRfNodes]);

  React.useEffect(() => {
    setRfEdges(edges);
  }, [edges, setRfEdges]);

  // Candidates for leader replacement in the selected team
  const eligibleLeaderCandidates = useMemo(() => {
    if (!selectedTeamForLeader || !chartData) return [];
    // Regular members of the team + all eligible employees from externalStaff/members
    const teamMembers = selectedTeamForLeader.members || [];
    return teamMembers;
  }, [selectedTeamForLeader, chartData]);

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
          description={(error as any)?.message || 'Vui lòng kiểm tra quyền BOSS hoặc kết nối máy chủ.'}
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

  return (
    <div style={{ height: 'calc(100vh - 84px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header & Toolbar */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #DDE7E1',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          zIndex: 10,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
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
                Cơ cấu nhân sự công ty trực quan &amp; Kéo thả điều chuyển thành viên giữa các Team
              </Text>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#9CA3AF' }} />}
            placeholder="Tìm theo tên, mã NV, chức vụ..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
            style={{ width: 230 }}
          />

          <Select
            value={departmentFilter}
            onChange={setDepartmentFilter}
            style={{ width: 170 }}
            options={[
              { value: 'ALL', label: 'Tất cả phòng ban' },
              { value: 'SALES', label: 'Phòng Kinh Doanh' },
              { value: 'DEV', label: 'Phòng Lập Trình' },
              { value: 'SEO', label: 'Phòng SEO / MKT' },
            ]}
          />

          <Space>
            <Tooltip title="Thu gọn tất cả">
              <Button icon={<UpOutlined />} onClick={handleCollapseAll} />
            </Tooltip>
            <Tooltip title="Mở rộng tất cả">
              <Button icon={<DownOutlined />} onClick={handleExpandAll} />
            </Tooltip>
            <Tooltip title="Thu phóng vừa màn hình">
              <Button icon={<AimOutlined />} onClick={() => reactFlowInstance.fitView({ padding: 0.2 })} />
            </Tooltip>
            <Tooltip title="Tải lại sơ đồ">
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            </Tooltip>
          </Space>

          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => setExternalStaffDrawerOpen(true)}
            style={{ borderColor: '#D1D5DB', fontWeight: 600 }}
          >
            Ngoài cơ cấu ({chartData?.externalStaff.length || 0})
          </Button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div style={{ flex: 1, position: 'relative', background: '#F8FAF9' }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.25}
          maxZoom={1.8}
        >
          <Background color="#DDE7E1" gap={20} size={1.2} />
          <Controls position="bottom-right" />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'bossNode') return '#F59E0B';
              return '#0C6B37';
            }}
            maskColor="rgba(240, 245, 242, 0.7)"
            style={{ border: '1px solid #DDE7E1', borderRadius: 10 }}
          />
        </ReactFlow>
      </div>

      {/* Confirm Move Member Modal */}
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
                description={`Bạn đang chuyển nhân viên từ phòng ban [${pendingMoveData.sourceTeam.department}] sang [${pendingMoveData.targetTeam.department}]. Hệ thống sẽ ghi nhận cờ kiểm toán liên phòng ban (is_cross_department).`}
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
              <Avatar size={46} style={{ backgroundColor: '#0C6B37', fontWeight: 700, fontSize: 18 }}>
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
              Thao tác này sẽ thực hiện <b>Database Transaction</b>: đóng hiệu lực phân công nhóm cũ (tại thời điểm hiện
              tại) và mở phân công nhóm mới, đồng thời lưu vết lịch sử kiểm toán (Audit Log).
            </div>

            {/* Reason Input */}
            <div>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Lý do điều chuyển (tùy chọn):
              </Text>
              <Input.TextArea
                rows={2}
                placeholder="Nhập ghi chú hoặc căn cứ điều chuyển..."
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Change Team Leader Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CrownOutlined style={{ color: '#F59E0B' }} />
            <span>Đổi Trưởng Nhóm: {selectedTeamForLeader?.name}</span>
          </div>
        }
        open={changeLeaderModalOpen}
        onCancel={() => {
          setChangeLeaderModalOpen(false);
          setSelectedTeamForLeader(null);
          setSelectedNewLeaderId(null);
        }}
        onOk={handleConfirmChangeLeader}
        confirmLoading={changeLeaderMutation.isPending}
        okText="Bổ nhiệm Trưởng nhóm"
        cancelText="Hủy"
        okButtonProps={{ style: { backgroundColor: '#F59E0B', borderColor: '#F59E0B', fontWeight: 600 } }}
      >
        {selectedTeamForLeader && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <Alert
              type="info"
              showIcon
              message="Chính sách bổ nhiệm Trưởng nhóm"
              description="Theo quy chuẩn Canonical: Việc thay đổi Trưởng nhóm được thực hiện qua hành động riêng biệt, giữ nguyên role/position tài khoản và lưu vết temporal history."
            />

            <div>
              <Text style={{ fontSize: 12, color: '#66736B' }}>Trưởng nhóm hiện tại:</Text>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#18211C', marginTop: 2 }}>
                {selectedTeamForLeader.leader
                  ? `${selectedTeamForLeader.leader.fullName} (${selectedTeamForLeader.leader.employeeCode})`
                  : 'Chưa có Trưởng nhóm'}
              </div>
            </div>

            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                Chọn nhân sự làm Trưởng nhóm mới:
              </Text>
              <Select
                placeholder="Chọn nhân viên từ nhóm..."
                style={{ width: '100%' }}
                value={selectedNewLeaderId}
                onChange={setSelectedNewLeaderId}
                options={eligibleLeaderCandidates.map((m) => ({
                  value: m.employeeId,
                  label: `${m.fullName} - ${m.employeeCode} (${m.positionName || 'Nhân viên'})`,
                }))}
              />
              {eligibleLeaderCandidates.length === 0 && (
                <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Nhóm này hiện chưa có thành viên nào để bổ nhiệm làm Trưởng nhóm.
                </Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* External Staff Drawer (ADMIN, ACCOUNTANT, Corporate support) */}
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
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#18211C' }}>{staff.fullName}</div>
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
