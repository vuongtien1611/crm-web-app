import React, { useState } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Table,
  Typography,
  Spin,
  Progress,
  App,
  Tabs,
  Alert,
  Avatar,
  Empty,
  Tooltip,
  Modal,
} from 'antd';
import {
  FolderOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  UserAddOutlined,
  SwapOutlined,
  PlusOutlined,
  StopOutlined,
  ArrowLeftOutlined,
  PaperClipOutlined,
  LinkOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  fetchProjectByIdApi,
  startProjectApi,
  markReadyToStartApi,
  startTaskApi,
  blockTaskApi,
  completeTaskApi,
  cancelProjectApi,
  ProjectAssignment,
  ProjectTask,
  ProjectMilestone,
  ProjectAttachment,
} from '../../api/projects';
import { createRowNavigateHandler, createRowActionHandler } from '../../utils/tableUtils';
import { AssignDevModal } from '../../components/projects/AssignDevModal';
import { ReplaceAssigneeModal } from '../../components/projects/ReplaceAssigneeModal';
import { CreateTaskModal } from '../../components/projects/CreateTaskModal';
import { RecordAcceptanceModal } from '../../components/projects/RecordAcceptanceModal';
import { getStatusLabel, formatCurrency, formatDateTime } from '../../constants/labels';
import { useAuthStore } from '../../store/authStore';
import {
  DetailPageHeader,
  DetailSummaryCard,
  DetailSummaryGrid,
  DetailInfoCard,
  DetailRelatedList,
  DetailHistorySection,
} from '../../components/common/detail';

const { Title, Text } = Typography;

