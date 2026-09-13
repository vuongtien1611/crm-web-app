import React, { useState, useEffect } from 'react';
import { Table, Tag, Card, Input, Select, Progress, Button, Space, Typography, Avatar } from 'antd';
import { SearchOutlined, FolderOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchProjectsApi, ProjectListItem } from '../../api/projects';
import { getStatusLabel, formatDateTime } from '../../constants/labels';
import { createRowNavigateHandler } from '../../utils/tableUtils';

const { Title, Text } = Typography;

export const ProjectsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(() => searchParams.get('status') || 'ALL');

  useEffect(() => {
    const s = searchParams.get('status') || 'ALL';
    setStatus(s);
    setPage(1);
  }, [searchParams]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['projects', page, limit, q, status],
    queryFn: () => fetchProjectsApi({ page, limit, q, status }),
  });

  const getStatusTag = (st: string) => {
    const label = getStatusLabel(st);
    switch (st) {
      case 'ASSIGNED':
        return <Tag color="blue">{label}</Tag>;
      case 'READY_TO_START':
        return <Tag color="cyan">{label}</Tag>;
      case 'IN_PROGRESS':
        return <Tag color="processing">{label}</Tag>;
      case 'WAITING_CUSTOMER':
      case 'WAITING_SALE':
      case 'WAITING_INTERNAL':
        return <Tag color="warning">{label}</Tag>;
      case 'BLOCKED':
        return <Tag color="error">{label}</Tag>;
      case 'REVIEW':
        return <Tag color="purple">{label}</Tag>;
      case 'ACCEPTANCE':
        return <Tag color="orange">{label}</Tag>;
      case 'COMPLETED':
        return <Tag color="success">{label}</Tag>;
      case 'CANCELLED':
        return <Tag color="default">{label}</Tag>;
      default:
        return <Tag>{label}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Dự án & Đơn hàng',
      dataIndex: 'project_name',
      key: 'project_name',
      render: (text: string, record: ProjectListItem) => (
        <div>
          <a
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/projects/${record.id}`);
            }}
            style={{ fontWeight: 600, color: 'var(--vmax-green, #0C6B37)', fontSize: 14 }}
          >
            {text}
          </a>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Mã đơn: <span style={{ fontWeight: 500, color: '#334155' }}>{record.order_code}</span>
            <span style={{ margin: '0 6px', color: '#cbd5e1' }}>•</span>
            Mục: <span style={{ fontWeight: 500, color: '#334155' }}>#{record.order_item_id}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Khách hàng',
      dataIndex: 'company_name',
      key: 'company_name',
      render: (text: string) => (
        <span style={{ fontWeight: 500, color: '#1e293b' }}>{text || '—'}</span>
      ),
    },
    {
      title: 'Dịch vụ',
      dataIndex: 'service_name',
      key: 'service_name',
      render: (text: string) => <Tag color="geekblue" style={{ borderRadius: 6 }}>{text || '—'}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: string) => getStatusTag(st),
    },
    {
      title: 'Người thực hiện',
      key: 'assignees',
      render: (_: any, record: ProjectListItem) => {
        const hasPrimary = record.primaryAssignees && record.primaryAssignees.length > 0;
        const hasSupport = record.supportAssignees && record.supportAssignees.length > 0;

        if (!hasPrimary && !hasSupport) {
          return (
            <Text type="secondary" italic style={{ fontSize: 13 }}>
              Chưa phân công
            </Text>
          );
        }

        return (
          <Space direction="vertical" size={4}>
            {record.primaryAssignees?.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Avatar
                  size={22}
                  style={{
                    backgroundColor: '#d97706',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {a.employee_name ? a.employee_name.charAt(0).toUpperCase() : 'P'}
                </Avatar>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{a.employee_name}</span>
                <Tag color="gold" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 4 }}>
                  Chính
                </Tag>
              </div>
            ))}
            {record.supportAssignees?.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Avatar
                  size={22}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {a.employee_name ? a.employee_name.charAt(0).toUpperCase() : 'S'}
                </Avatar>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{a.employee_name}</span>
                <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 4 }}>
                  Hỗ trợ
                </Tag>
              </div>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Tiến độ thực tế',
      dataIndex: 'materialized_progress_percent',
      key: 'materialized_progress_percent',
      width: 140,
      render: (val: number) => {
        const percent = Math.min(100, Math.max(0, Math.round(Number(val) || 0)));
        return (
          <div style={{ width: 120 }}>
            <Progress
              percent={percent}
              size="small"
              strokeColor={percent === 100 ? '#52c41a' : percent > 0 ? 'var(--vmax-green, #0C6B37)' : '#d9d9d9'}
            />
          </div>
        );
      },
    },
    {
      title: 'Ngày bắt đầu',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (d?: string) => (
        <span style={{ fontSize: 13, color: d ? '#334155' : '#94a3b8' }}>
          {d ? formatDateTime(d) : 'Chưa bắt đầu'}
        </span>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: ProjectListItem) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/projects/${record.id}`);
          }}
          style={{ borderRadius: 6 }}
        >
          Xem chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="vmax-page-wrapper">
      <div className="vmax-page-header">
        <Title level={3} className="vmax-page-title">
          <FolderOutlined style={{ color: 'var(--vmax-green)' }} />
          Quản lý dự án
        </Title>
      </div>

      <Card className="vmax-card" style={{ marginBottom: 16 }}>
        <Space size="middle" style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Input
            placeholder="Tìm theo tên dự án, khách hàng, mã đơn..."
            prefix={<SearchOutlined style={{ color: 'var(--vmax-green)' }} />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 320 }}
            allowClear
          />
          <Select
            value={status}
            onChange={(val) => {
              setStatus(val);
              setPage(1);
              const nextParams = new URLSearchParams(searchParams);
              if (val && val !== 'ALL') {
                nextParams.set('status', val);
              } else {
                nextParams.delete('status');
              }
              setSearchParams(nextParams);
            }}
            style={{ width: 220 }}
          >
            <Select.Option value="ALL">Tất cả trạng thái</Select.Option>
            <Select.Option value="ASSIGNED">Đã phân công</Select.Option>
            <Select.Option value="READY_TO_START">Sẵn sàng bắt đầu</Select.Option>
            <Select.Option value="IN_PROGRESS">Đang thực hiện</Select.Option>
            <Select.Option value="WAITING_CUSTOMER">Chờ khách hàng</Select.Option>
            <Select.Option value="BLOCKED">Bị chặn</Select.Option>
            <Select.Option value="REVIEW">Đang kiểm tra</Select.Option>
            <Select.Option value="ACCEPTANCE">Chờ nghiệm thu</Select.Option>
            <Select.Option value="COMPLETED">Hoàn thành</Select.Option>
            <Select.Option value="CANCELLED">Đã hủy</Select.Option>
          </Select>
        </Space>
      </Card>

      <Card className="vmax-card">
        <Table
          columns={columns}
          dataSource={data?.data || []}
          rowKey="id"
          loading={isLoading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Chưa có dự án nào phù hợp' }}
          onRow={createRowNavigateHandler(navigate, (record) => `/projects/${record.id}`)}
          pagination={{
            current: page,
            pageSize: limit,
            total: data?.total || 0,
            showTotal: (total) => `Tổng số ${total} dự án`,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setLimit(ps);
            },
          }}
        />
      </Card>
    </div>
  );
};
