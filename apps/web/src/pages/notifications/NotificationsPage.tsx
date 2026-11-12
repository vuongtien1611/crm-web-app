import React, { useEffect, useState, useCallback } from 'react';
import { Card, Typography, Tabs, List, Button, Tag, Space, Empty, Spin, Tooltip, App } from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
  SoundOutlined,
  AudioMutedOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  getNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  sendTestNotificationApi,
  NotificationItem,
} from '../../api/notifications';
import {
  playNotificationSound,
  isNotificationSoundEnabled,
  toggleNotificationSound,
} from '../../utils/notificationSound';
import { useAuthStore } from '../../store/authStore';

const { Title, Text } = Typography;

export const NotificationsPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isNotificationSoundEnabled());

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

  // Real-time listener: prepend incoming notifications dispatched from SSE stream
  useEffect(() => {
    const handleNewNotif = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationItem>;
      if (!customEvent.detail) return;
      const item = customEvent.detail;
      setNotifications((prev) => [item, ...prev.filter((n) => n.id !== item.id)]);
    };

    window.addEventListener('crm:new_notification', handleNewNotif);
    return () => {
      window.removeEventListener('crm:new_notification', handleNewNotif);
    };
  }, []);

  const handleToggleSound = () => {
    const next = toggleNotificationSound();
    setSoundEnabled(next);
    if (next) {
      playNotificationSound();
      message.success('Đã bật âm thanh chuông thông báo');
    } else {
      message.info('Đã tắt âm thanh chuông thông báo');
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    try {
      await sendTestNotificationApi({
        title: '🔔 Thông báo thử nghiệm Real-time',
        content: `Kiểm tra real-time SSE và âm thanh chuông thành công cho ${user?.fullName || user?.username}!`,
      });
      message.success('Đã gửi thông báo thử nghiệm thành công!');
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi gửi thông báo thử nghiệm');
    } finally {
      setTesting(false);
    }
  };

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
    if (eventType.includes('PASSWORD_RESET')) return <Tag color="volcano">Bảo mật</Tag>;
    if (eventType.includes('TEST')) return <Tag color="gold">Thử nghiệm</Tag>;
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
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: '#ecfdf5',
                color: '#059669',
                fontWeight: 600,
                marginLeft: 4,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }}
              />
              Real-time
            </span>
          </Title>
          <Text type="secondary" style={{ fontSize: '13px' }}>
            Theo dõi tất cả cập nhật nghiệp vụ thời gian thực liên quan đến chức vụ của bạn
          </Text>
        </div>

        <Space wrap>
          {/* Sound Toggle */}
          <Tooltip title={soundEnabled ? 'Chuông thông báo đang BẬT' : 'Chuông thông báo đang TẮT'}>
            <Button
              icon={soundEnabled ? <SoundOutlined style={{ color: '#10b981' }} /> : <AudioMutedOutlined style={{ color: '#9ca3af' }} />}
              onClick={handleToggleSound}
            >
              {soundEnabled ? 'Âm thanh: Bật' : 'Âm thanh: Tắt'}
            </Button>
          </Tooltip>

          {/* Test Notification Button */}
          <Tooltip title="Gửi một thông báo thử nghiệm để nghe âm thanh và xem cập nhật real-time">
            <Button
              icon={<ThunderboltOutlined style={{ color: '#f59e0b' }} />}
              loading={testing}
              onClick={handleSendTest}
            >
              Thử nghiệm âm báo
            </Button>
          </Tooltip>

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
            Đã đọc tất cả
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