export const ProjectDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const isBossOrAdmin = user?.roles?.some((r) => ['BOSS', 'ADMIN'].includes(r));
  const isLeaderOrBoss = user?.roles?.some((r) =>
    ['BOSS', 'ADMIN', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'].includes(r)
  );
  const isFinancialRedacted =
    (user?.roles?.includes('DEV') || user?.roles?.includes('SEO')) &&
    !user?.roles?.includes('ADMIN') &&
    !user?.roles?.includes('BOSS') &&
    !user?.roles?.includes('ACCOUNTANT');

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [acceptanceModalOpen, setAcceptanceModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTabKey, setActiveTabKey] = useState<string>('1');
  const [selectedMilestone, setSelectedMilestone] = useState<ProjectMilestone | null>(null);
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<ProjectAttachment | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);

  const { data: project, isLoading, refetch } = useQuery({
    queryKey: ['projectDetail', id],
    queryFn: () => fetchProjectByIdApi(id!),
    enabled: !!id,
  });

  if (isLoading || !project) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  // Helper render status tag
  const getProjectStatusTag = (status: string) => {
    const label = getStatusLabel(status);
    switch (status) {
      case 'PENDING_ASSIGNMENT':
        return <Tag color="default">{label}</Tag>;
      case 'ASSIGNED':
        return <Tag color="geekblue">{label}</Tag>;
      case 'READY_TO_START':
        return <Tag color="cyan">{label}</Tag>;
      case 'IN_PROGRESS':
        return <Tag color="processing">{label}</Tag>;
      case 'BLOCKED':
        return <Tag color="error">{label}</Tag>;
      case 'COMPLETED':
        return <Tag color="success">{label}</Tag>;
      case 'CANCELLED':
        return <Tag color="default">{label}</Tag>;
      default:
        return <Tag>{label}</Tag>;
    }
  };

  // Bắt đầu triển khai dự án
  const handleStart = async () => {
    if (actionLoading) return;
    setActionLoading('start-project');
    try {
      await startProjectApi(project.id);
      message.success('Bắt đầu triển khai dự án thành công!');
      refetch();
    } catch (err: any) {
      message.error(err.message || 'Không thể bắt đầu dự án');
    } finally {
      setActionLoading(null);
    }
  };

  // Đánh dấu dự án sẵn sàng
  const handleReady = async () => {
    if (actionLoading) return;
    setActionLoading('ready-project');
    try {
      await markReadyToStartApi(project.id);
      message.success('Đã chuyển dự án sang trạng thái Sẵn sàng bắt đầu!');
      refetch();
    } catch (err: any) {
      message.error(err.message || 'Không thể cập nhật trạng thái sẵn sàng');
    } finally {
      setActionLoading(null);
    }
  };

  // Hủy dự án
  const handleCancelProject = async () => {
    if (actionLoading) return;
    setActionLoading('cancel-project');
    try {
      await cancelProjectApi(project.id);
      message.warning('Đã hủy dự án');
      refetch();
    } catch (err: any) {
      message.error(err.message || 'Không thể hủy dự án');
    } finally {
      setActionLoading(null);
    }
  };

  // Bắt đầu công việc
  const handleStartTask = async (taskId: string) => {
    if (actionLoading) return;
    setActionLoading(`start-task-${taskId}`);
    try {
      await startTaskApi(taskId);
      message.success('Đã bắt đầu công việc');
      refetch();
    } catch (err: any) {
      message.error(err.message || 'Không thể bắt đầu công việc');
    } finally {
      setActionLoading(null);
    }
  };

  // Hoàn thành công việc
  const handleCompleteTask = async (taskId: string) => {
    if (actionLoading) return;
    setActionLoading(`complete-task-${taskId}`);
    try {
      await completeTaskApi(taskId);
      message.success('Đã hoàn thành công việc');
      refetch();
    } catch (err: any) {
      message.error(err.message || 'Không thể hoàn thành công việc');
    } finally {
      setActionLoading(null);
    }
  };

  // Chặn công việc
  const handleBlockTask = async (taskId: string) => {
    if (actionLoading) return;
    setActionLoading(`block-task-${taskId}`);
    try {
      await blockTaskApi(taskId, 'Bị chặn trong quá trình thực hiện');
      message.warning('Đã chuyển công việc sang trạng thái bị chặn');
      refetch();
    } catch (err: any) {
      message.error(err.message || 'Không thể chặn công việc');
    } finally {
      setActionLoading(null);
    }
  };

  const activeAssignments = (project.assignments || []).filter((a) => a.is_active);
  const primaryAssignees = activeAssignments.filter((a) => a.assignment_type === 'PRIMARY');
  const supportAssignees = activeAssignments.filter((a) => a.assignment_type === 'SUPPORT');

  const progressVal = Number(project.materialized_progress_percent) || 0;
  const getProgressColor = (val: number) => {
    if (val >= 100) return '#10b981';
    if (val >= 50) return '#0C6B37';
    if (val > 0) return '#3b82f6';
    return '#94a3b8';
  };

  // Milestone columns
  const milestoneColumns = [
    {
      title: 'Tên giai đoạn',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: ProjectMilestone) => (
        <span style={{ fontWeight: 600, color: '#1e293b' }}>
          #{record.sort_order} {text}
        </span>
      ),
    },
    {
      title: 'Tỷ trọng',
      dataIndex: 'weight',
      key: 'weight',
      width: 120,
      render: (w: number) => `${w}%`,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_completed',
      key: 'is_completed',
      width: 160,
      render: (done: boolean) =>
        done ? (
          <Tag color="success" icon={<CheckOutlined />}>
            Hoàn thành
          </Tag>
        ) : (
          <Tag color="processing" icon={<ClockCircleOutlined />}>
            Đang thực hiện
          </Tag>
        ),
    },
    {
      title: 'Thời điểm hoàn thành',
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 180,
      render: (d: string) => (d ? formatDateTime(d) : '—'),
    },
  ];

  // Task columns
  const taskColumns = [
    {
      title: 'Tiêu đề công việc',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: ProjectTask) => (
        <div>
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{text}</span>
          {record.status === 'BLOCKED' && record.blocked_reason && (
            <div style={{ marginTop: 4 }}>
              <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ whiteSpace: 'normal' }}>
                Lý do chặn: {record.blocked_reason}
              </Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Tỷ trọng',
      dataIndex: 'weight',
      key: 'weight',
      width: 90,
      render: (w: number) => `${w}%`,
    },
    {
      title: 'Người thực hiện',
      dataIndex: 'assigned_employee_name',
      key: 'assigned_employee_name',
      width: 200,
      render: (val: string) =>
        val ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Avatar size={22} style={{ backgroundColor: '#2563eb', fontSize: 11 }}>
              {val.charAt(0).toUpperCase()}
            </Avatar>
            <span>{val}</span>
          </div>
        ) : (
          <Text type="secondary" italic>
            Chưa giao
          </Text>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st: string) => {
        const label = getStatusLabel(st);
        switch (st) {
          case 'TODO':
            return <Tag>{label}</Tag>;
          case 'IN_PROGRESS':
            return <Tag color="processing">{label}</Tag>;
          case 'BLOCKED':
            return <Tag color="error">{label}</Tag>;
          case 'DONE':
            return <Tag color="success">{label}</Tag>;
          default:
            return <Tag>{label}</Tag>;
        }
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 180,
      render: (_: any, record: ProjectTask) => (
        <Space>
          {record.status === 'TODO' && (
            <Button
              size="small"
              type="primary"
              loading={actionLoading === `start-task-${record.id}`}
              disabled={!!actionLoading}
              onClick={() => handleStartTask(record.id)}
            >
              Bắt đầu
            </Button>
          )}
          {record.status === 'IN_PROGRESS' && (
            <>
              <Button
                size="small"
                type="primary"
                ghost
                loading={actionLoading === `complete-task-${record.id}`}
                disabled={!!actionLoading}
                onClick={() => handleCompleteTask(record.id)}
              >
                Hoàn thành
              </Button>
              <Button
                size="small"
                danger
                loading={actionLoading === `block-task-${record.id}`}
                disabled={!!actionLoading}
                onClick={() => handleBlockTask(record.id)}
              >
                Chặn
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  // Assignment history columns
  const assignmentColumns = [
    {
      title: 'Nhân viên',
      dataIndex: 'employee_name',
      key: 'employee_name',
      render: (name: string, record: ProjectAssignment) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar
            size={26}
            style={{
              backgroundColor: record.assignment_type === 'PRIMARY' ? '#d97706' : '#2563eb',
              fontWeight: 600,
            }}
          >
            {name ? name.charAt(0).toUpperCase() : <UserOutlined />}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, color: '#1e293b' }}>{name}</div>
            {record.employee_code && (
              <div style={{ fontSize: 11, color: '#64748b' }}>Mã: {record.employee_code}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Vai trò',
      dataIndex: 'assignment_type',
      key: 'assignment_type',
      width: 120,
      render: (t: string) => (
        <Tag color={t === 'PRIMARY' ? 'gold' : 'blue'}>{t === 'PRIMARY' ? 'Chính' : 'Hỗ trợ'}</Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 150,
      render: (active: boolean) =>
        active ? <Tag color="success">Đang phụ trách</Tag> : <Tag color="default">Lịch sử / Đã thay</Tag>,
    },
    {
      title: 'Thời điểm phân công',
      dataIndex: 'assigned_at',
      key: 'assigned_at',
      render: (d: string) => formatDateTime(d),
    },
    {
      title: 'Thời điểm kết thúc',
      dataIndex: 'unassigned_at',
      key: 'unassigned_at',
      render: (d: string) => (d ? formatDateTime(d) : '—'),
    },
    {
      title: 'Lý do thay thế',
      dataIndex: 'replacement_reason',
      key: 'replacement_reason',
      render: (r: string) => r || '—',
    },
  ];

  // Attachment columns
  const attachmentColumns = [
    {
      title: 'Tên tài liệu',
      dataIndex: 'file_title',
      key: 'file_title',
      render: (text: string, record: ProjectAttachment) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PaperClipOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{text || 'Tài liệu đính kèm'}</span>
        </div>
      ),
    },
    {
      title: 'Tải về / Liên kết',
      dataIndex: 'file_url',
      key: 'file_url',
      render: (url: string) =>
        url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <LinkOutlined /> Xem tài liệu
          </a>
        ) : (
          '—'
        ),
    },
    {
      title: 'Người tải lên',
      dataIndex: 'uploaded_by_name',
      key: 'uploaded_by_name',
      render: (name: string) => name || '—',
    },
    {
      title: 'Thời gian tải lên',
      dataIndex: 'uploaded_at',
      key: 'uploaded_at',
      render: (d: string) => (d ? formatDateTime(d) : '—'),
    },
  ];

  return (
    <div className="vmax-detail-page">
      {/* Header */}
      <DetailPageHeader
        title={project.project_name}
        code="DỰ ÁN"
        icon={<FolderOutlined />}
        status={getProjectStatusTag(project.status)}
        onBack={() => navigate('/projects')}
        backLabel="Quay lại danh sách"
        metaTags={
          <Space size={16} wrap>
            <span>Khách hàng: <Text strong>{project.company_name}</Text></span>
            <span>
              Đơn hàng:{' '}
              {isFinancialRedacted ? (
                <Text strong>{project.order_code}</Text>
              ) : (
                <Link to={`/orders/${project.order_id}`} style={{ fontWeight: 600, color: '#0C6B37' }}>
                  {project.order_code}
                </Link>
              )}
            </span>
            <span>Dịch vụ: <Tag color="geekblue">{project.service_name}</Tag></span>
          </Space>
        }
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
              Quay lại
            </Button>
            {project.status === 'ASSIGNED' && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={actionLoading === 'ready-project'}
                disabled={!!actionLoading}
                onClick={handleReady}
              >
                Sẵn sàng bắt đầu
              </Button>
            )}
            {(project.status === 'READY_TO_START' || project.status === 'ASSIGNED') && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={actionLoading === 'start-project'}
                disabled={!!actionLoading}
                onClick={handleStart}
              >
                Bắt đầu triển khai
              </Button>
            )}
            {isLeaderOrBoss && (project.status === 'IN_PROGRESS' || project.status === 'ACCEPTANCE') && !project.acceptance && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={!!actionLoading}
                onClick={() => setAcceptanceModalOpen(true)}
              >
                Ghi nhận nghiệm thu
              </Button>
            )}
            {project.acceptance && (
              <Button
                icon={<SafetyCertificateOutlined />}
                onClick={() => setActiveTabKey('3')}
              >
                Xem nghiệm thu
              </Button>
            )}
            {isBossOrAdmin && project.status !== 'COMPLETED' && project.status !== 'CANCELLED' && (
              <Button
                danger
                icon={<StopOutlined />}
                loading={actionLoading === 'cancel-project'}
                disabled={!!actionLoading}
                onClick={handleCancelProject}
              >
                Hủy dự án
              </Button>
            )}
          </Space>
        }
      />

      {/* KPI Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryCard
          title="TIẾN ĐỘ THỰC TẾ"
          value={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{progressVal}%</span>
              <Progress
                percent={progressVal}
                strokeColor={getProgressColor(progressVal)}
                showInfo={false}
                size="small"
                style={{ flex: 1, margin: 0 }}
              />
            </div>
          }
          valueColor={getProgressColor(progressVal)}
          icon={<CheckCircleOutlined />}
          subtitle={`${project.tasks?.filter((t) => t.status === 'DONE').length || 0} / ${project.tasks?.length || 0} công việc hoàn thành`}
        />
        <DetailSummaryCard
          title="TRẠNG THÁI DỰ ÁN"
          value={getStatusLabel(project.status)}
          valueColor={
            project.status === 'COMPLETED' ? '#0C6B37' :
            project.status === 'IN_PROGRESS' ? '#2563EB' :
            project.status === 'BLOCKED' ? '#DC2626' : undefined
          }
          icon={<ClockCircleOutlined />}
          subtitle={`Bắt đầu: ${project.started_at ? formatDateTime(project.started_at) : 'Chưa bắt đầu'}`}
        />
        <DetailSummaryCard
          title="NHÂN SỰ PHỤ TRÁCH CHÍNH"
          value={
            primaryAssignees.length > 0
              ? primaryAssignees.map((a) => a.employee_name).join(', ')
              : 'Chưa phân công'
          }
          icon={<UserOutlined />}
          subtitle={`Hỗ trợ: ${supportAssignees.length} nhân sự`}
        />
        <DetailSummaryCard
          title="KHÁCH HÀNG & DOANH NGHIỆP"
          value={project.company_name}
          icon={<FolderOutlined />}
          subtitle={project.contact_name ? `Người LH: ${project.contact_name}` : 'Chưa có thông tin liên hệ'}
        />
      </DetailSummaryGrid>

      {/* Dependencies alert if prerequisite is not completed */}
      {project.dependencies && project.dependencies.length > 0 && (
        <Alert
          message="Phụ thuộc dịch vụ (Dependencies)"
          description={
            <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
              {project.dependencies.map((dep: any, idx: number) => (
                <div key={idx} style={{ fontSize: 13 }}>
                  Yêu cầu tiên quyết: <strong>{dep.prerequisite_service_name}</strong> — Triển khai:{' '}
                  <Tag color="cyan">{getStatusLabel(dep.current_prerequisite_delivery_status)}</Tag> / Yêu cầu:{' '}
                  <Tag>{getStatusLabel(dep.required_prerequisite_delivery_status)}</Tag>
                  {!isFinancialRedacted && (
                    <>
                      {' '}— Thanh toán:{' '}
                      <Tag color="orange">{getStatusLabel(dep.current_prerequisite_payment_status)}</Tag> / Yêu cầu:{' '}
                      <Tag>{getStatusLabel(dep.required_prerequisite_payment_status)}</Tag>
                    </>
                  )}
                </div>
              ))}
            </Space>
          }
          type="info"
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      {/* Two-Column Responsive Layout */}
      <div className="vmax-detail-layout">
        {/* Main Column */}
        <div className="vmax-detail-main">
          {/* Tabs */}
          <div className="vmax-card" style={{ padding: '8px 20px 20px 20px', marginBottom: 20 }}>
            <Tabs
              activeKey={activeTabKey}
              onChange={setActiveTabKey}
              items={[
                {
                  key: '1',
                  label: 'Công việc & Tiến độ',
                  children: (
                    <>
                      {project.milestones && project.milestones.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <DetailRelatedList
                            title="Giai đoạn dự án (Milestones)"
                            count={project.milestones.length}
                          >
                            <Table
                              columns={milestoneColumns}
                              dataSource={project.milestones}
                              rowKey="id"
                              pagination={false}
                              scroll={{ x: 'max-content' }}
                              onRow={createRowActionHandler((record) => setSelectedMilestone(record))}
                            />
                          </DetailRelatedList>
                        </div>
                      )}

                      <DetailRelatedList
                        title="Danh sách công việc (Tasks)"
                        count={project.tasks?.length || 0}
                        extra={
                          project.status !== 'COMPLETED' &&
                          project.status !== 'CANCELLED' && (
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setTaskModalOpen(true)}>
                              Thêm công việc
                            </Button>
                          )
                        }
                      >
                        <Table
                          columns={taskColumns}
                          dataSource={project.tasks || []}
                          rowKey="id"
                          pagination={false}
                          scroll={{ x: 'max-content' }}
                          locale={{
                            emptyText: 'Chưa có công việc nào được tạo cho dự án này.',
                          }}
                          onRow={createRowActionHandler((record) => setSelectedTask(record))}
                        />
                      </DetailRelatedList>
                    </>
                  ),
                },
                {
                  key: '2',
                  label: 'Phân công & Lịch sử thay thế',
                  children: (
                    <DetailRelatedList
                      title="Nhân sự dự án (Tối đa 2 nhân sự chính)"
                      count={project.assignments?.length || 0}
                      extra={
                        isLeaderOrBoss &&
                        project.status !== 'COMPLETED' &&
                        project.status !== 'CANCELLED' && (
                          <Space wrap>
                            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAssignModalOpen(true)}>
                              Phân công
                            </Button>
                            <Button icon={<SwapOutlined />} onClick={() => setReplaceModalOpen(true)}>
                              Thay thế chính
                            </Button>
                          </Space>
                        )
                      }
                    >
                      <Table
                        columns={assignmentColumns}
                        dataSource={project.assignments || []}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        onRow={createRowNavigateHandler(navigate, (record: any) => record.employee_id ? `/employees/${record.employee_id}` : null)}
                        locale={{
                          emptyText: 'Chưa có lịch sử phân công nhân sự.',
                        }}
                      />
                    </DetailRelatedList>
                  ),
                },
                {
                  key: '3',
                  label: 'Nghiệm thu khách hàng',
                  children: (
                    <div style={{ paddingTop: 12 }}>
                      {project.acceptance ? (
                        <Descriptions bordered size="small" column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}>
                          <Descriptions.Item label="Người liên hệ khách hàng">
                            <strong>{project.acceptance.customer_contact_name || project.acceptance.customer_contact_id}</strong>
                          </Descriptions.Item>
                          <Descriptions.Item label="Người đại diện nghiệm thu">
                            <strong>{project.acceptance.accepted_by_name}</strong>
                          </Descriptions.Item>
                          <Descriptions.Item label="Thời điểm nghiệm thu">
                            {formatDateTime(project.acceptance.accepted_at)}
                          </Descriptions.Item>
                          <Descriptions.Item label="Người ghi nhận">
                            {project.acceptance.recorded_by_name || 'Hệ thống'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Tài liệu / Bằng chứng nghiệm thu" span={2}>
                            {project.acceptance.evidence_document ? (
                              <a
                                href={project.acceptance.evidence_document}
                                target="_blank"
                                rel="noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#0C6B37' }}
                              >
                                <LinkOutlined /> {project.acceptance.evidence_document}
                              </a>
                            ) : (
                              '—'
                            )}
                          </Descriptions.Item>
                        </Descriptions>
                      ) : (
                        <Empty
                          description={
                            <span>
                              Chưa có thông tin nghiệm thu.{' '}
                              {project.status === 'IN_PROGRESS' &&
                                'Bấm "Ghi nhận nghiệm thu" ở trên khi hoàn thành các hạng mục triển khai.'}
                            </span>
                          }
                        />
                      )}
                    </div>
                  ),
                },
                {
                  key: '4',
                  label: 'Tài liệu đính kèm',
                  children: (
                    <DetailRelatedList
                      title="Tài liệu đính kèm dự án"
                      count={project.attachments?.length || 0}
                    >
                      <Table
                        columns={attachmentColumns}
                        dataSource={project.attachments || []}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        onRow={createRowActionHandler((record) => {
                          if (record.file_url) {
                            window.open(record.file_url, '_blank');
                          } else {
                            setSelectedAttachment(record);
                          }
                        })}
                        locale={{
                          emptyText: 'Chưa có tài liệu đính kèm cho dự án này.',
                        }}
                      />
                    </DetailRelatedList>
                  ),
                },
                {
                  key: '5',
                  label: 'Lịch sử kiểm toán',
                  children: (
                    <DetailHistorySection
                      title="Nhật ký hoạt động (Audit Logs)"
                      extra={<Tag>{project.auditLogs?.length || 0}</Tag>}
                    >
                      <Table
                        dataSource={project.auditLogs || []}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                        scroll={{ x: 'max-content' }}
                        onRow={createRowActionHandler((record) => setSelectedAuditLog(record))}
                        columns={[
                          {
                            title: 'Hành động',
                            dataIndex: 'action',
                            key: 'action',
                            render: (act: string) => <Tag color="blue">{act}</Tag>,
                          },
                          {
                            title: 'Người thực hiện',
                            dataIndex: 'actor_name',
                            key: 'actor_name',
                            render: (val: string) => val || 'Hệ thống',
                          },
                          {
                            title: 'Thời gian',
                            dataIndex: 'created_at',
                            key: 'created_at',
                            render: (d: string) => formatDateTime(d),
                          },
                        ]}
                        locale={{
                          emptyText: 'Chưa có nhật ký hoạt động nào.',
                        }}
                      />
                    </DetailHistorySection>
                  ),
                },
              ]}
            />
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="vmax-detail-side">
          {/* Thông tin đối tác & hợp đồng */}
          <DetailInfoCard
            title="Thông tin đối tác & Hợp đồng"
            columns={1}
            items={[
              { label: 'Doanh nghiệp / Khách', value: <Text strong>{project.company_name}</Text> },
              {
                label: 'Người liên hệ',
                value: project.contact_name ? (
                  <span>
                    {project.contact_name}{' '}
                    {project.contact_phone && (
                      <a href={`tel:${project.contact_phone}`} style={{ color: '#0C6B37', fontSize: 12 }}>
                        ({project.contact_phone})
                      </a>
                    )}
                  </span>
                ) : '—'
              },
              {
                label: 'Dịch vụ',
                value: <Tag color="geekblue" style={{ borderRadius: 4 }}>{project.service_name}</Tag>
              },
              {
                label: 'Đơn hàng liên quan',
                value: isFinancialRedacted ? (
                  <Text strong>{project.order_code}</Text>
                ) : (
                  <Link to={`/orders/${project.order_id}`} style={{ fontWeight: 600, color: '#0C6B37' }}>
                    {project.order_code} (Mục #{project.order_item_id})
                  </Link>
                )
              },
              ...(!isFinancialRedacted ? [{
                label: 'Giá trị thực tế',
                value: <Text strong style={{ color: '#0C6B37' }}>{formatCurrency(project.net_service_value)}</Text>
              }] : []),
              {
                label: 'Triển khai đơn',
                value: <Tag color="cyan">{getStatusLabel(project.order_item_delivery_status)}</Tag>
              },
              ...(!isFinancialRedacted ? [{
                label: 'Thanh toán đơn',
                value: (
                  <Tag color={project.order_item_payment_status === 'FULLY_PAID' ? 'green' : 'orange'}>
                    {getStatusLabel(project.order_item_payment_status)}
                  </Tag>
                )
              }] : []),
            ]}
          />

          {/* Nhân sự phụ trách */}
          <DetailInfoCard
            title="Nhân sự thực hiện"
            columns={1}
            items={[
              {
                label: 'Phụ trách chính (Primary)',
                value: primaryAssignees.length > 0 ? (
                  <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 2 }}>
                    {primaryAssignees.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: '#fef3c7',
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: '1px solid #fde68a',
                          cursor: 'pointer',
                        }}
                        onClick={() => a.employee_id && navigate(`/employees/${a.employee_id}`)}
                      >
                        <Avatar size={18} style={{ backgroundColor: '#d97706', fontSize: 10, fontWeight: 600 }}>
                          {a.employee_name ? a.employee_name.charAt(0).toUpperCase() : 'P'}
                        </Avatar>
                        <span style={{ fontWeight: 600, color: '#78350f', fontSize: 12 }}>{a.employee_name}</span>
                        {a.employee_code && (
                          <span style={{ fontSize: 11, color: '#92400e' }}>({a.employee_code})</span>
                        )}
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary" italic>Chưa phân công</Text>
                )
              },
              {
                label: 'Nhân sự hỗ trợ (Support)',
                value: supportAssignees.length > 0 ? (
                  <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 2 }}>
                    {supportAssignees.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: '#eff6ff',
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: '1px solid #bfdbfe',
                          cursor: 'pointer',
                        }}
                        onClick={() => a.employee_id && navigate(`/employees/${a.employee_id}`)}
                      >
                        <Avatar size={18} style={{ backgroundColor: '#2563eb', fontSize: 10, fontWeight: 600 }}>
                          {a.employee_name ? a.employee_name.charAt(0).toUpperCase() : 'S'}
                        </Avatar>
                        <span style={{ fontWeight: 600, color: '#1e3a8a', fontSize: 12 }}>{a.employee_name}</span>
                        {a.employee_code && (
                          <span style={{ fontSize: 11, color: '#1e40af' }}>({a.employee_code})</span>
                        )}
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary" italic>Không có</Text>
                )
              },
            ]}
          />

          {/* Mốc thời gian */}
          <DetailInfoCard
            title="Mốc thời gian"
            columns={1}
            items={[
              {
                label: 'Ngày bắt đầu',
                value: project.started_at ? formatDateTime(project.started_at) : <Text type="secondary">Chưa bắt đầu</Text>
              },
              {
                label: 'Ngày hoàn thành',
                value: project.completed_at ? formatDateTime(project.completed_at) : <Text type="secondary">—</Text>
              },
              {
                label: 'Cập nhật lần cuối',
                value: project.updated_at ? formatDateTime(project.updated_at) : '—'
              },
            ]}
          />
        </div>
      </div>

      {/* Modals */}
      <AssignDevModal
        visible={assignModalOpen}
        projectId={project.id}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={() => refetch()}
      />

      <ReplaceAssigneeModal
        visible={replaceModalOpen}
        projectId={project.id}
        activeAssignments={activeAssignments}
        onClose={() => setReplaceModalOpen(false)}
        onSuccess={() => refetch()}
      />

      <CreateTaskModal
        visible={taskModalOpen}
        projectId={project.id}
        activeAssignments={activeAssignments}
        onClose={() => setTaskModalOpen(false)}
        onSuccess={() => refetch()}
      />

      {isLeaderOrBoss && (project.status === 'IN_PROGRESS' || project.status === 'ACCEPTANCE') && !project.acceptance && (
        <RecordAcceptanceModal
          visible={acceptanceModalOpen}
          projectId={project.id}
          defaultContactId={project.contact_id}
          onClose={() => setAcceptanceModalOpen(false)}
          onSuccess={() => refetch()}
        />
      )}

      {/* Milestone Detail Modal */}
      <Modal
        title={`Chi tiết Giai đoạn (Milestone) #${selectedMilestone?.id || ''}`}
        open={!!selectedMilestone}
        onCancel={() => setSelectedMilestone(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedMilestone(null)}>
            Đóng
          </Button>,
        ]}
        width={600}
      >
        {selectedMilestone && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Tên giai đoạn">{selectedMilestone.title}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={selectedMilestone.is_completed ? 'green' : 'blue'}>
                {selectedMilestone.is_completed ? 'Đã hoàn thành' : 'Đang triển khai'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Thứ tự">{selectedMilestone.sort_order}</Descriptions.Item>
            <Descriptions.Item label="Trọng số">{selectedMilestone.weight}%</Descriptions.Item>
            <Descriptions.Item label="Thời điểm hoàn thành">
              {selectedMilestone.completed_at ? formatDateTime(selectedMilestone.completed_at) : 'Chưa hoàn thành'}
            </Descriptions.Item>
            <Descriptions.Item label="Thời điểm tạo">{formatDateTime(selectedMilestone.created_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Task Detail Modal */}
      <Modal
        title={`Chi tiết công việc: ${selectedTask?.title || ''}`}
        open={!!selectedTask}
        onCancel={() => setSelectedTask(null)}
        footer={[
          selectedTask?.assigned_to_employee_id && (
            <Button
              key="assignee"
              icon={<UserOutlined />}
              onClick={() => navigate(`/employees/${selectedTask.assigned_to_employee_id}`)}
            >
              Hồ sơ người phụ trách
            </Button>
          ),
          <Button key="close" type="primary" onClick={() => setSelectedTask(null)}>
            Đóng
          </Button>,
        ]}
        width={650}
      >
        {selectedTask && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã công việc">{selectedTask.id}</Descriptions.Item>
            <Descriptions.Item label="Tên công việc">{selectedTask.title}</Descriptions.Item>
            <Descriptions.Item label="Trọng số">{selectedTask.weight}%</Descriptions.Item>
            <Descriptions.Item label="Người phụ trách">
              {selectedTask.assigned_employee_name ? (
                <Space>
                  <Text strong>{selectedTask.assigned_employee_name}</Text>
                  {selectedTask.assigned_to_employee_id && (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => navigate(`/employees/${selectedTask.assigned_to_employee_id}`)}
                    >
                      Xem hồ sơ
                    </Button>
                  )}
                </Space>
              ) : (
                'Chưa phân công'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={selectedTask.status === 'DONE' ? 'green' : selectedTask.status === 'BLOCKED' ? 'error' : selectedTask.status === 'IN_PROGRESS' ? 'blue' : 'default'}>
                {getStatusLabel(selectedTask.status)}
              </Tag>
            </Descriptions.Item>
            {selectedTask.blocked_reason && (
              <Descriptions.Item label="Lý do tắc nghẽn (Block)">
                <Text type="danger">{selectedTask.blocked_reason}</Text>
              </Descriptions.Item>
            )}
            {selectedTask.blocked_since && (
              <Descriptions.Item label="Bị tắc nghẽn từ">
                {formatDateTime(selectedTask.blocked_since)}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Thời điểm hoàn thành">
              {selectedTask.completed_at ? formatDateTime(selectedTask.completed_at) : 'Chưa hoàn thành'}
            </Descriptions.Item>
            <Descriptions.Item label="Thời điểm tạo">{formatDateTime(selectedTask.created_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Attachment Detail Modal */}
      <Modal
        title={`Chi tiết tài liệu đính kèm`}
        open={!!selectedAttachment}
        onCancel={() => setSelectedAttachment(null)}
        footer={[
          selectedAttachment?.file_url && (
            <Button
              key="open"
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => window.open(selectedAttachment.file_url, '_blank')}
            >
              Mở liên kết file
            </Button>
          ),
          <Button key="close" onClick={() => setSelectedAttachment(null)}>
            Đóng
          </Button>,
        ]}
        width={600}
      >
        {selectedAttachment && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Tên tài liệu">{selectedAttachment.file_title}</Descriptions.Item>
            <Descriptions.Item label="Đường dẫn file">
              {selectedAttachment.file_url ? (
                <a href={selectedAttachment.file_url} target="_blank" rel="noreferrer">
                  {selectedAttachment.file_url}
                </a>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Người tải lên">{selectedAttachment.uploaded_by_name || 'Hệ thống'}</Descriptions.Item>
            <Descriptions.Item label="Thời điểm tải lên">{formatDateTime(selectedAttachment.uploaded_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Audit Log Detail Modal */}
      <Modal
        title="Chi tiết Nhật ký Hoạt động"
        open={!!selectedAuditLog}
        onCancel={() => setSelectedAuditLog(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedAuditLog(null)}>
            Đóng
          </Button>,
        ]}
        width={650}
      >
        {selectedAuditLog && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã log">{selectedAuditLog.id}</Descriptions.Item>
            <Descriptions.Item label="Hành động">
              <Tag color="blue">{selectedAuditLog.action}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Người thực hiện">{selectedAuditLog.actor_name || 'Hệ thống'}</Descriptions.Item>
            <Descriptions.Item label="Thời gian">{formatDateTime(selectedAuditLog.created_at)}</Descriptions.Item>
            {selectedAuditLog.payload && (
              <Descriptions.Item label="Dữ liệu chi tiết">
                <pre style={{ background: '#f8fafc', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>
                  {typeof selectedAuditLog.payload === 'object'
                    ? JSON.stringify(selectedAuditLog.payload, null, 2)
                    : String(selectedAuditLog.payload)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};
