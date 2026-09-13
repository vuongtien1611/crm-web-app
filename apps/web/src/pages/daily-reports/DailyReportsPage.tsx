import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Space,
  Tag,
  Typography,
  Tabs,
  Row,
  Col,
  Tooltip,
  Select,
  Progress,
  App,
  Segmented,
  Avatar,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  LinkOutlined,
  ClearOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  SearchOutlined,
  RiseOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

import { useAuthStore } from '../../store/authStore';
import { DynamicOptionSelect } from '../../components/common/DynamicOptionSelect';
import { createRowActionHandler } from '../../utils/tableUtils';
import {
  DailyReportItem,
  DailyReportWorkItem,
  getDailyReportsApi,
  getDailyReportByIdApi,
  createDailyReportApi,
  updateDailyReportApi,
  getDailyReportStatsApi,
  getDailyReportFilterOptionsApi,
  getProjectWorkItemsApi,
  exportDailyReportsApi,
  DailyReportStats,
  DailyReportFilterOptions,
  ProjectWorkItem,
} from '../../api/dailyReports';
import {
  WeeklyReportRecord,
  getWeeklyReportsApi,
  getWeeklyReportByIdApi,
  createWeeklyReportApi,
  updateWeeklyReportApi,
  completeWeeklyReportApi,
  synthesizeWeeklyReportApi,
  downloadWeeklyReportExcel,
} from '../../api/weeklyReports';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

