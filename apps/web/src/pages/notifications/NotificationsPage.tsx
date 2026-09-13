import React, { useEffect, useState, useCallback } from 'react';
import { Card, Typography, Tabs, List, Button, Tag, Space, Empty, Spin, message } from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  getNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  NotificationItem,
} from '../../api/notifications';

const { Title, Text } = Typography;

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchNotifications = useCallback(async (unreadOnly: boolean) => {
    setLoading(true);
    try {
      const res = await getNotificationsApi({
        unread_only: unreadOnly,
        limit: 50,
      });
      setNotifications(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi tải thông báo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications(activeTab === 'unread');
  }, [activeTab, fetchNotifications]);

  const handleMarkAsRead = async (item: NotificationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (item.is_read) return;

    try {
      await markNotificationReadApi(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
      );
      if (activeTab === 'unread') {
        setNotifications((prev) => prev.filter((n) => n.id !== item.id));
      }
      message.success('Đã đánh dấu đã đọc');
    } catch (err: any) {
      message.error(err.message || 'Không thể đánh dấu đã đọc');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await markAllNotificationsReadApi();
      message.success(`Đã đánh dấu ${res.updatedCount} thông báo đã đọc`);
      fetchNotifications(activeTab === 'unread');
    } catch (err: any) {
      message.error(err.message || 'Không thể đánh dấu đã đọc tất cả');
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        await markNotificationReadApi(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
        );
      } catch {
        // ignore
      }
    }
    if (item.deep_link_url) {
      navigate(item.deep_link_url);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN');
    } catch {
      return dateStr;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    if (eventType.includes('ORDER')) return <Tag color="blue">Đơn hàng</Tag>;
    if (eventType.includes('PAYMENT')) return <Tag color="green">Thanh toán</Tag>;
    if (eventType.includes('PROJECT')) return <Tag color="purple">Dự án</Tag>;
    if (eventType.includes('LEAD')) return <Tag color="orange">Lead</Tag>;
    if (eventType.includes('DAILY_REPORT')) return <Tag color="cyan">Báo cáo ngày</Tag>;
    if (eventType.includes('SUBSCRIPTION')) return <Tag color="geekblue">Subscription</Tag>;
    if (eventType.includes('PAYROLL')) return <Tag color="magenta">Bảng lương</Tag>;
    return <Tag>{eventType}</Tag>;
  };

  return (
    <div className="vmax-page-wrapper vmax-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: '20px',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BellOutlined style={{ color: 'var(--vmax-green, #10b981)' }} />
            Trung tâm thông báo
          </Title>
          <Text type="secondary" style={{ fontSize: '13px' }}>
            Theo dõi tất cả cập nhật nghiệp vụ liên quan đến bạn
          </Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchNotifications(activeTab === 'unread')}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleMarkAllRead}
            style={{ background: 'var(--vmax-green, #10b981)', borderColor: 'var(--vmax-green, #10b981)' }}
          >
            Đánh dấu đã đọc tất cả
          </Button>
        </Space>
      </div>

      <Card variant="borderless" style={{ borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as any)}
          items={[
            { key: 'all', label: 'Tất cả thông báo' },
            { key: 'unread', label: 'Chưa đọc' },
          ]}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
          </div>
        ) : (!Array.isArray(notifications) || notifications.length === 0) ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={activeTab === 'unread' ? 'Không có thông báo chưa đọc nào' : 'Không có thông báo nào'}
          />
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={Array.isArray(notifications) ? notifications : []}
            renderItem={(item) => (
              <List.Item
                key={item.id}
                onClick={() => handleItemClick(item)}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  marginBottom: '8px',
                  cursor: item.deep_link_url ? 'pointer' : 'default',
                  background: item.is_read
                    ? 'var(--vmax-bg, #fafafa)'
                    : 'var(--vmax-bg-highlight, rgba(16, 185, 129, 0.05))',
                  borderLeft: item.is_read
                    ? '4px solid transparent'
                    : '4px solid var(--vmax-green, #10b981)',
                  transition: 'background 0.2s',
                }}
                actions={[
                  !item.is_read && (
                    <Button
                      key="mark-read"
                      type="text"
                      size="small"
                      icon={<CheckOutlined />}
                      onClick={(e) => handleMarkAsRead(item, e)}
                    >
                      Đã đọc
                    </Button>
                  ),
                  item.deep_link_url && (
                    <Button
                      key="open"
                      type="link"
                      size="small"
                      icon={<LinkOutlined />}
                      onClick={() => handleItemClick(item)}
                    >
                      Xem chi tiết
                    </Button>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <Space size="small">
                      {getEventTypeBadge(item.event_type)}
                      <Text strong style={{ fontSize: '14px' }}>
                        {item.title}
                      </Text>
                      {!item.is_read && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: 'var(--vmax-green, #10b981)',
                          }}
                        />
                      )}
                    </Space>
                  }
                  description={
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--vmax-text-secondary, #4b5563)', margin: '4px 0' }}>
                        {item.content}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--vmax-text-muted, #9ca3af)' }}>
                        <ClockCircleOutlined style={{ marginRight: '4px' }} />
                        {formatTime(item.created_at)}
                      </div>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};
