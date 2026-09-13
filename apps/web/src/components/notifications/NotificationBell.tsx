import React, { useEffect, useState, useCallback } from 'react';
import { Badge, Button, Popover, List, Typography, Space, Tooltip, Empty } from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  getNotificationsApi,
  getUnreadCountApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  NotificationItem,
} from '../../api/notifications';

const { Text } = Typography;

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await getUnreadCountApi();
      setUnreadCount(res.unreadCount);
    } catch {
      // ignore in polling
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
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

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      fetchNotifications();
      fetchUnreadCount();
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
    <div style={{ width: 340, maxWidth: '90vw' }}>
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
        <Space>
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
        </Space>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleMarkAllRead}
            style={{ fontSize: '12px', padding: 0 }}
          >
            Đã đọc tất cả
          </Button>
        )}
      </div>

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
                  padding: '8px 10px',
                  borderRadius: '8px',
                  marginBottom: '4px',
                  cursor: 'pointer',
                  background: item.is_read
                    ? 'transparent'
                    : 'var(--vmax-bg-highlight, rgba(16, 185, 129, 0.06))',
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
                    : 'var(--vmax-bg-highlight, rgba(16, 185, 129, 0.06))';
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
                    marginTop: '2px',
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
      <Tooltip title="Thông báo">
        <Button
          type="text"
          shape="circle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
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
