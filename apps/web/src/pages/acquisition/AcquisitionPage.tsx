import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Typography,
  Tabs,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  App,
  Alert,
  Badge,
  Descriptions,
} from 'antd';
import {
  GlobalOutlined,
  ShareAltOutlined,
  UsergroupAddOutlined,
  DashboardOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  StopOutlined,
  InfoCircleOutlined,
  UserOutlined,
  TeamOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import {
  getPlatformsApi,
  createPlatformApi,
  getChannelsApi,
  createChannelApi,
  getMarketAssignmentsApi,
  assignMarketApi,
  deactivateMarketAssignmentApi,
  getAcquisitionOverviewApi,
  getLeadDistributionApi,
  PlatformItem,
  ChannelItem,
  MarketAssignmentItem,
  AcquisitionOverview,
  LeadDistributionItem,
} from '../../api/leads';
import { getEmployees, EmployeeItem } from '../../api/employees';
import { createRowNavigateHandler, createRowActionHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

export const AcquisitionPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdminOrBoss = user?.roles?.some((r: string) => ['ADMIN', 'BOSS'].includes(r));

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // Data states
  const [overview, setOverview] = useState<AcquisitionOverview | null>(null);
  const [platforms, setPlatforms] = useState<PlatformItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [assignments, setAssignments] = useState<MarketAssignmentItem[]>([]);
  const [distribution, setDistribution] = useState<LeadDistributionItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);

  // Modals
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<any | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<any | null>(null);

  const [platformForm] = Form.useForm();
  const [channelForm] = Form.useForm();
  const [assignForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [ovData, pData, cData, aData, distData] = await Promise.all([
        getAcquisitionOverviewApi(),
        getPlatformsApi(),
        getChannelsApi(),
        getMarketAssignmentsApi(),
        getLeadDistributionApi(),
      ]);
      setOverview(ovData);
      setPlatforms(pData);
      setChannels(cData);
      setAssignments(aData);
      setDistribution(distData);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải dữ liệu tiếp thị & nguồn Lead');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (isAdminOrBoss) {
      getEmployees({ limit: 100, status: 'ACTIVE' })
        .then((res: any) => setEmployees(res?.data || []))
        .catch(() => {});
    }
  }, [isAdminOrBoss]);

  // Handlers
  const handleCreatePlatform = async (values: { code: string; name: string }) => {
    try {
      await createPlatformApi(values);
      message.success(`Đã thêm nền tảng [${values.code.toUpperCase()}] thành công`);
      setIsPlatformModalOpen(false);
      platformForm.resetFields();
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo nền tảng');
    }
  };

  const handleCreateChannel = async (values: { code: string; name: string }) => {
    try {
      await createChannelApi(values);
      message.success(`Đã thêm kênh tiếp thị [${values.code.toUpperCase()}] thành công`);
      setIsChannelModalOpen(false);
      channelForm.resetFields();
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo kênh');
    }
  };

  const handleCreateAssignment = async (values: {
    employeeId: string;
    platformId?: string;
    channelId?: string;
  }) => {
    try {
      await assignMarketApi(values);
      message.success('Đã cấu hình phân bổ thị trường thành công');
      setIsAssignModalOpen(false);
      assignForm.resetFields();
      loadData();
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo phân bổ thị trường');
    }
  };

  // Trạng thái đang thao tác theo từng ID phân bổ
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleDeactivateAssignment = async (id: string) => {
    if (actionLoadingId) return;
    setActionLoadingId(id);
    try {
      await deactivateMarketAssignmentApi(id);
      message.success('Đã vô hiệu hóa phân bổ thị trường');
      await loadData();
    } catch (err: any) {
      message.error(err.message || 'Không thể vô hiệu hóa phân bổ');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="vmax-page-wrapper" style={{ padding: 24 }}>
      {/* Header */}
      <div className="vmax-page-header-toolbar">
        <div>
          <Title level={3} style={{ margin: 0, color: '#0f766e' }}>
            <GlobalOutlined style={{ marginRight: 10 }} />
            Quản Lý Nguồn Thu Hút & Phân Bổ Thị Trường (Acquisition)
          </Title>
          <Text type="secondary">
            Cấu hình Platform, Channel và phân bổ tự động Lead cho Sale phụ trách theo đúng quy tắc Canonical
          </Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Làm mới
          </Button>
          {isAdminOrBoss && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsAssignModalOpen(true)}
              style={{ background: '#0f766e', borderColor: '#0f766e' }}
            >
              Cấu hình phân bổ Sale
            </Button>
          )}
        </Space>
      </div>

      {/* Tabs */}
      <Card variant="borderless" className="vmax-card">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            // TAB 1: OVERVIEW
            {
              key: 'overview',
              label: (
                <span>
                  <DashboardOutlined /> Tổng quan nguồn Lead
                </span>
              ),
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message="Quy tắc Canonical Channel: MANUAL != ORGANIC"
                    description="Lead nhập tay (MANUAL từ Outreach/Telesale/Sự kiện) được hạch toán độc lập hoàn toàn với Lead tìm kiếm tự nhiên (ORGANIC từ SEO Content/Website). Creator ban đầu chỉ mang tính quy kết attribution (V1: 0 commission, 0 KPI)."
                    style={{ marginBottom: 20 }}
                  />

                  {/* Summary Metric Cards */}
                  <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col xs={24} sm={12} md={6}>
                      <Card variant="borderless" style={{ background: '#f8fafc', borderRadius: 12 }}>
                        <Statistic
                          title="Tổng số Lead ghi nhận"
                          value={overview?.totalLeads || 0}
                          valueStyle={{ color: '#0f766e', fontWeight: 700 }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Card
                        variant="borderless"
                        hoverable
                        style={{
                          background: '#f8fafc',
                          borderRadius: 12,
                          cursor: 'pointer',
                          border: (overview?.unassignedLeads || 0) > 0 ? '1px dashed #ea580c' : undefined,
                        }}
                        onClick={() => navigate('/leads?assignment=UNASSIGNED')}
                      >
                        <Statistic
                          title="Lead chưa có Sale (Click để phân công)"
                          value={overview?.unassignedLeads || 0}
                          valueStyle={{ color: (overview?.unassignedLeads || 0) > 0 ? '#ea580c' : '#16a34a', fontWeight: 700 }}
                          suffix={<span style={{ fontSize: 13, color: '#64748b', fontWeight: 500, marginLeft: 4 }}>➔</span>}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Card variant="borderless" style={{ background: '#f8fafc', borderRadius: 12 }}>
                        <Statistic
                          title="Lead đã chốt thành Deal (Converted)"
                          value={overview?.convertedLeads || 0}
                          valueStyle={{ color: '#2563eb', fontWeight: 700 }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Card variant="borderless" style={{ background: '#f8fafc', borderRadius: 12 }}>
                        <Statistic
                          title="Tỷ lệ chuyển đổi tổng thể"
                          value={overview?.conversionRate || 0}
                          suffix="%"
                          valueStyle={{ color: '#059669', fontWeight: 700 }}
                        />
                      </Card>
                    </Col>
                  </Row>

                  {/* Platform vs Channel breakdown tables */}
                  <Row gutter={[20, 20]}>
                    <Col xs={24} lg={12}>
                      <Card
                        title="Hiệu quả theo Nền tảng (Platform)"
                        size="small"
                        variant="borderless"
                        style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}
                      >
                        <Table
                          rowKey="id"
                          pagination={false}
                          dataSource={overview?.platforms || []}
                          onRow={createRowActionHandler((r) => setSelectedPlatform(r))}
                          columns={[
                            {
                              title: 'Nền tảng',
                              key: 'name',
                              render: (_: any, r: any) => (
                                <div>
                                  <Text strong>{r.name}</Text>
                                  <Tag color="cyan" style={{ marginLeft: 6 }}>{r.code}</Tag>
                                </div>
                              ),
                            },
                            {
                              title: 'Tổng Lead',
                              dataIndex: 'totalLeads',
                              key: 'totalLeads',
                              render: (val: number) => <Text strong>{val}</Text>,
                            },
                            {
                              title: 'Converted',
                              dataIndex: 'convertedLeads',
                              key: 'convertedLeads',
                              render: (val: number) => <Tag color="blue">{val}</Tag>,
                            },
                            {
                              title: 'Chuyển đổi',
                              dataIndex: 'conversionRate',
                              key: 'conversionRate',
                              render: (val: number) => `${val}%`,
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card
                        title="Hiệu quả theo Kênh tiếp thị (Channel)"
                        size="small"
                        variant="borderless"
                        style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}
                      >
                        <Table
                          rowKey="id"
                          pagination={false}
                          dataSource={overview?.channels || []}
                          onRow={createRowActionHandler((r) => setSelectedChannel(r))}
                          columns={[
                            {
                              title: 'Kênh tiếp thị',
                              key: 'name',
                              render: (_: any, r: any) => (
                                <div>
                                  <Text strong>{r.name}</Text>
                                  <Tag color={r.code === 'MANUAL' ? 'orange' : 'geekblue'} style={{ marginLeft: 6 }}>
                                    {r.code}
                                  </Tag>
                                </div>
                              ),
                            },
                            {
                              title: 'Tổng Lead',
                              dataIndex: 'totalLeads',
                              key: 'totalLeads',
                              render: (val: number) => <Text strong>{val}</Text>,
                            },
                            {
                              title: 'Converted',
                              dataIndex: 'convertedLeads',
                              key: 'convertedLeads',
                              render: (val: number) => <Tag color="blue">{val}</Tag>,
                            },
                            {
                              title: 'Chuyển đổi',
                              dataIndex: 'conversionRate',
                              key: 'conversionRate',
                              render: (val: number) => `${val}%`,
                            },
                          ]}
                        />
                      </Card>
                    </Col>
                  </Row>
                </div>
              ),
            },

            // TAB 2: PLATFORMS
            {
              key: 'platforms',
              label: (
                <span>
                  <GlobalOutlined /> Nền tảng tiếp thị ({platforms.length})
                </span>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <Text type="secondary">
                      Danh mục nền tảng quảng cáo và tiếp thị khách hàng được hỗ trợ trên hệ thống.
                    </Text>
                    {isAdminOrBoss && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setIsPlatformModalOpen(true)}
                        style={{ background: '#0f766e', borderColor: '#0f766e' }}
                      >
                        Thêm Nền tảng
                      </Button>
                    )}
                  </div>

                  <Table
                    rowKey="id"
                    dataSource={platforms}
                    pagination={false}
                    onRow={createRowActionHandler((r) => setSelectedPlatform(r))}
                    columns={[
                      {
                        title: 'Mã nền tảng (Code)',
                        dataIndex: 'code',
                        key: 'code',
                        render: (code: string) => <Tag color="blue" style={{ fontWeight: 600 }}>{code}</Tag>,
                      },
                      {
                        title: 'Tên nền tảng tiếp thị',
                        dataIndex: 'name',
                        key: 'name',
                        render: (name: string) => <Text strong>{name}</Text>,
                      },
                      {
                        title: 'Trạng thái',
                        dataIndex: 'is_active',
                        key: 'is_active',
                        render: (active: boolean) => (
                          <Tag color={active ? 'success' : 'default'} icon={active ? <CheckCircleOutlined /> : <StopOutlined />}>
                            {active ? 'Đang hoạt động' : 'Tạm dừng'}
                          </Tag>
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },

            // TAB 3: CHANNELS
            {
              key: 'channels',
              label: (
                <span>
                  <ShareAltOutlined /> Kênh tiếp thị ({channels.length})
                </span>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <Text type="secondary">
                      5 Canonical Channels: ORGANIC, PAID_ADS, REFERRAL, DIRECT, MANUAL.
                    </Text>
                    {isAdminOrBoss && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setIsChannelModalOpen(true)}
                        style={{ background: '#0f766e', borderColor: '#0f766e' }}
                      >
                        Thêm Kênh tiếp thị
                      </Button>
                    )}
                  </div>

                  <Table
                    rowKey="id"
                    dataSource={channels}
                    pagination={false}
                    onRow={createRowActionHandler((r) => setSelectedChannel(r))}
                    columns={[
                      {
                        title: 'Mã kênh (Code)',
                        dataIndex: 'code',
                        key: 'code',
                        render: (code: string) => (
                          <Tag color={code === 'MANUAL' ? 'orange' : 'purple'} style={{ fontWeight: 600 }}>
                            {code}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Tên kênh tiếp thị',
                        dataIndex: 'name',
                        key: 'name',
                        render: (name: string) => <Text strong>{name}</Text>,
                      },
                      {
                        title: 'Trạng thái',
                        dataIndex: 'is_active',
                        key: 'is_active',
                        render: (active: boolean) => (
                          <Tag color={active ? 'success' : 'default'} icon={active ? <CheckCircleOutlined /> : <StopOutlined />}>
                            {active ? 'Đang hoạt động' : 'Tạm dừng'}
                          </Tag>
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },

            // TAB 4: MARKET ASSIGNMENT
            {
              key: 'market-assignments',
              label: (
                <span>
                  <UsergroupAddOutlined /> Phân bổ thị trường (Market Assignment) ({assignments.length})
                </span>
              ),
              children: (
                <div>
                  <Alert
                    type="warning"
                    showIcon
                    message="Cơ chế phân bổ Market Assignment (Open Business Rule)"
                    description="Boss/Admin cấu hình Platform + Channel -> Sale phụ trách. Khi Lead được tạo: nếu đúng 1 Sale active -> tự động gán; nếu không có hoặc có nhiều hơn 1 Sale cùng active -> hệ thống giữ trống assigned_sale_id để phân công chỉ định, không tự động bốc ngẫu nhiên."
                    style={{ marginBottom: 16 }}
                  />

                  <Table
                    rowKey="id"
                    dataSource={assignments}
                    pagination={{ pageSize: 10 }}
                    onRow={createRowNavigateHandler(navigate, (r) => r.employee_id ? `/employees/${r.employee_id}` : null)}
                    columns={[
                      {
                        title: 'Nền tảng (Platform)',
                        key: 'platform',
                        render: (_: any, r: MarketAssignmentItem) =>
                          r.platform_name ? (
                            <Tag color="cyan">{r.platform_name} ({r.platform_code})</Tag>
                          ) : (
                            <Tag color="default">Mọi nền tảng</Tag>
                          ),
                      },
                      {
                        title: 'Kênh tiếp thị (Channel)',
                        key: 'channel',
                        render: (_: any, r: MarketAssignmentItem) =>
                          r.channel_name ? (
                            <Tag color="purple">{r.channel_name} ({r.channel_code})</Tag>
                          ) : (
                            <Tag color="default">Mọi kênh</Tag>
                          ),
                      },
                      {
                        title: 'Sale phụ trách',
                        key: 'sale',
                        render: (_: any, r: MarketAssignmentItem) => (
                          <Space size={6}>
                            <UserOutlined style={{ color: '#0f766e' }} />
                            <Text strong>{r.employee_name}</Text>
                            <Text type="secondary">({r.employee_code})</Text>
                          </Space>
                        ),
                      },
                      {
                        title: 'Team bán hàng',
                        dataIndex: 'team_name',
                        key: 'team_name',
                        render: (team: string | null) => (
                          <Space size={4}>
                            <TeamOutlined style={{ color: '#64748b' }} />
                            <span>{team || 'Chưa gán team'}</span>
                          </Space>
                        ),
                      },
                      {
                        title: 'Trạng thái',
                        dataIndex: 'is_active',
                        key: 'is_active',
                        render: (active: boolean) => (
                          <Badge
                            status={active ? 'success' : 'default'}
                            text={active ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                          />
                        ),
                      },
                      {
                        title: 'Ngày phân bổ',
                        dataIndex: 'assigned_at',
                        key: 'assigned_at',
                        render: (val: string) => (val ? new Date(val).toLocaleDateString('vi-VN') : 'N/A'),
                      },
                      ...(isAdminOrBoss
                        ? [
                            {
                              title: 'Thao tác',
                              key: 'actions',
                              render: (_: any, r: MarketAssignmentItem) =>
                                r.is_active ? (
                                  <Popconfirm
                                    title="Vô hiệu hóa phân bổ này?"
                                    description="Sale này sẽ ngừng tự động nhận Lead từ cặp Platform + Channel này."
                                    onConfirm={() => handleDeactivateAssignment(r.id)}
                                    okText="Đồng ý"
                                    cancelText="Hủy"
                                    disabled={!!actionLoadingId}
                                  >
                                    <Button
                                      size="small"
                                      danger
                                      icon={<StopOutlined />}
                                      loading={actionLoadingId === r.id}
                                      disabled={!!actionLoadingId}
                                    >
                                      Vô hiệu hóa
                                    </Button>
                                  </Popconfirm>
                                ) : (
                                  <Text type="secondary">Đã đóng</Text>
                                ),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              ),
            },

            // TAB 5: LEAD DISTRIBUTION
            {
              key: 'distribution',
              label: (
                <span>
                  <TeamOutlined /> Phân bổ Lead theo Sale ({distribution.length})
                </span>
              ),
              children: (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    Thống kê khối lượng Lead đang được phụ trách và tỷ lệ chốt Deal thực tế theo từng nhân sự Sale.
                  </Text>

                  <Table
                    rowKey="employeeId"
                    dataSource={distribution}
                    pagination={{ pageSize: 15 }}
                    onRow={createRowNavigateHandler(navigate, (r) => `/employees/${r.employeeId}`)}
                    columns={[
                      {
                        title: 'Nhân viên Sale',
                        key: 'employee',
                        render: (_: any, r: LeadDistributionItem) => (
                          <Space>
                            <UserOutlined style={{ color: '#0f766e' }} />
                            <Text strong>{r.fullName}</Text>
                            <Text type="secondary">({r.employeeCode})</Text>
                          </Space>
                        ),
                      },
                      {
                        title: 'Team bán hàng',
                        dataIndex: 'teamName',
                        key: 'teamName',
                        render: (team: string) => <Tag color="blue">{team}</Tag>,
                      },
                      {
                        title: 'Market Assignments đang chạy',
                        dataIndex: 'activeAssignmentsCount',
                        key: 'activeAssignmentsCount',
                        render: (val: number) => <Tag color="cyan">{val} nguồn</Tag>,
                      },
                      {
                        title: 'Tổng Lead đang chăm sóc',
                        dataIndex: 'assignedLeadsCount',
                        key: 'assignedLeadsCount',
                        render: (val: number) => <Text strong style={{ color: '#0f766e' }}>{val}</Text>,
                      },
                      {
                        title: 'Số Lead đã chốt (Converted)',
                        dataIndex: 'convertedLeadsCount',
                        key: 'convertedLeadsCount',
                        render: (val: number) => <Tag color="green">{val}</Tag>,
                      },
                      {
                        title: 'Tỷ lệ chuyển đổi cá nhân',
                        dataIndex: 'conversionRate',
                        key: 'conversionRate',
                        render: (val: number) => `${val}%`,
                      },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* MODAL: CREATE PLATFORM */}
      <Modal
        title="Thêm Nền Tảng Tiếp Thị Mới"
        open={isPlatformModalOpen}
        onCancel={() => setIsPlatformModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={platformForm} layout="vertical" className="vmax-form" onFinish={handleCreatePlatform}>
          <Form.Item
            label="Mã nền tảng (Platform Code)"
            name="code"
            rules={[{ required: true, message: 'Vui lòng nhập mã nền tảng (VD: THREADS, INSTAGRAM)' }]}
          >
            <Input placeholder="VD: THREADS" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item
            label="Tên hiển thị nền tảng"
            name="name"
            rules={[{ required: true, message: 'Vui lòng nhập tên nền tảng' }]}
          >
            <Input placeholder="VD: Threads Ads & Community" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setIsPlatformModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" style={{ background: '#0f766e', borderColor: '#0f766e' }}>
                Lưu nền tảng
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: CREATE CHANNEL */}
      <Modal
        title="Thêm Kênh Tiếp Thị Mới"
        open={isChannelModalOpen}
        onCancel={() => setIsChannelModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={channelForm} layout="vertical" className="vmax-form" onFinish={handleCreateChannel}>
          <Form.Item
            label="Mã kênh tiếp thị (Channel Code)"
            name="code"
            rules={[{ required: true, message: 'Vui lòng nhập mã kênh (VD: EVENT, INFLUENCER)' }]}
          >
            <Input placeholder="VD: EVENT" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item
            label="Tên hiển thị kênh"
            name="name"
            rules={[{ required: true, message: 'Vui lòng nhập tên kênh' }]}
          >
            <Input placeholder="VD: Hội thảo & Sự kiện B2B" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setIsChannelModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" style={{ background: '#0f766e', borderColor: '#0f766e' }}>
                Lưu kênh
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: ASSIGN MARKET */}
      <Modal
        title="Cấu Hình Phân Bổ Thị Trường (Market Assignment)"
        open={isAssignModalOpen}
        onCancel={() => setIsAssignModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={assignForm} layout="vertical" className="vmax-form" onFinish={handleCreateAssignment}>
          <Form.Item
            label="Nhân viên Sale phụ trách"
            name="employeeId"
            rules={[{ required: true, message: 'Vui lòng chọn nhân viên Sale' }]}
          >
            <Select
              placeholder="Chọn nhân viên Sale..."
              showSearch
              filterOption={(input, option: any) =>
                (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {employees.map((emp) => (
                <Select.Option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Nền tảng (Platform)" name="platformId">
            <Select placeholder="Chọn nền tảng (Để trống để nhận mọi nền tảng)" allowClear>
              {platforms.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Kênh tiếp thị (Channel)" name="channelId">
            <Select placeholder="Chọn kênh tiếp thị (Để trống để nhận mọi kênh)" allowClear>
              {channels.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="Quy tắc tự động gán Lead"
            description="Nếu một Lead mới phát sinh khớp đúng với cặp Platform + Channel này và chỉ có 1 Sale active, Lead sẽ được tự động gán cho Sale được chọn."
            style={{ marginBottom: 16 }}
          />

          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setIsAssignModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" style={{ background: '#0f766e', borderColor: '#0f766e' }}>
                Xác nhận phân bổ
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Platform Detail Modal */}
      <Modal
        title={`Chi tiết Nền tảng: ${selectedPlatform?.name || ''}`}
        open={!!selectedPlatform}
        onCancel={() => setSelectedPlatform(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedPlatform(null)}>
            Đóng
          </Button>,
        ]}
        width={550}
      >
        {selectedPlatform && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã nền tảng (Code)">
              <Tag color="cyan" style={{ fontWeight: 600 }}>{selectedPlatform.code}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Tên nền tảng tiếp thị">{selectedPlatform.name}</Descriptions.Item>
            {selectedPlatform.is_active !== undefined && (
              <Descriptions.Item label="Trạng thái">
                <Tag color={selectedPlatform.is_active ? 'success' : 'default'}>
                  {selectedPlatform.is_active ? 'Đang hoạt động' : 'Tạm dừng'}
                </Tag>
              </Descriptions.Item>
            )}
            {selectedPlatform.totalLeads !== undefined && (
              <Descriptions.Item label="Tổng số Lead">
                <Text strong>{selectedPlatform.totalLeads}</Text>
              </Descriptions.Item>
            )}
            {selectedPlatform.convertedLeads !== undefined && (
              <Descriptions.Item label="Lead đã chuyển đổi">
                <Tag color="blue">{selectedPlatform.convertedLeads}</Tag>
              </Descriptions.Item>
            )}
            {selectedPlatform.conversionRate !== undefined && (
              <Descriptions.Item label="Tỷ lệ chuyển đổi">
                <Text strong style={{ color: 'var(--vmax-green)' }}>{selectedPlatform.conversionRate}%</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* Channel Detail Modal */}
      <Modal
        title={`Chi tiết Kênh tiếp thị: ${selectedChannel?.name || ''}`}
        open={!!selectedChannel}
        onCancel={() => setSelectedChannel(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedChannel(null)}>
            Đóng
          </Button>,
        ]}
        width={550}
      >
        {selectedChannel && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã kênh (Code)">
              <Tag color={selectedChannel.code === 'MANUAL' ? 'orange' : 'purple'} style={{ fontWeight: 600 }}>
                {selectedChannel.code}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Tên kênh tiếp thị">{selectedChannel.name}</Descriptions.Item>
            {selectedChannel.is_active !== undefined && (
              <Descriptions.Item label="Trạng thái">
                <Tag color={selectedChannel.is_active ? 'success' : 'default'}>
                  {selectedChannel.is_active ? 'Đang hoạt động' : 'Tạm dừng'}
                </Tag>
              </Descriptions.Item>
            )}
            {selectedChannel.totalLeads !== undefined && (
              <Descriptions.Item label="Tổng số Lead">
                <Text strong>{selectedChannel.totalLeads}</Text>
              </Descriptions.Item>
            )}
            {selectedChannel.convertedLeads !== undefined && (
              <Descriptions.Item label="Lead đã chuyển đổi">
                <Tag color="blue">{selectedChannel.convertedLeads}</Tag>
              </Descriptions.Item>
            )}
            {selectedChannel.conversionRate !== undefined && (
              <Descriptions.Item label="Tỷ lệ chuyển đổi">
                <Text strong style={{ color: 'var(--vmax-green)' }}>{selectedChannel.conversionRate}%</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};
