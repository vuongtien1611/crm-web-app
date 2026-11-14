import React, { useState } from 'react';
import { Layout, Menu, Typography, Tag, Space, Button, Drawer, Breadcrumb, Tooltip } from 'antd';
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { logoutApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { getRoleLabel } from '../constants/labels';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { getSidebarMenuForRoles } from '../config/navigation.config';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);

  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  const roles = user?.roles || [];
  const menuItems = getSidebarMenuForRoles(roles);

  const handleLogout = async () => {
    await logoutApi();
    navigate('/login');
  };

  const fullPath = location.pathname + location.search;
  const exactMatch = menuItems.find((m) => m && 'key' in m && m.key === fullPath);
  const selectedKey: string = (exactMatch && 'key' in exactMatch && exactMatch.key ? String(exactMatch.key) : '')
    || (location.pathname.startsWith('/reports') || location.pathname.startsWith('/daily-reports')
    ? '/reports'
    : location.pathname.startsWith('/projects')
    ? location.search.includes('tab=assign')
      ? '/projects?tab=assign'
      : location.search.includes('tab=tasks')
      ? '/projects?tab=tasks'
      : '/projects'
    : location.pathname.startsWith('/leads')
    ? '/leads'
    : location.pathname.startsWith('/deals')
    ? '/deals'
    : location.pathname.startsWith('/orders')
    ? '/orders'
    : location.pathname.startsWith('/subscriptions')
    ? '/subscriptions'
    : location.pathname.startsWith('/payments')
    ? '/payments'
    : location.pathname.startsWith('/commissions')
    ? '/commissions'
    : location.pathname.startsWith('/kpi')
    ? '/kpi'
    : location.pathname.startsWith('/payroll')
    ? '/payroll'
    : location.pathname.startsWith('/expenses')
    ? '/expenses'
    : location.pathname.startsWith('/employee-accounts')
    ? '/employee-accounts'
    : location.pathname.startsWith('/employees')
    ? '/employees'
    : location.pathname.startsWith('/teams')
    ? '/teams'
    : location.pathname.startsWith('/acquisition')
    ? '/acquisition'
    : location.pathname.startsWith('/notifications')
    ? '/notifications'
    : location.pathname.startsWith('/workspace/dev')
    ? '/workspace/dev'
    : location.pathname.startsWith('/workspace/sales')
    ? '/workspace/sales'
    : location.pathname.startsWith('/workspace/seo')
    ? '/workspace/seo'
    : location.pathname);

  const getBreadcrumbs = () => {
    const items: { title: React.ReactNode }[] = [
      {
        title: (
          <span
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => navigate('/dashboard')}
          >
            <HomeOutlined /> Trang chủ
          </span>
        ),
      },
    ];

    const p = location.pathname;
    if (p.startsWith('/dashboard')) {
      items.push({ title: 'Tổng quan' });
    } else if (p.startsWith('/reports') || p.startsWith('/daily-reports')) {
      items.push({ title: 'Báo cáo' });
    } else if (p.startsWith('/leads')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/leads')}>Khách hàng tiềm năng</span>,
      });
      if (p !== '/leads') items.push({ title: 'Chi tiết Lead' });
    } else if (p.startsWith('/deals')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/deals')}>Cơ hội bán hàng</span>,
      });
      if (p !== '/deals') items.push({ title: 'Chi tiết Deal' });
    } else if (p.startsWith('/orders')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/orders')}>Đơn hàng</span>,
      });
      if (p !== '/orders') items.push({ title: 'Chi tiết đơn hàng' });
    } else if (p.startsWith('/subscriptions')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/subscriptions')}>Dịch vụ định kỳ</span>,
      });
      if (p !== '/subscriptions') items.push({ title: 'Chi tiết hợp đồng' });
    } else if (p.startsWith('/projects')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/projects')}>Dự án & Triển khai</span>,
      });
      if (p !== '/projects') items.push({ title: 'Chi tiết dự án' });
    } else if (p.startsWith('/payments')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/payments')}>Thanh toán & Dòng tiền</span>,
      });
      if (p !== '/payments') items.push({ title: 'Chi tiết thanh toán' });
    } else if (p.startsWith('/commissions')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/commissions')}>Hoa hồng</span>,
      });
      if (p !== '/commissions') items.push({ title: 'Chi tiết hoa hồng' });
    } else if (p.startsWith('/kpi')) {
      items.push({ title: 'Hiệu suất KPI' });
    } else if (p.startsWith('/payroll')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/payroll')}>Bảng lương</span>,
      });
      if (p.includes('/employees/')) items.push({ title: 'Chi tiết nhân viên' });
      else if (p !== '/payroll') items.push({ title: 'Kỳ lương' });
    } else if (p.startsWith('/expenses')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/expenses')}>Chi phí</span>,
      });
      if (p !== '/expenses') items.push({ title: 'Chi tiết chi phí' });
    } else if (p.startsWith('/employee-accounts')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/employee-accounts')}>Quản lý tài khoản nhân sự</span>,
      });
      if (p !== '/employee-accounts') items.push({ title: 'Chi tiết tài khoản' });
    } else if (p.startsWith('/employees')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/employees')}>Nhân sự</span>,
      });
      if (p === '/employees/new') items.push({ title: 'Thêm nhân sự mới' });
      else if (p !== '/employees') items.push({ title: 'Hồ sơ nhân viên' });
    } else if (p.startsWith('/teams')) {
      items.push({
        title: <span style={{ cursor: 'pointer' }} onClick={() => navigate('/teams')}>Nhóm làm việc</span>,
      });
      if (p === '/teams/new') items.push({ title: 'Tạo nhóm mới' });
      else if (p !== '/teams') items.push({ title: 'Chi tiết nhóm' });
    } else if (p.startsWith('/workspace')) {
      items.push({ title: 'Workspace của tôi' });
    } else if (p.startsWith('/acquisition')) {
      items.push({ title: 'Kênh tiếp thị & Thu hút' });
    } else if (p.startsWith('/notifications')) {
      items.push({ title: 'Thông báo hệ thống' });
    } else if (p.startsWith('/change-password')) {
      items.push({ title: 'Đổi mật khẩu' });
    }
    return items;
  };

  const renderSidebarBrand = () => (
    <div
      className="vmax-sidebar-brand"
      style={{
        padding: collapsed ? '14px 8px' : '16px 16px 12px',
        borderBottom: '1px solid var(--vmax-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: collapsed ? 'center' : 'flex-start',
        flexShrink: 0,
      }}
    >
      {collapsed ? (
        <Tooltip title="VMAX CRM" placement="right">
          <img
            src="/logo-square.png"
            alt="VMAX"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              objectFit: 'contain',
              display: 'block',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/dashboard')}
          />
        </Tooltip>
      ) : (
        <div
          style={{ cursor: 'pointer', width: '100%' }}
          onClick={() => navigate('/dashboard')}
        >
          <img
            src="/logo.png"
            alt="VMAX Logo"
            style={{
              maxHeight: '42px',
              maxWidth: '180px',
              objectFit: 'contain',
              display: 'block',
              marginBottom: '4px',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <Tag
              style={{
                margin: 0,
                background: 'var(--vmax-green-soft)',
                color: 'var(--vmax-green)',
                border: 'none',
                fontWeight: 600,
                fontSize: '11px',
                borderRadius: '6px',
                padding: '1px 8px',
              }}
            >
              Hệ thống Quản trị Doanh nghiệp
            </Tag>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--vmax-bg)' }}>
      {/* DESKTOP SIDEBAR */}
      <Sider
        className="vmax-desktop-sider vmax-sidebar"
        width={260}
        collapsedWidth={80}
        collapsed={collapsed}
        theme="light"
        style={{
          background: 'var(--vmax-white)',
          borderRight: '1px solid var(--vmax-border)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        {renderSidebarBrand()}
        <div
          className="vmax-sidebar-menu-wrap"
          style={{ padding: collapsed ? '12px 4px' : '12px 8px' }}
        >
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '13.5px',
              fontWeight: 500,
            }}
          />
        </div>
      </Sider>

      {/* MOBILE DRAWER MENU */}
      <Drawer
        rootClassName="vmax-mobile-drawer"
        placement="left"
        closable={true}
        onClose={() => setMobileDrawerOpen(false)}
        open={mobileDrawerOpen}
        styles={{
          body: {
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          },
        }}
        width={280}
      >
        {renderSidebarBrand()}
        <div
          className="vmax-sidebar-menu-wrap"
          style={{ padding: '12px 8px' }}
        >
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => {
              navigate(key);
              setMobileDrawerOpen(false);
            }}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '14px',
              fontWeight: 500,
            }}
          />
        </div>
      </Drawer>

      {/* MAIN CONTENT AREA */}
      <Layout style={{ background: 'var(--vmax-bg)' }}>
        {/* HEADER */}
        <Header
          style={{
            background: 'var(--vmax-white)',
            padding: '0 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--vmax-border)',
            height: '64px',
            lineHeight: '64px',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Mobile Hamburger Toggle */}
            <Button
              className="vmax-mobile-trigger"
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Mở menu điều hướng"
              style={{ fontSize: '18px' }}
            />

            {/* Desktop Collapse Toggle */}
            <Button
              className="vmax-desktop-sider"
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
              style={{ fontSize: '16px', display: 'flex', alignItems: 'center' }}
            />

            {/* Breadcrumb Navigation */}
            <div className="vmax-header-breadcrumb">
              <Breadcrumb items={getBreadcrumbs()} />
            </div>
          </div>

          {/* Right Action Icons & Profile */}
          <Space size="middle">
            <NotificationBell />
            {user && (
              <div className="vmax-user-profile-badge">
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: 'var(--vmax-green-soft)',
                    color: 'var(--vmax-green)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                >
                  {(user.fullName || user.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="vmax-user-profile-text">
                  <Text strong style={{ fontSize: '13px', color: 'var(--vmax-text)', display: 'block', lineHeight: 1.2 }}>
                    {user.fullName || user.username}
                  </Text>
                  <Text style={{ fontSize: '11px', color: 'var(--vmax-text-muted)' }}>
                    {user.roles ? user.roles.map((r) => getRoleLabel(r)).join(', ') : ''}
                  </Text>
                </div>
              </div>
            )}
            <Tooltip title="Đăng xuất khỏi hệ thống">
              <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                danger
                aria-label="Đăng xuất"
                style={{
                  fontWeight: 600,
                  fontSize: '13px',
                  borderRadius: '10px',
                  color: 'var(--vmax-red-orange)',
                }}
              >
                <span className="vmax-user-profile-text">Đăng xuất</span>
              </Button>
            </Tooltip>
          </Space>
        </Header>

        {/* PAGE CONTENT */}
        <Content style={{ margin: 0, minHeight: 'calc(100vh - 64px)', background: 'var(--vmax-bg)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
