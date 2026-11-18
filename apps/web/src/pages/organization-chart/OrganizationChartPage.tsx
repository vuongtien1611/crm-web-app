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
  App,
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
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  fetchOrganizationChart,
  moveOrgChartMember,
  fetchEmployeeWorkload,
  EmployeeWorkloadResponse,
  OrgChartResponse,
  OrgEmployeeCard,
  OrgTeamData,
} from '../../api/organizationChart';

const { Title, Text } = Typography;

import {
  BossNode,
  DEFAULT_DEPT,
  DEPT_METADATA,
  TeamCardView,
  nodeTypes,
} from './OrganizationChartNodes';
import { useOrganizationChartGraph, type DepartmentGroup } from './useOrganizationChartGraph';

// ============================================================================
// 2. MAIN ORGANIZATION CHART COMPONENT
// ============================================================================

export const OrganizationChartPageContent: React.FC = () => {
  const { message } = App.useApp();
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

  // Pre-transfer Workload & Warning State
  const [workload, setWorkload] = useState<EmployeeWorkloadResponse | null>(null);
  const [loadingWorkload, setLoadingWorkload] = useState<boolean>(false);

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
      setWorkload(null);
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
    async (targetTeam: OrgTeamData) => {
      if (!draggedMember) return;

      if (String(draggedMember.sourceTeam.id) === String(targetTeam.id)) {
        message.info(`Nhân viên ${draggedMember.employee.fullName} đã thuộc nhóm này`);
        setDraggedMember(null);
        setDragOverTeamId(null);
        return;
      }

      const validDepts = ['SALES', 'DEV', 'SEO'];
      if (!validDepts.includes((targetTeam.department || '').toUpperCase())) {
        message.error(`Không thể chuyển nhân sự vào phòng ban [${targetTeam.department}]. Chỉ hỗ trợ SALES, DEV, SEO.`);
        setDraggedMember(null);
        setDragOverTeamId(null);
        return;
      }

      const isCross =
        (draggedMember.sourceTeam.department || '').toUpperCase() !==
        (targetTeam.department || '').toUpperCase();

      // Open confirm modal
      setPendingMoveData({
        employee: draggedMember.employee,
        sourceTeam: draggedMember.sourceTeam,
        targetTeam,
      });
      setConfirmMoveModalOpen(true);
      setDragOverTeamId(null);
      setWorkload(null);

      // Load employee workload to alert BOSS if active work exists
      try {
        setLoadingWorkload(true);
        const wl = await fetchEmployeeWorkload(draggedMember.employee.employeeId);
        setWorkload(wl);
      } catch (err) {
        console.error('Failed to load employee workload', err);
      } finally {
        setLoadingWorkload(false);
      }
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
    async (member: OrgEmployeeCard, team: OrgTeamData) => {
      setSelectedMemberToMove({ employee: member, sourceTeam: team });
      setManualTargetTeamId(null);
      setManualMoveReason('');
      setManualMoveModalOpen(true);
      setWorkload(null);

      try {
        setLoadingWorkload(true);
        const wl = await fetchEmployeeWorkload(member.employeeId);
        setWorkload(wl);
      } catch (err) {
        console.error('Failed to load employee workload', err);
      } finally {
        setLoadingWorkload(false);
      }
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
  const groupedDepartments = useMemo<DepartmentGroup[]>(() => {
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

  // Candidates for manual move (all valid teams in SALES, DEV, SEO except current team)
  const eligibleManualTargetTeams = useMemo(() => {
    if (!selectedMemberToMove || !chartData?.teams) return [];
    return chartData.teams.filter(
      (t) =>
        ['SALES', 'DEV', 'SEO'].includes((t.department || '').toUpperCase()) &&
        String(t.id) !== String(selectedMemberToMove.sourceTeam.id),
    );
  }, [selectedMemberToMove, chartData]);

  // -------------------------------------------------------------
  // BUILD HIERARCHICAL NODES AND EDGES FOR REACT FLOW
  // Level 0: BOSS
  // Level 1: Department Nodes (SALES, DEV, SEO)
  // Level 2: Team Nodes under each Department
  // -------------------------------------------------------------
  const { nodes, edges } = useOrganizationChartGraph({
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
  });

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
        destroyOnHidden
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
            {/* Cross Department Alert */}
            {pendingMoveData.sourceTeam.department.toUpperCase() !==
              pendingMoveData.targetTeam.department.toUpperCase() && (
              <div
                style={{
                  background: '#FEF3C7',
                  border: '1px solid #F59E0B',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ fontWeight: 700, color: '#92400E', fontSize: 13 }}>
                  ⚠️ Điều chuyển liên phòng ban: [{pendingMoveData.sourceTeam.department}] ➔ [
                  {pendingMoveData.targetTeam.department}]
                </div>
                <div style={{ fontSize: 12, color: '#78350F' }}>
                  Vai trò mới sau chuyển:{' '}
                  <Tag color="green">
                    {pendingMoveData.targetTeam.department.toUpperCase() === 'SALES'
                      ? 'Chuyên Viên Kinh Doanh (SALE)'
                      : pendingMoveData.targetTeam.department.toUpperCase() === 'DEV'
                        ? 'Lập Trình Viên / Kỹ Thuật (DEV)'
                        : 'Chuyên Viên SEO / Content (SEO)'}
                  </Tag>
                </div>
                <div style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                  Quyền truy cập và menu hệ thống của nhân viên sẽ tự động chuyển sang bộ phận mới. Toàn bộ lịch sử hoạt động cũ được bảo toàn.
                </div>
              </div>
            )}

            {/* Workload Warning Alert if active work exists */}
            {workload?.hasActiveWorkload && (
              <Alert
                type="warning"
                showIcon
                message="Cảnh báo: Nhân viên đang có công việc dở dang tại phòng ban cũ"
                description={
                  <div style={{ fontSize: 12 }}>
                    {workload.activeProjectsCount > 0 && (
                      <div>
                        • Đang tham gia <b>{workload.activeProjectsCount}</b> dự án (
                        {workload.activeProjects.map((p) => p.name).join(', ')})
                      </div>
                    )}
                    {workload.activeTasksCount > 0 && (
                      <div>
                        • Đang phụ trách <b>{workload.activeTasksCount}</b> nhiệm vụ chưa hoàn thành
                      </div>
                    )}
                    {workload.activeDealsCount > 0 && (
                      <div>
                        • Đang phụ trách <b>{workload.activeDealsCount}</b> hợp đồng/giao dịch chưa đóng
                      </div>
                    )}
                    <div style={{ marginTop: 4, fontStyle: 'italic' }}>
                      Lịch sử phân công cũ vẫn được giữ nguyên. Sau khi chuyển, nhân viên sẽ tuân theo phân quyền mới của phòng ban đích.
                    </div>
                  </div>
                }
              />
            )}

            {/* Team Leader Demotion Notice if employee is currently a leader */}
            {pendingMoveData.employee.isLeader && (
              <Alert
                type="info"
                showIcon
                message="Nhân viên hiện là Trưởng nhóm"
                description={`Khi chuyển sang nhóm mới [${pendingMoveData.targetTeam.name}], nhân viên sẽ đảm nhận vai trò Thành viên thường. Nhóm cũ [${pendingMoveData.sourceTeam.name}] sẽ tạm thời khuyết Trưởng nhóm.`}
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
              Thao tác này thực hiện <b>Database Transaction</b>: đóng phân công nhóm cũ và chức vụ cũ tại thời điểm hiện tại, tạo phân công nhóm mới, cập nhật vai trò hệ thống và lưu vết Audit Log.
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
            <span>Chuyển Bộ Phận / Team: {selectedMemberToMove?.employee.fullName}</span>
          </div>
        }
        open={manualMoveModalOpen}
        destroyOnHidden
        onCancel={() => {
          setManualMoveModalOpen(false);
          setSelectedMemberToMove(null);
          setManualTargetTeamId(null);
          setManualMoveReason('');
          setWorkload(null);
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
                  Mã: <Tag color="blue">{selectedMemberToMove.employee.employeeCode}</Tag> | Nhóm hiện tại: <b>{selectedMemberToMove.sourceTeam.name}</b> (
                  <Tag color="purple">{selectedMemberToMove.sourceTeam.department}</Tag>)
                </div>
              </div>
            </div>

            {/* Workload Warning Alert if active work exists */}
            {workload?.hasActiveWorkload && (
              <Alert
                type="warning"
                showIcon
                message="Cảnh báo khối lượng công việc đang phụ trách"
                description={
                  <div style={{ fontSize: 12 }}>
                    {workload.activeProjectsCount > 0 && (
                      <div>• Đang tham gia <b>{workload.activeProjectsCount}</b> dự án</div>
                    )}
                    {workload.activeTasksCount > 0 && (
                      <div>• Đang phụ trách <b>{workload.activeTasksCount}</b> nhiệm vụ dở dang</div>
                    )}
                    {workload.activeDealsCount > 0 && (
                      <div>• Đang phụ trách <b>{workload.activeDealsCount}</b> deals dở dang</div>
                    )}
                  </div>
                }
              />
            )}

            {/* Team Leader Notice */}
            {selectedMemberToMove.employee.isLeader && (
              <Alert
                type="info"
                showIcon
                message="Nhân viên hiện là Trưởng nhóm"
                description="Khi chuyển sang nhóm mới, nhân viên trở thành thành viên thường. Nhóm cũ sẽ tạm thời khuyết Trưởng nhóm."
              />
            )}

            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                Chọn Team tiếp nhận (Tất cả phòng ban):
              </Text>
              <Select
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                }
                placeholder="Tìm và chọn Team đích tiếp nhận..."
                style={{ width: '100%' }}
                value={manualTargetTeamId}
                onChange={setManualTargetTeamId}
                options={eligibleManualTargetTeams.map((t) => ({
                  value: t.id,
                  label: `[${t.department}] ${t.name} (Trưởng nhóm: ${t.leader ? t.leader.fullName : 'Chưa có'} | ${t.members.length} TV)`,
                }))}
              />
              {eligibleManualTargetTeams.length === 0 && (
                <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Hiện không có Team khác để chuyển.
                </Text>
              )}
            </div>

            {manualTargetTeamId && (() => {
              const tgt = chartData?.teams?.find((t) => String(t.id) === String(manualTargetTeamId));
              if (!tgt) return null;
              const isCross =
                (selectedMemberToMove.sourceTeam.department || '').toUpperCase() !==
                (tgt.department || '').toUpperCase();
              return (
                <div style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}>
                  <div>Đích đến: <b>{tgt.name}</b> (<Tag color="green">{tgt.department}</Tag>)</div>
                  {isCross ? (
                    <div style={{ marginTop: 4, color: '#B45309' }}>
                      ⚡ Chuyển liên phòng ban: Vai trò mới sẽ là <b>{
                        tgt.department.toUpperCase() === 'SALES'
                          ? 'Chuyên Viên Kinh Doanh (SALE)'
                          : tgt.department.toUpperCase() === 'DEV'
                            ? 'Lập Trình Viên (DEV)'
                            : 'Chuyên Viên SEO (SEO)'
                      }</b>. Phiên đăng nhập cũ sẽ được làm mới.
                    </div>
                  ) : (
                    <div style={{ marginTop: 4, color: '#047857' }}>
                      Chuyển nội bộ phòng ban {tgt.department}: Giữ nguyên chức danh và vai trò hiện tại.
                    </div>
                  )}
                </div>
              );
            })()}

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
              Chuyển Bộ Phận / Team Khác
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
