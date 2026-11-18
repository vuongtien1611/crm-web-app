import { useMemo, type ReactNode } from 'react';
import { MarkerType } from 'reactflow';
import type { Edge, Node } from 'reactflow';
import type { OrgChartResponse, OrgEmployeeCard, OrgTeamData } from '../../api/organizationChart';

export interface DepartmentGroup {
  key: string;
  label: string;
  subLabel: string;
  color: string;
  bg: string;
  border: string;
  icon: ReactNode;
  teams: OrgTeamData[];
  teamCount: number;
  memberCount: number;
}

interface OrganizationChartGraphOptions {
  chartData: OrgChartResponse | undefined;
  groupedDepartments: DepartmentGroup[];
  departmentFilter: string;
  teamFilterId: string;
  collapsedTeamIds: Set<string>;
  searchKeyword: string;
  draggedMember: { employee: OrgEmployeeCard; sourceTeam: OrgTeamData } | null;
  dragOverTeamId: string | null;
  handleToggleCollapse: (teamId: string) => void;
  handleDragStartMember: (member: OrgEmployeeCard, sourceTeam: OrgTeamData) => void;
  handleDropMemberOnTeam: (targetTeam: OrgTeamData) => void | Promise<void>;
  handleDragEnterTeam: (teamId: string) => void;
  handleDragLeaveTeam: (teamId: string) => void;
  handleOpenMemberDetail: (member: OrgEmployeeCard, team: OrgTeamData) => void;
  handleOpenMoveModal: (member: OrgEmployeeCard, team: OrgTeamData) => void | Promise<void>;
}

export const useOrganizationChartGraph = ({
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
}: OrganizationChartGraphOptions) =>
  useMemo(() => {
    if (!chartData || !chartData.boss) {
      return { nodes: [], edges: [] };
    }

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

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

    const TEAM_WIDTH = 330;
    const TEAM_GAP_X = 32;
    const TEAM_GAP_Y = 36;
    const TEAM_EST_HEIGHT = 420;
    const DEPT_WIDTH = 320;
    const DEPT_GAP_X = 64;

    const BOSS_Y = 30;
    const DEPT_Y = 220;
    const TEAMS_START_Y = 400;

    const branchConfigs = visibleDepts.map((dept) => {
      const filteredTeams = dept.teams.filter((team) => {
        if (teamFilterId !== 'ALL' && String(team.id) !== String(teamFilterId)) return false;
        if (!searchKeyword) return true;
        const keyword = searchKeyword.toLowerCase();
        const teamMatch =
          team.name.toLowerCase().includes(keyword) ||
          team.code.toLowerCase().includes(keyword) ||
          (team.leader && team.leader.fullName.toLowerCase().includes(keyword));
        const memberMatch = team.members.some(
          (member) =>
            member.fullName.toLowerCase().includes(keyword) ||
            member.employeeCode.toLowerCase().includes(keyword) ||
            (member.positionName && member.positionName.toLowerCase().includes(keyword)),
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

      return { dept, filteredTeams, cols, branchWidth };
    });

    const totalBranchesWidth =
      branchConfigs.reduce((sum, branch) => sum + branch.branchWidth, 0) +
      Math.max(0, branchConfigs.length - 1) * DEPT_GAP_X;

    let currentBranchLeft = -totalBranchesWidth / 2;

    flowNodes.push({
      id: 'node-boss',
      type: 'bossNode',
      position: { x: -170, y: BOSS_Y },
      data: {
        boss: chartData.boss,
        isSearchMatch: Boolean(isBossSearchMatch),
      },
    });

    branchConfigs.forEach(({ dept, filteredTeams, cols, branchWidth }) => {
      const branchCenter = currentBranchLeft + branchWidth / 2;
      const deptNodeX = branchCenter - DEPT_WIDTH / 2;

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

      const teamsGridWidth = cols * TEAM_WIDTH + Math.max(0, cols - 1) * TEAM_GAP_X;
      const teamsStartLeft = branchCenter - teamsGridWidth / 2;

      filteredTeams.forEach((team, teamIndex) => {
        const row = Math.floor(teamIndex / cols);
        const col = teamIndex % cols;
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
