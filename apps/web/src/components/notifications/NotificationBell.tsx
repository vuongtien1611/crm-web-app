import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Badge, Button, Popover, List, Typography, Space, Tooltip, Empty, App } from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  SoundOutlined,
  AudioMutedOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { buildApiUrl } from '../../api/config';
import {
  getNotificationsApi,
  getUnreadCountApi,
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

const { Text } = Typography;

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const { notification: antdNotification, message: antdMessage } = App.useApp();
  const { isAuthenticated, user, accessToken } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isNotificationSoundEnabled());
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!useAuthStore.getState().isAuthenticated || !useAuthStore.getState().user?.employeeId) {
      return;
    }
    try {
      const res = await getUnreadCountApi();
      setUnreadCount(res.unreadCount);
    } catch {
      // ignore in polling
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!useAuthStore.getState().isAuthenticated || !useAuthStore.getState().user?.employeeId) {
      return;
    }
    setLoading(true);
    try {
      const res = await getNotificationsApi({ limit: 10 });
      setNotifications(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Periodic fallback check every 60s
  useEffect(() => {
    if (!isAuthenticated || !user?.employeeId) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.employeeId, fetchUnreadCount]);

  // Real-time Server-Sent Events (SSE) listener with audio chime
  useEffect(() => {
    if (!isAuthenticated || !user?.employeeId || !accessToken) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setIsLiveConnected(false);
      }
      return;
    }

    let reconnectTimer: any = null;

    const setupSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const streamUrl = buildApiUrl(`/notifications/stream?token=${encodeURIComponent(accessToken)}`);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsLiveConnected(true);
      };

      es.onmessage = (event) => {
        try {
          if (!event.data) return;
          const payload = JSON.parse(event.data);

          if (payload.type === 'connected') {
            setIsLiveConnected(true);
          } else if (payload.type === 'notification' && payload.data) {
            const raw = payload.data;
            const newNotif: NotificationItem = {
              id: String(raw.id),
              employee_id: String(raw.employee_id || raw.employeeId),
              event_type: raw.event_type || raw.eventType || 'SYSTEM',
              title: raw.title || 'Thông báo mới',
              content: raw.content || '',
              deep_link_url: raw.deep_link_url || raw.deepLinkUrl || null,
              entity_type: raw.entity_type || raw.entityType || null,
              entity_id: raw.entity_id ? String(raw.entity_id) : null,
              is_read: false,
              created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
            };

            // 1. Play real-time audio chime sound
            playNotificationSound();

            // 2. Increment unread count badge
            setUnreadCount((c) => c + 1);

            // 3. Prepend into active list
            setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);

            // 4. Dispatch custom event so NotificationsPage updates in real-time
            window.dispatchEvent(new CustomEvent('crm:new_notification', { detail: newNotif }));

            // 5. Display popup toast notification
            antdNotification.open({
              key: `toast-${newNotif.id}`,
              message: (
                <span style={{ fontWeight: 600, color: 'var(--vmax-text, #1f2937)' }}>
                  {newNotif.title}
                </span>
              ),
              description: (
                <div>
                  <div
                    style={{
                      color: 'var(--vmax-text-secondary, #4b5563)',
                      marginBottom: 8,
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    {newNotif.content}
                  </div>
                  {newNotif.deep_link_url && (
                    <Button
                      type="primary"
                      size="small"
                      style={{
                        background: 'var(--vmax-green, #10b981)',
                        borderColor: 'var(--vmax-green, #10b981)',
                        fontSize: 12,
                        height: 26,
                        padding: '0 10px',
                      }}
                      onClick={() => {
                        antdNotification.destroy(`toast-${newNotif.id}`);
                        markNotificationReadApi(newNotif.id).catch(() => {});
                        setNotifications((prev) =>
                          prev.map((n) => (n.id === newNotif.id ? { ...n, is_read: true } : n)),
                        );
                        setUnreadCount((c) => Math.max(0, c - 1));
                        navigate(newNotif.deep_link_url!);
                      }}
                    >
                      Xem chi tiết <ArrowRightOutlined style={{ fontSize: 10, marginLeft: 2 }} />
                    </Button>
                  )}
                </div>
              ),
              icon: <BellOutlined style={{ color: 'var(--vmax-green, #10b981)', fontSize: 18 }} />,
              placement: 'topRight',
              duration: 6,
            });
          }
        } catch (e) {
          // ignore parsing error for pings
        }
      };

      es.onerror = () => {
        setIsLiveConnected(false);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        // Auto-reconnect after 5 seconds if authenticated
        if (useAuthStore.getState().isAuthenticated) {
          reconnectTimer = setTimeout(setupSSE, 5000);
        }
      };
    };

    setupSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      setIsLiveConnected(false);
    };
  }, [isAuthenticated, user?.employeeId, accessToken, navigate, antdNotification]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      fetchNotifications();
      fetchUnreadCount();
    }
  };

  const handleToggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = toggleNotificationSound();
    setSoundEnabled(next);
    if (next) {
      playNotificationSound();
      antdMessage.success('Đã bật âm thanh thông báo');
    } else {
      antdMessage.info('Đã tắt âm thanh thông báo');
    }
  };

  const handleSendTestNotification = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTesting(true);
    try {
      await sendTestNotificationApi({
        title: '🔔 Thông báo thử nghiệm Real-time',
        content: `Kiểm tra real-time SSE và âm thanh chuông thành công cho ${user?.fullName || user?.username}!`,
      });
      antdMessage.success('Đã gửi thông báo thử nghiệm! Chuông âm thanh đã kích hoạt.');
    } catch (err: any) {
      antdMessage.error(err.message || 'Lỗi khi gửi thông báo thử');
    } finally {
      setTesting(false);
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        await markNotificationReadApi(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // ignore
      }
    }

    setOpen(false);
    if (item.deep_link_url) {
      navigate(item.deep_link_url);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsReadApi();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      antdMessage.success('Đã đánh dấu đã đọc tất cả');
    } catch {
      // ignore
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return date.toLocaleDateString('vi-VN');
    } catch {
      return dateStr;
    }
  };

  const popoverContent = (
    <div style={{ width: 360, maxWidth: '92vw' }}>
      {/* Popover Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '10px',
          borderBottom: '1px solid var(--vmax-border, #e5e7eb)',
          marginBottom: '8px',
        }}
      >
        <Space size={6} align="center">
          <Text strong style={{ fontSize: '14px' }}>
            Thông báo
          </Text>
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: '11px',
                background: 'var(--vmax-green-soft, #e6f7ef)',
                color: 'var(--vmax-green, #10b981)',
                padding: '2px 8px',
                borderRadius: '10px',
                fontWeight: 600,
              }}
            >
              {unreadCount} mới
            </span>
          )}
          {/* Live indicator dot */}
          <Tooltip title={isLiveConnected ? 'Kết nối Real-time đang hoạt động' : 'Đang kết nối lại Real-time...'}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isLiveConnected ? '#ecfdf5' : '#fef2f2',
                color: isLiveConnected ? '#059669' : '#dc2626',
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isLiveConnected ? '#10b981' : '#ef4444',
                  boxShadow: isLiveConnected ? '0 0 6px #10b981' : 'none',
                }}
              />
              {isLiveConnected ? 'Real-time' : 'Reconnecting'}
            </span>
          </Tooltip>
        </Space>

        <Space size={4}>
          {/* Sound Toggle */}
          <Tooltip title={soundEnabled ? 'Âm thanh: Đang bật (Click để tắt)' : 'Âm thanh: Đang tắt (Click để bật)'}>
            <Button
              type="text"
              size="small"
              icon={soundEnabled ? <SoundOutlined style={{ color: '#10b981' }} /> : <AudioMutedOutlined style={{ color: '#9ca3af' }} />}
              onClick={handleToggleSound}
              style={{ padding: '0 4px', height: 24 }}
            />
          </Tooltip>

          {/* Test Notification Trigger */}
          <Tooltip title="Gửi thông báo thử nghiệm kèm âm thanh">
            <Button
              type="text"
              size="small"
              loading={testing}
              icon={<ThunderboltOutlined style={{ color: '#f59e0b' }} />}
              onClick={handleSendTestNotification}
              style={{ padding: '0 4px', height: 24 }}
            />
          </Tooltip>

          {/* Mark All Read */}
          {unreadCount > 0 && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={handleMarkAllRead}
              style={{ fontSize: '12px', padding: '0 4px' }}
            >
              Đã đọc
            </Button>
          )}
        </Space>
      </div>

      {/* Notifications List */}
      <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
        {(!Array.isArray(notifications) || notifications.length === 0) && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có thông báo nào" />
        ) : (
          <List
            loading={loading}
            dataSource={Array.isArray(notifications) ? notifications : []}
            renderItem={(item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '6px',
                  cursor: 'pointer',
                  background: item.is_read
                    ? 'transparent'
                    : 'var(--vmax-bg-highlight, rgba(16, 185, 129, 0.07))',
                  borderLeft: item.is_read
                    ? '3px solid transparent'
                    : '3px solid var(--vmax-green, #10b981)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--vmax-bg-hover, #f3f4f6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = item.is_read
                    ? 'transparent'
                    : 'var(--vmax-bg-highlight, rgba(16, 185, 129, 0.07))';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text strong style={{ fontSize: '13px', color: 'var(--vmax-text, #1f2937)' }}>
                    {item.title}
                  </Text>
                  <Text style={{ fontSize: '11px', color: 'var(--vmax-text-muted, #9ca3af)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                    <ClockCircleOutlined style={{ marginRight: 3 }} />
                    {formatTime(item.created_at)}
                  </Text>
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--vmax-text-secondary, #4b5563)',
                    marginTop: '3px',
                    lineHeight: '1.4',
                  }}
                >
                  {item.content}
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Popover Footer */}
      <div
        style={{
          borderTop: '1px solid var(--vmax-border, #e5e7eb)',
          paddingTop: '8px',
          marginTop: '6px',
          textAlign: 'center',
        }}
      >
        <Button
          type="link"
          size="small"
          onClick={() => {
            setOpen(false);
            navigate('/notifications');
          }}
          style={{ fontSize: '13px', fontWeight: 500 }}
        >
          Xem tất cả thông báo <ArrowRightOutlined style={{ fontSize: 11 }} />
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomRight"
      styles={{ body: { padding: '12px' } }}
    >
      <Tooltip title="Thông báo hệ thống">
        <Button
          type="text"
          shape="circle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            position: 'relative',
          }}
        >
          <Badge count={unreadCount} overflowCount={99} size="small" offset={[2, -2]}>
            <BellOutlined style={{ fontSize: '18px', color: 'var(--vmax-text, #374151)' }} />
          </Badge>
        </Button>
      </Tooltip>
    </Popover>
  );
};