export const DailyReportsPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const roles = user?.roles || [];
  const isBoss = roles.includes('BOSS');
  const isAdmin = roles.includes('ADMIN');
  const isAdminOrBoss = isAdmin || isBoss;
  const isTeamLeader = roles.some((r) => r.includes('LEADER'));
  const canAccessWeekly = isBoss || isTeamLeader;
  const canAccessTeamDaily = isTeamLeader || isAdminOrBoss;

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const getInitialTab = (): string => {
    if (tabParam === 'weekly' && canAccessWeekly) return 'weekly';
    if (tabParam === 'project') return 'project';
    if (tabParam === 'overview') return 'overview';
    return 'daily';
  };

  const [activeTab, setActiveTab] = useState<string>(getInitialTab);
  const queryClient = useQueryClient();

  // Quick Date Preset
  type QuickDateType = 'today' | '7days' | 'thisWeek' | 'thisMonth' | 'custom';
  const [quickDate, setQuickDate] = useState<QuickDateType>('custom');

  // Default to September 2026 data range if testing, or current month
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(() => {
    // Default to current month
    return [dayjs().startOf('month'), dayjs().endOf('month')];
  });

  const handleQuickDateChange = (preset: QuickDateType) => {
    setQuickDate(preset);
    const now = dayjs();
    switch (preset) {
      case 'today':
        setDateRange([now.startOf('day'), now.endOf('day')]);
        break;
      case '7days':
        setDateRange([now.subtract(6, 'day').startOf('day'), now.endOf('day')]);
        break;
      case 'thisWeek':
        setDateRange([now.startOf('isoWeek'), now.endOf('isoWeek')]);
        break;
      case 'thisMonth':
        setDateRange([now.startOf('month'), now.endOf('month')]);
        break;
      case 'custom':
      default:
        break;
    }
  };

  const fromDate = dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined;
  const toDate = dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined;

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string | undefined>(undefined);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchKeyword.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // Scope determines RBAC query
  const scopeParam: 'own' | 'team' | 'all' = isAdminOrBoss ? 'all' : isTeamLeader ? 'team' : 'own';

  // 1. Fetch Filter Options
  const { data: filterOptions } = useQuery<DailyReportFilterOptions>({
    queryKey: ['dailyReportFilterOptions'],
    queryFn: getDailyReportFilterOptionsApi,
    staleTime: 5 * 60 * 1000,
  });

  // Dependent Filter Options:
  // Department -> Teams -> Employees
  const departmentOptions = useMemo(() => {
    return (filterOptions?.departments || []).map((d) => ({
      label: d === 'DEV' ? 'Phòng DEV' : d === 'SALES' ? 'Phòng Sales' : d === 'SEO' ? 'Phòng SEO' : `Phòng ${d}`,
      value: d,
    }));
  }, [filterOptions]);

  const teamOptions = useMemo(() => {
    let teamsList = filterOptions?.teams || [];
    if (selectedDepartment) {
      teamsList = teamsList.filter((t) => t.department === selectedDepartment);
    }
    return teamsList.map((t) => ({ label: t.name, value: t.id }));
  }, [filterOptions, selectedDepartment]);

  const employeeOptions = useMemo(() => {
    let empList = filterOptions?.employees || [];
    if (selectedTeamId) {
      empList = empList.filter((e) => e.teamId === selectedTeamId);
    }
    return empList.map((e) => ({
      label: `${e.fullName} (${e.employeeCode})`,
      value: e.id,
    }));
  }, [filterOptions, selectedTeamId]);

  const projectOptions = useMemo(() => {
    return (filterOptions?.projects || []).map((p) => ({
      label: p.name,
      value: p.id,
    }));
  }, [filterOptions]);

  // When Department changes, reset Team and Employee if they don't match
  const handleDepartmentChange = (val?: string) => {
    setSelectedDepartment(val);
    setSelectedTeamId(undefined);
    setSelectedEmployeeId(undefined);
  };

  const handleTeamChange = (val?: string) => {
    setSelectedTeamId(val);
    setSelectedEmployeeId(undefined);
  };

  // 2. Fetch Stats KPI
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DailyReportStats>({
    queryKey: [
      'dailyReportStats',
      fromDate,
      toDate,
      selectedDepartment,
      selectedTeamId,
      selectedEmployeeId,
      selectedProjectId,
      selectedStatus,
      debouncedSearch,
      scopeParam,
    ],
    queryFn: () =>
      getDailyReportStatsApi({
        fromDate,
        toDate,
        department: selectedDepartment,
        team_id: selectedTeamId,
        employee_id: selectedEmployeeId,
        project_id: selectedProjectId,
        status: selectedStatus,
        search: debouncedSearch,
        scope: scopeParam,
      }),
  });

  // 3. Fetch Daily Reports List
  const {
    data: reports = [],
    isLoading: loadingReports,
    refetch: refetchReports,
  } = useQuery<DailyReportItem[]>({
    queryKey: [
      'dailyReports',
      fromDate,
      toDate,
      selectedDepartment,
      selectedTeamId,
      selectedEmployeeId,
      selectedProjectId,
      selectedStatus,
      debouncedSearch,
      scopeParam,
    ],
    queryFn: () =>
      getDailyReportsApi({
        fromDate,
        toDate,
        department: selectedDepartment,
        team_id: selectedTeamId,
        employee_id: selectedEmployeeId,
        project_id: selectedProjectId,
        status: selectedStatus,
        search: debouncedSearch,
        scope: scopeParam,
      }),
    staleTime: 0,
  });

  // Flatten reports into individual work item rows for the table view matching screenshot
  // Note: Only real daily_report_items are included. Fallback synthetic rows are omitted.
  const flattenedWorkItems = useMemo(() => {
    const rows: Array<{
      key: string;
      reportId: string;
      reportDate: string;
      employeeId: string;
      employeeName: string;
      employeeCode?: string;
      positionName?: string;
      teamName?: string;
      department?: string;
      projectId?: string;
      projectName: string;
      taskName: string;
      taskDetail?: string;
      status: string;
      progressPercent: number;
      difficulty: string;
      supportNeeded: string;
      nextPlan: string;
      submittedAt: string;
      originalReport: DailyReportItem;
    }> = [];

    reports.forEach((rep) => {
      const repTeamName = (rep as any).teamName || '-';
      const repDept = (rep as any).department || '-';

      if (rep.items && rep.items.length > 0) {
        rep.items.forEach((it, idx) => {
          rows.push({
            key: `${rep.id}-${it.id || idx}`,
            reportId: rep.id,
            reportDate: rep.reportDate,
            employeeId: rep.employeeId,
            employeeName: rep.employeeName,
            employeeCode: rep.employeeCode,
            positionName: rep.positionName,
            teamName: repTeamName,
            department: repDept,
            projectId: it.projectId || undefined,
            projectName: it.projectName || '-',
            taskName: it.workTitle,
            taskDetail: it.workDetail,
            status: it.status,
            progressPercent: it.progressPercent || 0,
            difficulty: rep.difficulty || '-',
            supportNeeded: rep.supportNeeded || '-',
            nextPlan: rep.nextPlan || '-',
            submittedAt: rep.submittedAt,
            originalReport: rep,
          });
        });
      }
    });

    return rows;
  }, [reports]);

  // Derived table work items stats to ensure 100% synchronization between Table, Stats cards, and Charts
  const tableWorkItemStats = useMemo(() => {
    let done = 0;
    let inProgress = 0;
    let blocked = 0;
    let todo = 0;
    const projectSet = new Set<string>();

    flattenedWorkItems.forEach((r) => {
      if (r.status === 'DONE') done++;
      else if (r.status === 'IN_PROGRESS') inProgress++;
      else if (r.status === 'BLOCKED') blocked++;
      else todo++;

      if (r.projectId) {
        projectSet.add(r.projectId);
      }
    });

    return {
      totalWorkItems: flattenedWorkItems.length,
      doneCount: done,
      inProgressCount: inProgress,
      blockedCount: blocked,
      todoCount: todo,
      activeProjectsCount: projectSet.size,
    };
  }, [flattenedWorkItems]);

  // Synchronized counts: tableWorkItemStats guarantees instant 100% sync with table dataSource
  const totalWorkItems = tableWorkItemStats.totalWorkItems;
  const doneCount = tableWorkItemStats.doneCount;
  const inProgressCount = tableWorkItemStats.inProgressCount;
  const blockedCount = tableWorkItemStats.blockedCount;
  const activeProjectsCount = tableWorkItemStats.activeProjectsCount;

  // Handle Tab Switch
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setSearchParams({ tab: key });
  };

  const handleRefresh = () => {
    refetchStats();
    refetchReports();
    if (canAccessWeekly) {
      refetchWeekly();
    }
  };

  const handleResetFilters = () => {
    setSelectedDepartment(undefined);
    setSelectedTeamId(undefined);
    setSelectedEmployeeId(undefined);
    setSelectedProjectId(undefined);
    setSelectedStatus(undefined);
    setSearchKeyword('');
    setDebouncedSearch('');
  };

  // 4. Export Excel (All records matching active filters, no pagination limit)
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const blob = await exportDailyReportsApi({
        fromDate,
        toDate,
        department: selectedDepartment,
        teamId: selectedTeamId,
        employeeId: selectedEmployeeId,
        projectId: selectedProjectId,
        status: selectedStatus,
        search: debouncedSearch,
        scope: scopeParam,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bao_cao_cong_viec_${fromDate || 'all'}_${toDate || 'all'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      message.success('Xuất file Excel báo cáo thành công!');
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi xuất file Excel');
    } finally {
      setExporting(false);
    }
  };

  // 5. Daily Report Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingReport, setEditingReport] = useState<DailyReportItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [viewingReport, setViewingReport] = useState<DailyReportItem | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleOpenCreateModal = () => {
    setEditingReport(null);
    form.resetFields();
    form.setFieldsValue({
      report_date: dayjs(),
      items: [
        {
          work_title: '',
          work_detail: '',
          link: '',
          status: 'IN_PROGRESS',
          progress_percent: 50,
          note: '',
        },
      ],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (report: DailyReportItem) => {
    setEditingReport(report);
    form.resetFields();
    try {
      const detail = await getDailyReportByIdApi(report.id);
      form.setFieldsValue({
        report_date: dayjs(detail.reportDate),
        difficulty: detail.difficulty || '',
        support_needed: detail.supportNeeded || '',
        next_plan: detail.nextPlan || '',
        note: detail.note || '',
        items: detail.items?.map((it) => ({
          work_title: it.workTitle,
          work_detail: it.workDetail,
          link: it.link || '',
          status: it.status,
          progress_percent: it.progressPercent,
          note: it.note || '',
        })) || [],
      });
    } catch {
      form.setFieldsValue({
        report_date: dayjs(report.reportDate),
        difficulty: report.difficulty || '',
        support_needed: report.supportNeeded || '',
        next_plan: report.nextPlan || '',
        note: report.note || '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmitDailyReport = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const formattedDate = values.report_date.format('YYYY-MM-DD');
      const itemsPayload = values.items?.filter((it: any) => it?.work_title?.trim() && it?.work_detail?.trim()) || [];

      if (editingReport) {
        await updateDailyReportApi(editingReport.id, {
          difficulty: values.difficulty,
          support_needed: values.support_needed,
          next_plan: values.next_plan,
          note: values.note,
        });
        message.success('Cập nhật báo cáo thành công');
      } else {
        await createDailyReportApi({
          report_date: formattedDate,
          difficulty: values.difficulty,
          support_needed: values.support_needed,
          next_plan: values.next_plan,
          note: values.note,
          items: itemsPayload,
        });
        message.success('Tạo báo cáo ngày thành công');
      }
      setIsModalOpen(false);
      handleRefresh();
    } catch (err: any) {
      message.error(err.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDailyReport = async (report: DailyReportItem) => {
    try {
      const detail = await getDailyReportByIdApi(report.id);
      setViewingReport(detail);
    } catch {
      setViewingReport(report);
    }
    setDetailModalOpen(true);
  };

  // 6. Weekly Reports Logic
  const [weeklyDateRange, setWeeklyDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('isoWeek'),
    dayjs().endOf('isoWeek'),
  ]);
  const [weeklyExporting, setWeeklyExporting] = useState<boolean>(false);
  const [synthesizing, setSynthesizing] = useState<boolean>(false);
  const [weeklyModalOpen, setWeeklyModalOpen] = useState<boolean>(false);
  const [editingWeeklyReport, setEditingWeeklyReport] = useState<WeeklyReportRecord | null>(null);
  const [viewingWeeklyReport, setViewingWeeklyReport] = useState<WeeklyReportRecord | null>(null);
  const [weeklyDetailModalOpen, setWeeklyDetailModalOpen] = useState<boolean>(false);
  const [weeklySubmitting, setWeeklySubmitting] = useState<boolean>(false);
  const [weeklyForm] = Form.useForm();

  const weekStart = weeklyDateRange?.[0] ? weeklyDateRange[0].format('YYYY-MM-DD') : undefined;
  const weekEnd = weeklyDateRange?.[1] ? weeklyDateRange[1].format('YYYY-MM-DD') : undefined;

  const {
    data: weeklyReports = [],
    isLoading: weeklyLoading,
    refetch: refetchWeekly,
  } = useQuery<WeeklyReportRecord[]>({
    queryKey: ['weeklyReports', selectedTeamId, weekStart, weekEnd],
    queryFn: () =>
      getWeeklyReportsApi({
        team_id: selectedTeamId,
        week_start: weekStart,
        week_end: weekEnd,
      }),
    enabled: canAccessWeekly && activeTab === 'weekly',
  });

  const handleSynthesizeWeekly = async () => {
    if (!weeklyDateRange || weeklyDateRange.length < 2) {
      message.warning('Vui lòng chọn khoảng tuần cần tổng hợp');
      return;
    }
    setSynthesizing(true);
    try {
      const wStart = weeklyDateRange[0].format('YYYY-MM-DD');
      const wEnd = weeklyDateRange[1].format('YYYY-MM-DD');
      const res = await synthesizeWeeklyReportApi({
        team_id: selectedTeamId,
        week_start: wStart,
        week_end: wEnd,
      });

      setEditingWeeklyReport(null);
      weeklyForm.resetFields();
      weeklyForm.setFieldsValue({
        week_range: [dayjs(res.week_start), dayjs(res.week_end)],
        summary_work_done: res.summary_work_done,
        summary_blockers: res.summary_blockers,
        summary_next_week: res.summary_next_week,
        leader_note: '',
      });
      setWeeklyModalOpen(true);
      message.success(`Tổng hợp thành công từ ${res.member_reports_count || 0} báo cáo ngày`);
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi tổng hợp báo cáo tuần');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleOpenWeeklyCreateModal = () => {
    setEditingWeeklyReport(null);
    weeklyForm.resetFields();
    weeklyForm.setFieldsValue({
      week_range: weeklyDateRange,
      summary_work_done: '',
      summary_blockers: '',
      summary_next_week: '',
      leader_note: '',
    });
    setWeeklyModalOpen(true);
  };

  const handleOpenWeeklyEditModal = (rep: WeeklyReportRecord) => {
    setEditingWeeklyReport(rep);
    weeklyForm.resetFields();
    weeklyForm.setFieldsValue({
      week_range: [dayjs(rep.weekStart), dayjs(rep.weekEnd)],
      summary_work_done: rep.summaryWorkDone || '',
      summary_blockers: rep.summaryBlockers || '',
      summary_next_week: rep.summaryNextWeek || '',
      leader_note: rep.leaderNote || '',
    });
    setWeeklyModalOpen(true);
  };

  const handleSaveWeeklyReport = async (status: 'DRAFT' | 'COMPLETED') => {
    try {
      const values = await weeklyForm.validateFields();
      setWeeklySubmitting(true);
      const wStart = values.week_range[0].format('YYYY-MM-DD');
      const wEnd = values.week_range[1].format('YYYY-MM-DD');

      if (editingWeeklyReport) {
        await updateWeeklyReportApi(editingWeeklyReport.id, {
          summary_work_done: values.summary_work_done,
          summary_blockers: values.summary_blockers,
          summary_next_week: values.summary_next_week,
          leader_note: values.leader_note,
          status,
        });
        message.success(status === 'COMPLETED' ? 'Đã hoàn tất báo cáo tuần' : 'Đã lưu bản nháp báo cáo tuần');
      } else {
        await createWeeklyReportApi({
          team_id: selectedTeamId,
          week_start: wStart,
          week_end: wEnd,
          summary_work_done: values.summary_work_done,
          summary_blockers: values.summary_blockers,
          summary_next_week: values.summary_next_week,
          leader_note: values.leader_note,
          status,
        });
        message.success(status === 'COMPLETED' ? 'Đã tạo và hoàn tất báo cáo tuần' : 'Đã lưu bản nháp báo cáo tuần');
      }
      setWeeklyModalOpen(false);
      refetchWeekly();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi lưu báo cáo tuần');
    } finally {
      setWeeklySubmitting(false);
    }
  };

  const handleCompleteWeeklyDirect = async (id: string) => {
    try {
      await completeWeeklyReportApi(id);
      message.success('Đã hoàn tất báo cáo tuần thành công');
      refetchWeekly();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi hoàn tất báo cáo tuần');
    }
  };

  const handleExportWeeklyExcel = async (reportId?: string) => {
    setWeeklyExporting(true);
    try {
      await downloadWeeklyReportExcel(reportId, {
        team_id: selectedTeamId,
      });
      message.success('Tải file Excel báo cáo tuần thành công!');
    } catch (err: any) {
      message.error(err.message || 'Không thể xuất file báo cáo tuần');
    } finally {
      setWeeklyExporting(false);
    }
  };

  // 7. Project Work Items Tab Logic
  const [selectedProjectForTab, setSelectedProjectForTab] = useState<string | undefined>(undefined);
  const [projectGroupBy, setProjectGroupBy] = useState<'employee' | 'date'>('employee');

  // Auto-select first project if available
  useEffect(() => {
    if (!selectedProjectForTab && filterOptions?.projects?.length) {
      setSelectedProjectForTab(filterOptions.projects[0].id);
    }
  }, [filterOptions, selectedProjectForTab]);

  const { data: projectWorkItems = [], isLoading: projectItemsLoading } = useQuery<ProjectWorkItem[]>({
    queryKey: ['projectWorkItems', selectedProjectForTab, fromDate, toDate],
    queryFn: () =>
      getProjectWorkItemsApi({
        projectId: selectedProjectForTab!,
        fromDate,
        toDate,
      }),
    enabled: Boolean(selectedProjectForTab) && activeTab === 'project',
  });

  // Helpers
  const renderStatusTag = (st: string) => {
    switch (st) {
      case 'DONE':
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Hoàn thành
          </Tag>
        );
      case 'IN_PROGRESS':
        return (
          <Tag color="processing" icon={<SyncOutlined spin />}>
            Đang thực hiện
          </Tag>
        );
      case 'BLOCKED':
        return (
          <Tag color="error" icon={<WarningOutlined />}>
            Bị chặn
          </Tag>
        );
      case 'TODO':
      default:
        return (
          <Tag color="default" icon={<ClockCircleOutlined />}>
            Cần làm
          </Tag>
        );
    }
  };

  // Table Columns for Tab "Báo cáo ngày"
  const dailyColumns = useMemo(
    () => [
      {
        title: 'Ngày báo cáo',
        dataIndex: 'reportDate',
        key: 'reportDate',
        width: 120,
        render: (val: string) => (
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{val}</span>
        ),
      },
      {
        title: 'Nhân sự',
        key: 'employee',
        width: 200,
        render: (_: any, r: any) => (
          <Space size={8}>
            <Avatar
              size="small"
              style={{ backgroundColor: '#0284c7', color: '#fff', fontSize: 12 }}
            >
              {r.employeeName?.charAt(0)?.toUpperCase() || 'U'}
            </Avatar>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{r.employeeName}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{r.employeeCode || '-'}</div>
            </div>
          </Space>
        ),
      },
      {
        title: 'Team',
        dataIndex: 'teamName',
        key: 'teamName',
        width: 130,
        render: (val: string) => <span style={{ color: '#475569', fontSize: 13 }}>{val}</span>,
      },
      {
        title: 'Dự án',
        dataIndex: 'projectName',
        key: 'projectName',
        width: 140,
        render: (val: string) => <span style={{ fontWeight: 500, color: '#334155' }}>{val}</span>,
      },
      {
        title: 'Công việc',
        dataIndex: 'taskName',
        key: 'taskName',
        render: (val: string, r: any) => (
          <div>
            <div style={{ fontWeight: 500, color: '#0f172a' }}>{val}</div>
            {r.taskDetail && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{r.taskDetail}</div>
            )}
          </div>
        ),
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (st: string) => renderStatusTag(st),
      },
      {
        title: 'Tiến độ',
        dataIndex: 'progressPercent',
        key: 'progressPercent',
        width: 130,
        render: (p: number) => {
          const val = p || 0;
          const strokeColor = val === 100 ? '#10b981' : val >= 50 ? '#3b82f6' : '#ef4444';
          return (
            <div style={{ width: 100 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{val}%</div>
              <Progress percent={val} showInfo={false} size="small" strokeColor={strokeColor} />
            </div>
          );
        },
      },
      {
        title: 'Khó khăn / Trở ngại',
        dataIndex: 'difficulty',
        key: 'difficulty',
        width: 150,
        render: (val: string) =>
          val && val !== '-' ? (
            <Tooltip title={val}>
              <span style={{ color: '#ef4444', fontSize: 12 }}>{val}</span>
            </Tooltip>
          ) : (
            <span style={{ color: '#94a3b8' }}>-</span>
          ),
      },
      {
        title: 'Kế hoạch tiếp theo',
        dataIndex: 'nextPlan',
        key: 'nextPlan',
        width: 160,
        render: (val: string) =>
          val && val !== '-' ? (
            <Tooltip title={val}>
              <span style={{ fontSize: 12, color: '#475569' }}>{val}</span>
            </Tooltip>
          ) : (
            <span style={{ color: '#94a3b8' }}>-</span>
          ),
      },
      {
        title: 'Thời gian nộp',
        dataIndex: 'submittedAt',
        key: 'submittedAt',
        width: 120,
        render: (val: string) => {
          if (!val) return '-';
          return <span style={{ fontSize: 12, color: '#64748b' }}>{dayjs(val).format('HH:mm DD/MM')}</span>;
        },
      },
      {
        title: 'Thao tác',
        key: 'action',
        width: 80,
        align: 'center' as const,
        render: (_: any, r: any) => {
          const isOwn = String(r.employeeId) === String(user?.employeeId);
          return (
            <Space size={4}>
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                title="Xem chi tiết"
                onClick={() => handleViewDailyReport(r.originalReport)}
              />
              {isOwn && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  title="Chỉnh sửa"
                  onClick={() => handleOpenEditModal(r.originalReport)}
                />
              )}
            </Space>
          );
        },
      },
    ],
    [user?.employeeId]
  );

  // Table Columns for Tab "Báo cáo tuần"
  const weeklyColumns = useMemo(
    () => [
      {
        title: 'Tuần báo cáo',
        key: 'week',
        width: 200,
        render: (_: any, r: WeeklyReportRecord) => (
          <Space direction="vertical" size={2}>
            <strong>
              {r.weekStart} &rarr; {r.weekEnd}
            </strong>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Team: {r.teamName}
            </Text>
          </Space>
        ),
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (st: string) =>
          st === 'COMPLETED' ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              COMPLETED
            </Tag>
          ) : (
            <Tag color="warning" icon={<ClockCircleOutlined />}>
              DRAFT
            </Tag>
          ),
      },
      {
        title: 'Người lập',
        dataIndex: 'creatorName',
        key: 'creatorName',
        render: (name: string, r: WeeklyReportRecord) => (
          <Space>
            <UserOutlined />
            <span>{name}</span>
            {r.creatorCode && <Tag>{r.creatorCode}</Tag>}
          </Space>
        ),
      },
      {
        title: 'Tóm tắt công việc hoàn thành',
        dataIndex: 'summaryWorkDone',
        key: 'summaryWorkDone',
        render: (val: string | null) => (
          <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, maxWidth: 300 }}>
            {val || 'Chưa có tóm tắt'}
          </Paragraph>
        ),
      },
      {
        title: 'Cập nhật lần cuối',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 150,
        render: (val: string) => (val ? dayjs(val).format('HH:mm DD/MM/YYYY') : ''),
      },
      {
        title: 'Thao tác',
        key: 'action',
        width: 140,
        render: (_: any, record: WeeklyReportRecord) => {
          const canEdit = isTeamLeader && record.status === 'DRAFT';
          return (
            <Space size={6}>
              <Button
                type="text"
                icon={<EyeOutlined />}
                title="Xem chi tiết"
                onClick={() => {
                  setViewingWeeklyReport(record);
                  setWeeklyDetailModalOpen(true);
                }}
              />
              {canEdit && (
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  title="Chỉnh sửa bản nháp"
                  onClick={() => handleOpenWeeklyEditModal(record)}
                />
              )}
              {canEdit && (
                <Button
                  type="text"
                  style={{ color: '#52c41a' }}
                  icon={<CheckCircleOutlined />}
                  title="Hoàn tất báo cáo tuần"
                  onClick={() => handleCompleteWeeklyDirect(record.id)}
                />
              )}
              <Button
                type="text"
                icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
                title="Tải file Excel"
                onClick={() => handleExportWeeklyExcel(record.id)}
              />
            </Space>
          );
        },
      },
    ],
    [isTeamLeader]
  );

  // Table Columns for Tab "Báo cáo theo dự án"
  const projectColumns = useMemo(
    () => [
      {
        title: 'Nhân sự',
        key: 'employee',
        width: 180,
        render: (_: any, r: ProjectWorkItem) => (
          <Space size={6}>
            <Avatar size="small" style={{ backgroundColor: '#0284c7' }}>
              {r.employeeName?.charAt(0) || 'U'}
            </Avatar>
            <div>
              <div style={{ fontWeight: 600 }}>{r.employeeName}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{r.employeeCode}</div>
            </div>
          </Space>
        ),
      },
      {
        title: 'Ngày báo cáo',
        dataIndex: 'reportDate',
        key: 'reportDate',
        width: 120,
      },
      {
        title: 'Công việc',
        dataIndex: 'taskName',
        key: 'taskName',
        render: (val: string, r: ProjectWorkItem) => (
          <div>
            <div style={{ fontWeight: 600 }}>{val}</div>
            {r.taskDetail && <div style={{ fontSize: 12, color: '#64748b' }}>{r.taskDetail}</div>}
          </div>
        ),
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (st: string) => renderStatusTag(st),
      },
      {
        title: 'Tiến độ',
        dataIndex: 'progressPercent',
        key: 'progressPercent',
        width: 120,
        render: (p: number) => (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{p}%</div>
            <Progress percent={p} size="small" showInfo={false} />
          </div>
        ),
      },
      {
        title: 'Khó khăn / Blocker',
        dataIndex: 'challenges',
        key: 'challenges',
        render: (val: string | null) =>
          val ? <Tag color="error">{val}</Tag> : <span style={{ color: '#94a3b8' }}>-</span>,
      },
      {
        title: 'Hỗ trợ cần thiết',
        dataIndex: 'supportNeeded',
        key: 'supportNeeded',
        render: (val: string | null) =>
          val ? <Tag color="warning">{val}</Tag> : <span style={{ color: '#94a3b8' }}>-</span>,
      },
      {
        title: 'Thời gian nộp',
        dataIndex: 'submittedAt',
        key: 'submittedAt',
        width: 130,
        render: (val: string) => (val ? dayjs(val).format('HH:mm DD/MM') : '-'),
      },
    ],
    []
  );

  // Calculated Stats percentages
  const reportedPercent = stats?.totalEmployeesCount
    ? Math.round((stats.reportedEmployeesCount / stats.totalEmployeesCount) * 100)
    : 0;

  const totalTasks = totalWorkItems;
  const donePercent = totalTasks ? Math.round((doneCount / totalTasks) * 100) : 0;
  const inProgressPercent = totalTasks ? Math.round((inProgressCount / totalTasks) * 100) : 0;
  const blockedPercent = totalTasks ? Math.round((blockedCount / totalTasks) * 100) : 0;

  return (
    <div style={{ padding: '20px 24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      {/* 1. HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
            Báo cáo công việc
          </Title>
          <Text style={{ color: '#64748b', fontSize: 14 }}>
            {isAdminOrBoss
              ? 'Theo dõi tiến độ, hiệu suất làm việc của toàn công ty'
              : isTeamLeader
              ? 'Theo dõi tiến độ, hiệu suất làm việc của Team'
              : 'Ghi nhận và cập nhật tiến độ công việc cá nhân'}
          </Text>
        </div>

        {/* Quick Date Buttons & RangePicker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 3,
            }}
          >
            {(
              [
                { label: 'Hôm nay', key: 'today' },
                { label: '7 ngày qua', key: '7days' },
                { label: 'Tuần này', key: 'thisWeek' },
                { label: 'Tháng này', key: 'thisMonth' },
                { label: 'Tùy chọn', key: 'custom' },
              ] as const
            ).map((item) => {
              const active = quickDate === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleQuickDateChange(item.key)}
                  style={{
                    border: 'none',
                    background: active ? '#059669' : 'transparent',
                    color: active ? '#fff' : '#475569',
                    fontWeight: active ? 600 : 500,
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <RangePicker
            value={dateRange as any}
            onChange={(dates) => {
              setDateRange(dates as any);
              setQuickDate('custom');
            }}
            format="YYYY-MM-DD"
            style={{ borderRadius: 8, height: 38 }}
            allowClear
          />

          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            style={{ borderRadius: 8, height: 38 }}
          >
            Làm mới
          </Button>

          <Button
            icon={<FileExcelOutlined />}
            onClick={handleExportExcel}
            loading={exporting}
            style={{ borderRadius: 8, height: 38 }}
          >
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateModal}
            style={{
              borderRadius: 8,
              height: 38,
              backgroundColor: '#059669',
              borderColor: '#059669',
              fontWeight: 600,
            }}
          >
            Tạo báo cáo ngày
          </Button>
        </div>
      </div>

      {/* 2. SUMMARY KPI CARDS (6 CARDS) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {/* Card 1: Đã báo cáo */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                <TeamOutlined />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                  {stats?.reportedEmployeesCount ?? 0} / {stats?.totalEmployeesCount ?? 0}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Đã báo cáo</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress
                percent={reportedPercent}
                showInfo={false}
                size="small"
                strokeColor="#059669"
                style={{ flex: 1, margin: 0 }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>{reportedPercent}%</span>
            </div>
          </Card>
        </Col>

        {/* Card 2: Tổng công việc */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: '#fff7ed',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                <AppstoreOutlined />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                  {totalWorkItems}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Tổng công việc</div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RiseOutlined /> Đang ghi nhận hoạt động
            </div>
          </Card>
        </Col>

        {/* Card 3: Hoàn thành */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                <CheckCircleOutlined />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                  {doneCount}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Hoàn thành</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress
                percent={donePercent}
                showInfo={false}
                size="small"
                strokeColor="#16a34a"
                style={{ flex: 1, margin: 0 }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>{donePercent}%</span>
            </div>
          </Card>
        </Col>

        {/* Card 4: Đang thực hiện */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                <SyncOutlined spin={Boolean(inProgressCount)} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                  {inProgressCount}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Đang thực hiện</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress
                percent={inProgressPercent}
                showInfo={false}
                size="small"
                strokeColor="#2563eb"
                style={{ flex: 1, margin: 0 }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb' }}>{inProgressPercent}%</span>
            </div>
          </Card>
        </Col>

        {/* Card 5: Bị chặn */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: '#fef2f2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                <WarningOutlined />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                  {blockedCount}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Bị chặn</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress
                percent={blockedPercent}
                showInfo={false}
                size="small"
                strokeColor="#dc2626"
                style={{ flex: 1, margin: 0 }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626' }}>{blockedPercent}%</span>
            </div>
          </Card>
        </Col>

        {/* Card 6: Dự án có hoạt động */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: '#f5f3ff',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                <FolderOpenOutlined />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                  {activeProjectsCount}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Dự án có hoạt động</div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircleOutlined /> Đang được phân bổ
            </div>
          </Card>
        </Col>
      </Row>

      {/* 3. THREE ANALYTICS CARDS (Always visible or in Overview) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {/* Analytics Card 1: Tình trạng công việc (Donut / Ring chart) */}
        <Col xs={24} lg={8}>
          <Card
            variant="borderless"
            title={<span style={{ fontWeight: 600, color: '#0f172a' }}>Tình trạng công việc</span>}
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px 0' }}>
              {/* Circular SVG Donut */}
              <div style={{ position: 'relative', width: 130, height: 130 }}>
                <svg width="130" height="130" viewBox="0 0 36 36">
                  {/* Background Circle */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="3.8"
                  />
                  {/* Segment DONE (Green) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.8"
                    strokeDasharray={`${donePercent}, 100`}
                  />
                  {/* Segment IN_PROGRESS (Blue) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3.8"
                    strokeDasharray={`${inProgressPercent}, 100`}
                    strokeDashoffset={-(donePercent)}
                  />
                  {/* Segment BLOCKED (Red) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="3.8"
                    strokeDasharray={`${blockedPercent}, 100`}
                    strokeDashoffset={-(donePercent + inProgressPercent)}
                  />
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
                    {totalWorkItems}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Tổng công việc</div>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
                  <span style={{ color: '#334155' }}>Hoàn thành:</span>
                  <strong style={{ color: '#0f172a' }}>
                    {doneCount} ({donePercent}%)
                  </strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                  <span style={{ color: '#334155' }}>Đang thực hiện:</span>
                  <strong style={{ color: '#0f172a' }}>
                    {inProgressCount} ({inProgressPercent}%)
                  </strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }} />
                  <span style={{ color: '#334155' }}>Bị chặn:</span>
                  <strong style={{ color: '#0f172a' }}>
                    {blockedCount} ({blockedPercent}%)
                  </strong>
                </div>
              </div>
            </div>
          </Card>
        </Col>

        {/* Analytics Card 2: Báo cáo theo phòng ban */}
        <Col xs={24} lg={8}>
          <Card
            variant="borderless"
            title={<span style={{ fontWeight: 600, color: '#0f172a' }}>Báo cáo theo phòng ban</span>}
            extra={<Tag color="default">Số công việc</Tag>}
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
              {(stats?.departments || []).length > 0 ? (
                stats!.departments.map((dep, idx) => {
                  const maxCount = Math.max(...stats!.departments.map((d) => d.count), 1);
                  const pct = Math.round((dep.count / maxCount) * 100);
                  const colors = ['#10b981', '#3b82f6', '#f97316', '#a855f7'];
                  const color = colors[idx % colors.length];
                  return (
                    <div key={dep.department}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{dep.department}</span>
                        <strong style={{ color: '#0f172a' }}>{dep.count}</strong>
                      </div>
                      <Progress percent={pct} strokeColor={color} showInfo={false} size="small" />
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
                  Chưa có dữ liệu phòng ban
                </div>
              )}
            </div>
          </Card>
        </Col>

        {/* Analytics Card 3: Top dự án có nhiều hoạt động */}
        <Col xs={24} lg={8}>
          <Card
            variant="borderless"
            title={<span style={{ fontWeight: 600, color: '#0f172a' }}>Top dự án có nhiều hoạt động</span>}
            extra={<Tag color="default">Theo số công việc</Tag>}
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              height: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(stats?.topProjects || []).length > 0 ? (
                stats!.topProjects.map((prj, idx) => {
                  const rankColors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#64748b'];
                  const badgeColor = rankColors[idx] || '#64748b';
                  const prjName = prj.name || (prj as any).projectName || 'Dự án';
                  const prjCount = prj.taskCount ?? (prj as any).count ?? 0;
                  return (
                    <div
                      key={prj.id || (prj as any).projectId || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                      }}
                    >
                      <Space size={10}>
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            backgroundColor: badgeColor,
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span style={{ fontWeight: 500, color: '#1e293b' }}>{prjName}</span>
                      </Space>
                      <strong style={{ color: '#0f172a' }}>{prjCount}</strong>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
                  Chưa có hoạt động dự án nào
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 4. DEPENDENT FILTERS BAR */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
          marginBottom: 20,
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Row gutter={[12, 12]} align="middle">
          {/* Phòng ban */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Phòng ban</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Tất cả phòng ban"
              allowClear
              value={selectedDepartment}
              onChange={handleDepartmentChange}
              options={departmentOptions}
            />
          </Col>

          {/* Team */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Team</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Tất cả team"
              allowClear
              value={selectedTeamId}
              onChange={handleTeamChange}
              options={teamOptions}
            />
          </Col>

          {/* Nhân sự */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Nhân sự</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Tất cả nhân sự"
              allowClear
              value={selectedEmployeeId}
              onChange={(val) => setSelectedEmployeeId(val)}
              options={employeeOptions}
            />
          </Col>

          {/* Dự án */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Dự án</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Tất cả dự án"
              allowClear
              value={selectedProjectId}
              onChange={(val) => setSelectedProjectId(val)}
              options={projectOptions}
            />
          </Col>

          {/* Trạng thái */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Trạng thái</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Tất cả trạng thái"
              allowClear
              value={selectedStatus}
              onChange={(val) => setSelectedStatus(val)}
              options={[
                { label: 'Hoàn thành (DONE)', value: 'DONE' },
                { label: 'Đang thực hiện (IN_PROGRESS)', value: 'IN_PROGRESS' },
                { label: 'Bị chặn (BLOCKED)', value: 'BLOCKED' },
                { label: 'Cần làm (TODO)', value: 'TODO' },
              ]}
            />
          </Col>

          {/* Tìm kiếm & Reset */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Tìm kiếm</div>
            <Input
              placeholder="Tên nhân sự, công việc..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {/* 5. TABS & CONTENT */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
        styles={{ body: { padding: '0 20px 20px 20px' } }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f1f5f9',
            paddingTop: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            style={{ marginBottom: 0 }}
            items={[
              {
                key: 'overview',
                label: (
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    <AppstoreOutlined /> Tổng quan
                  </span>
                ),
              },
              {
                key: 'daily',
                label: (
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    <CalendarOutlined /> Báo cáo ngày
                  </span>
                ),
              },
              ...(canAccessWeekly
                ? [
                    {
                      key: 'weekly',
                      label: (
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          <TeamOutlined /> Báo cáo tuần
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                key: 'project',
                label: (
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    <ProjectOutlined /> Báo cáo theo dự án
                  </span>
                ),
              },
            ]}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              Làm mới
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={handleExportExcel} loading={exporting}>
              Xuất Excel
            </Button>
            {activeTab === 'weekly' && isTeamLeader && (
              <>
                <Button
                  type="default"
                  icon={<ThunderboltOutlined style={{ color: '#fa8c16' }} />}
                  onClick={handleSynthesizeWeekly}
                  loading={synthesizing}
                >
                  ⚡ Tổng hợp tuần
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenWeeklyCreateModal}>
                  Tạo báo cáo tuần
                </Button>
              </>
            )}
            {activeTab !== 'weekly' && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenCreateModal}
                style={{ backgroundColor: '#059669', borderColor: '#059669' }}
              >
                Tạo báo cáo ngày
              </Button>
            )}
          </div>
        </div>

        {/* TAB 1: TỔNG QUAN */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0, color: '#1e293b' }}>
                Hoạt động báo cáo gần đây
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Danh sách các đầu việc mới nhất trong khoảng thời gian đã chọn
              </Text>
            </div>

            <Table
              rowKey="key"
              columns={dailyColumns}
              dataSource={flattenedWorkItems.slice(0, 10)}
              loading={loadingReports}
              pagination={false}
              scroll={{ x: 1200 }}
              locale={{ emptyText: 'Không có báo cáo nào trong khoảng ngày đã chọn' }}
            />
          </div>
        )}

        {/* TAB 2: BÁO CÁO NGÀY */}
        {activeTab === 'daily' && (
          <div>
            <Table
              rowKey="key"
              columns={dailyColumns}
              dataSource={flattenedWorkItems}
              loading={loadingReports}
              scroll={{ x: 1300 }}
              onRow={createRowActionHandler((record: any) => {
                handleViewDailyReport(record.originalReport);
              })}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total, range) => `Hiển thị ${range[0]} - ${range[1]} của ${total} công việc`,
              }}
              locale={{ emptyText: 'Chưa có báo cáo nào trong khoảng thời gian này' }}
            />
          </div>
        )}

        {/* TAB 3: BÁO CÁO TUẦN */}
        {activeTab === 'weekly' && canAccessWeekly && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <Space wrap>
                <RangePicker
                  value={weeklyDateRange}
                  onChange={(dates) => dates && setWeeklyDateRange([dates[0]!, dates[1]!])}
                  format="YYYY-MM-DD"
                />
                <Button icon={<ReloadOutlined />} onClick={() => refetchWeekly()} loading={weeklyLoading}>
                  Làm mới danh sách tuần
                </Button>
              </Space>
              {isBoss && (
                <Button
                  icon={<FileExcelOutlined />}
                  onClick={() => handleExportWeeklyExcel()}
                  loading={weeklyExporting}
                >
                  Xuất Excel tất cả báo cáo tuần
                </Button>
              )}
            </div>

            <Table
              rowKey="id"
              columns={weeklyColumns}
              dataSource={weeklyReports}
              loading={weeklyLoading}
              scroll={{ x: 'max-content' }}
              onRow={createRowActionHandler((record: WeeklyReportRecord) => {
                setViewingWeeklyReport(record);
                setWeeklyDetailModalOpen(true);
              })}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total) => `Tổng cộng ${total} báo cáo tuần`,
              }}
              locale={{ emptyText: 'Chưa có báo cáo tuần nào được tạo trong khoảng này' }}
            />
          </div>
        )}

        {/* TAB 4: BÁO CÁO THEO DỰ ÁN */}
        {activeTab === 'project' && (
          <div>
            {/* Project Select & Grouping Controls */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: 12,
                backgroundColor: '#f8fafc',
                padding: '12px 16px',
                borderRadius: 8,
              }}
            >
              <Space wrap size={16}>
                <div>
                  <Text strong style={{ marginRight: 8 }}>
                    Chọn Dự án:
                  </Text>
                  <Select
                    style={{ width: 240 }}
                    value={selectedProjectForTab}
                    onChange={(val) => setSelectedProjectForTab(val)}
                    placeholder="Chọn dự án..."
                    options={projectOptions}
                  />
                </div>

                <div>
                  <Text strong style={{ marginRight: 8 }}>
                    Nhóm theo:
                  </Text>
                  <Segmented
                    value={projectGroupBy}
                    onChange={(val) => setProjectGroupBy(val as 'employee' | 'date')}
                    options={[
                      { label: 'Theo Nhân sự', value: 'employee' },
                      { label: 'Theo Ngày', value: 'date' },
                    ]}
                  />
                </div>
              </Space>

              <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px' }}>
                Tổng số đầu việc: <strong>{projectWorkItems.length}</strong>
              </Tag>
            </div>

            <Table
              rowKey="id"
              columns={projectColumns}
              dataSource={projectWorkItems}
              loading={projectItemsLoading}
              scroll={{ x: 1200 }}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total) => `Tổng cộng ${total} đầu việc dự án`,
              }}
              locale={{
                emptyText: selectedProjectForTab
                  ? 'Không có công việc nào thuộc dự án này trong khoảng ngày đã chọn'
                  : 'Vui lòng chọn một dự án để xem báo cáo',
              }}
            />
          </div>
        )}
      </Card>

      {/* MODAL 1: DAILY REPORT CREATE / EDIT */}
      <Modal
        title={editingReport ? `Chỉnh sửa báo cáo ngày ${editingReport.reportDate}` : 'Tạo báo cáo công việc ngày'}
        open={isModalOpen}
        onOk={handleSubmitDailyReport}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={submitting}
        okText={editingReport ? 'Lưu thay đổi' : 'Gửi báo cáo'}
        cancelText="Hủy"
        width={780}
      >
        <Form form={form} layout="vertical" className="vmax-form">
          <Form.Item
            name="report_date"
            label="Ngày báo cáo"
            rules={[{ required: true, message: 'Vui lòng chọn ngày báo cáo' }]}
          >
            <DatePicker style={{ width: '100%' }} disabled={Boolean(editingReport)} />
          </Form.Item>

          {!editingReport && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 14 }}>
                  Danh sách đầu việc thực hiện trong ngày (Work Items)
                </Text>
              </div>

              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }, idx) => (
                      <Card
                        key={key}
                        size="small"
                        style={{ marginBottom: 12, background: '#fafafa', border: '1px solid #e2e8f0' }}
                        title={<Text strong style={{ fontSize: 12 }}>Đầu việc #{idx + 1}</Text>}
                        extra={
                          fields.length > 1 ? (
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => remove(name)}
                            />
                          ) : null
                        }
                      >
                        <Row gutter={12}>
                          <Col span={14}>
                            <Form.Item
                              {...restField}
                              name={[name, 'work_title']}
                              label="Tên đầu việc / Dự án"
                              rules={[{ required: true, message: 'Nhập tên đầu việc' }]}
                            >
                              <DynamicOptionSelect
                                fieldKey="daily_report_work_title"
                                placeholder="Nhập hoặc chọn tên đầu việc..."
                                defaultOptions={[
                                  'Fix UI dashboard',
                                  'API báo cáo công việc',
                                  'Nghiên cứu từ khóa & content',
                                  'Liên hệ khách hàng & tư vấn',
                                  'Tối ưu hóa hiệu năng hệ thống',
                                  'Kiểm thử UAT & sửa lỗi',
                                ]}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={5}>
                            <Form.Item
                              {...restField}
                              name={[name, 'status']}
                              label="Trạng thái"
                              initialValue="IN_PROGRESS"
                            >
                              <Select
                                options={[
                                  { label: 'Hoàn thành (DONE)', value: 'DONE' },
                                  { label: 'Đang làm (IN_PROGRESS)', value: 'IN_PROGRESS' },
                                  { label: 'Bị chặn (BLOCKED)', value: 'BLOCKED' },
                                  { label: 'Cần làm (TODO)', value: 'TODO' },
                                ]}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={5}>
                            <Form.Item
                              {...restField}
                              name={[name, 'progress_percent']}
                              label="Tiến độ (%)"
                              initialValue={50}
                            >
                              <InputNumber
                                min={0}
                                max={100}
                                step={5}
                                formatter={(value) => `${value}%`}
                                parser={(value) => (value ? Number(value.replace('%', '')) : 0) as any}
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={12}>
                          <Col span={16}>
                            <Form.Item
                              {...restField}
                              name={[name, 'work_detail']}
                              label="Chi tiết công việc đã làm"
                              rules={[{ required: true, message: 'Nhập chi tiết công việc' }]}
                            >
                              <Input placeholder="Mô tả cụ thể kết quả, module hoặc giải pháp..." />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...restField}
                              name={[name, 'link']}
                              label="Link tài liệu / PR"
                            >
                              <Input placeholder="https://..." />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    ))}

                    <Button
                      type="dashed"
                      onClick={() =>
                        add({
                          work_title: '',
                          work_detail: '',
                          status: 'IN_PROGRESS',
                          progress_percent: 50,
                          link: '',
                          note: '',
                        })
                      }
                      block
                      icon={<PlusOutlined />}
                    >
                      Thêm đầu việc mới
                    </Button>
                  </>
                )}
              </Form.List>
            </div>
          )}

          <Form.Item name="difficulty" label="Khó khăn / Trở ngại gặp phải">
            <TextArea rows={2} placeholder="Nêu rõ các vấn đề phát sinh..." />
          </Form.Item>

          <Form.Item name="support_needed" label="Đề xuất hỗ trợ từ Leader / Công ty">
            <TextArea rows={2} placeholder="Cần hỗ trợ giải pháp, tài khoản test..." />
          </Form.Item>

          <Form.Item name="next_plan" label="Kế hoạch công việc tiếp theo">
            <TextArea rows={2} placeholder="Nội dung sẽ làm tiếp theo..." />
          </Form.Item>

          <Form.Item name="note" label="Ghi chú thêm">
            <TextArea rows={2} placeholder="Ghi chú bổ sung..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL 2: DAILY REPORT DETAIL */}
      <Modal
        title="Chi tiết báo cáo công việc ngày"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={720}
      >
        {viewingReport && (
          <div>
            <div style={{ marginBottom: 16, borderBottom: '1px solid #f0f0f0', paddingBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">Nhân viên:</Text>{' '}
                  <strong>{viewingReport.employeeName}</strong>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Ngày báo cáo:</Text>{' '}
                  <Tag color="blue">{viewingReport.reportDate}</Tag>
                </Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Text type="secondary">Vị trí:</Text>{' '}
                  <span>{viewingReport.positionName || '-'}</span>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Thời gian gửi:</Text>{' '}
                  <span>{new Date(viewingReport.submittedAt).toLocaleString('vi-VN')}</span>
                </Col>
              </Row>
            </div>

            {viewingReport.items && viewingReport.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ fontSize: 13 }}>Danh sách đầu việc (Work Items):</Text>
                <div style={{ marginTop: 8 }}>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="id"
                    dataSource={viewingReport.items}
                    columns={[
                      {
                        title: 'Đầu việc',
                        dataIndex: 'workTitle',
                        key: 'workTitle',
                        render: (title: string, r: DailyReportWorkItem) => (
                          <div>
                            <strong>{title}</strong>
                            {r.projectName && <Tag style={{ marginLeft: 6 }}>{r.projectName}</Tag>}
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {r.workDetail}
                              </Text>
                            </div>
                            {r.link && (
                              <div>
                                <a href={r.link} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                  <LinkOutlined /> Xem liên kết
                                </a>
                              </div>
                            )}
                          </div>
                        ),
                      },
                      {
                        title: 'Trạng thái',
                        dataIndex: 'status',
                        key: 'status',
                        width: 130,
                        render: (st: string) => renderStatusTag(st),
                      },
                      {
                        title: 'Tiến độ',
                        dataIndex: 'progressPercent',
                        key: 'progressPercent',
                        width: 120,
                        render: (p: number) => (
                          <Progress
                            percent={p || 0}
                            size="small"
                            status={p >= 100 ? 'success' : 'active'}
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <Text strong style={{ color: '#fa541c' }}>
                <WarningOutlined style={{ marginRight: 6 }} />
                Khó khăn / Trở ngại:
              </Text>
              <div style={{ marginTop: 4, padding: '8px 12px', background: '#fff2e8', borderRadius: 6 }}>
                <Text>{viewingReport.difficulty || 'Không có khó khăn'}</Text>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Text strong style={{ color: '#fa8c16' }}>
                Đề xuất hỗ trợ:
              </Text>
              <div style={{ marginTop: 4, padding: '8px 12px', background: '#fff7e6', borderRadius: 6 }}>
                <Text>{viewingReport.supportNeeded || 'Không đề xuất hỗ trợ'}</Text>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Text strong>Kế hoạch tiếp theo:</Text>
              <div style={{ marginTop: 4, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {viewingReport.nextPlan || 'Chưa cập nhật'}
                </Paragraph>
              </div>
            </div>

            <div>
              <Text strong>Ghi chú chung:</Text>
              <div style={{ marginTop: 4, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {viewingReport.note || 'Không có ghi chú'}
                </Paragraph>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: WEEKLY REPORT CREATE / EDIT */}
      <Modal
        title={editingWeeklyReport ? 'Chỉnh sửa Báo cáo tuần' : 'Tạo Báo cáo tuần mới'}
        open={weeklyModalOpen}
        onCancel={() => setWeeklyModalOpen(false)}
        width={750}
        footer={[
          <Button key="cancel" onClick={() => setWeeklyModalOpen(false)}>
            Hủy
          </Button>,
          <Button
            key="draft"
            onClick={() => handleSaveWeeklyReport('DRAFT')}
            loading={weeklySubmitting}
          >
            Lưu bản nháp (DRAFT)
          </Button>,
          <Button
            key="complete"
            type="primary"
            onClick={() => handleSaveWeeklyReport('COMPLETED')}
            loading={weeklySubmitting}
          >
            Hoàn tất báo cáo tuần (COMPLETED)
          </Button>,
        ]}
      >
        <Form form={weeklyForm} layout="vertical">
          <Form.Item
            name="week_range"
            label="Khoảng tuần báo cáo (Từ ngày - Đến ngày)"
            rules={[{ required: true, message: 'Vui lòng chọn khoảng tuần' }]}
          >
            <RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item
            name="summary_work_done"
            label="1. Tóm tắt công việc đã hoàn thành trong tuần"
            rules={[{ required: true, message: 'Nhập nội dung công việc đã làm' }]}
          >
            <TextArea rows={4} placeholder="Liệt kê các đầu việc của team đã thực hiện xong..." />
          </Form.Item>

          <Form.Item name="summary_blockers" label="2. Khó khăn, vướng mắc & các điểm nghẽn (Blockers)">
            <TextArea rows={3} placeholder="Ghi nhận các trở ngại, vấn đề kỹ thuật phát sinh..." />
          </Form.Item>

          <Form.Item name="summary_next_week" label="3. Kế hoạch & Mục tiêu tuần tiếp theo">
            <TextArea rows={3} placeholder="Mục tiêu trọng tâm và kế hoạch của tuần tới..." />
          </Form.Item>

          <Form.Item name="leader_note" label="4. Ý kiến / Ghi chú của Team Leader">
            <TextArea rows={2} placeholder="Đánh giá tinh thần làm việc, lưu ý nội bộ..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL 4: WEEKLY REPORT DETAIL */}
      <Modal
        title="Chi tiết Báo cáo tuần"
        open={weeklyDetailModalOpen}
        onCancel={() => setWeeklyDetailModalOpen(false)}
        footer={[
          <Button
            key="export"
            icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
            onClick={() => viewingWeeklyReport && handleExportWeeklyExcel(viewingWeeklyReport.id)}
          >
            Tải Excel
          </Button>,
          <Button key="close" type="primary" onClick={() => setWeeklyDetailModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={750}
      >
        {viewingWeeklyReport && (
          <div>
            <div style={{ marginBottom: 16, borderBottom: '1px solid #f0f0f0', paddingBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">Team / Đội ngũ:</Text>{' '}
                  <strong>{viewingWeeklyReport.teamName}</strong>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Trạng thái:</Text>{' '}
                  {viewingWeeklyReport.status === 'COMPLETED' ? (
                    <Tag color="success">COMPLETED</Tag>
                  ) : (
                    <Tag color="warning">DRAFT</Tag>
                  )}
                </Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Text type="secondary">Khoảng tuần:</Text>{' '}
                  <Tag color="blue">
                    {viewingWeeklyReport.weekStart} &rarr; {viewingWeeklyReport.weekEnd}
                  </Tag>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Người lập:</Text>{' '}
                  <strong>{viewingWeeklyReport.creatorName}</strong>
                </Col>
              </Row>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ color: '#0958d9' }}>
                1. Tóm tắt công việc đã hoàn thành:
              </Text>
              <div style={{ marginTop: 6, padding: '10px 14px', background: '#f0f5ff', borderRadius: 6 }}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {viewingWeeklyReport.summaryWorkDone || 'Chưa có dữ liệu'}
                </Paragraph>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ color: '#cf1322' }}>
                2. Khó khăn, vướng mắc (Blockers):
              </Text>
              <div style={{ marginTop: 6, padding: '10px 14px', background: '#fff1f0', borderRadius: 6 }}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {viewingWeeklyReport.summaryBlockers || 'Không có khó khăn lớn ghi nhận'}
                </Paragraph>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ color: '#389e0d' }}>
                3. Kế hoạch tuần tiếp theo:
              </Text>
              <div style={{ marginTop: 6, padding: '10px 14px', background: '#f6ffed', borderRadius: 6 }}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {viewingWeeklyReport.summaryNextWeek || 'Chưa có kế hoạch cụ thể'}
                </Paragraph>
              </div>
            </div>

            <div>
              <Text strong style={{ color: '#d46b08' }}>
                4. Ý kiến / Ghi chú của Leader:
              </Text>
              <div style={{ marginTop: 6, padding: '10px 14px', background: '#fff7e6', borderRadius: 6 }}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {viewingWeeklyReport.leaderNote || 'Không có ghi chú'}
                </Paragraph>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DailyReportsPage;
