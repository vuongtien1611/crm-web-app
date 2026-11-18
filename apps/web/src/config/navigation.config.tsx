import React from 'react';
import {
  DashboardOutlined,
  UsergroupAddOutlined,
  TrophyOutlined,
  FileTextOutlined,
  FolderOutlined,
  DollarOutlined,
  CompassOutlined,
  AuditOutlined,
  GiftOutlined,
  BankOutlined,
  WalletOutlined,
  TeamOutlined,
  FundOutlined,
  ToolOutlined,
  GlobalOutlined,
  FileDoneOutlined,
  SyncOutlined,
  BellOutlined,
  UserAddOutlined,
  CheckSquareOutlined,
  SafetyCertificateOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { UserProfile } from '../store/authStore';
import type { ItemType, MenuItemType } from 'antd/es/menu/interface';

export const CANONICAL_ROLES = [
  'BOSS',
  'ADMIN',
  'SALES_TEAM_LEADER',
  'SALE',
  'DEV_TEAM_LEADER',
  'DEV',
  'SEO_TEAM_LEADER',
  'SEO',
  'ACCOUNTANT',
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

export interface NavigationMenuItem {
  key: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
}

export type MenuItemView = ItemType<MenuItemType>;

/**
 * Route access definitions used across RoleRoute and App routes.
 */
export const ROUTE_ROLE_PERMISSIONS = {
  SALES: ['SALES_TEAM_LEADER', 'SALE'],
  ORDERS: ['SALES_TEAM_LEADER', 'SALE', 'ACCOUNTANT'],
  SUBSCRIPTIONS: ['SALES_TEAM_LEADER', 'SALE', 'ACCOUNTANT', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'],
  PROJECTS: ['DEV_TEAM_LEADER', 'DEV', 'SEO_TEAM_LEADER', 'SEO', 'SALES_TEAM_LEADER', 'SALE'],
  FINANCE: ['ACCOUNTANT'],
  HR_MANAGEMENT: [] as string[], // Only BOSS / ADMIN can access when allowedRoles is empty
  STRICT_BOSS: ['BOSS'],
  TEAMS: ['SALES_TEAM_LEADER', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'],
  WORKSPACE_SALES: ['SALES_TEAM_LEADER'],
  WORKSPACE_DEV: ['DEV_TEAM_LEADER'],
  WORKSPACE_SEO: ['SEO_TEAM_LEADER'],
} as const;

/**
 * Canonical Single Source of Truth for Sidebar Navigation Menus.
 * Exactly preserves existing UAT menu structure for all 9 canonical roles.
 */
export function getSidebarMenuForRoles(roles: string[] = []): MenuItemView[] {
  const isBoss = roles.includes('BOSS');
  const isSalesLeader = roles.includes('SALES_TEAM_LEADER');
  const isSale = roles.includes('SALE');
  const isDevLeader = roles.includes('DEV_TEAM_LEADER');
  const isDev = roles.includes('DEV');
  const isSeoLeader = roles.includes('SEO_TEAM_LEADER');
  const isSeo = roles.includes('SEO');
  const isAccountant = roles.includes('ACCOUNTANT');

  if (isBoss) {
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard điều hành' },
      { key: '/organization-chart', icon: <ApartmentOutlined />, label: 'Sơ đồ nhân sự' },
      { key: '/employee-accounts', icon: <SafetyCertificateOutlined />, label: 'Quản lý tài khoản nhân sự' },
      { key: '/employees', icon: <TeamOutlined />, label: 'Danh sách nhân sự' },
      { key: '/teams', icon: <UsergroupAddOutlined />, label: 'Teams' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/leads', icon: <UsergroupAddOutlined />, label: 'Leads' },
      { key: '/deals', icon: <TrophyOutlined />, label: 'Deals' },
      { key: '/orders', icon: <FileTextOutlined />, label: 'Orders' },
      { key: '/subscriptions', icon: <SyncOutlined />, label: 'Subscriptions' },
      { key: '/projects', icon: <FolderOutlined />, label: 'Projects' },
      { key: '/finance/overview', icon: <BankOutlined />, label: 'Tổng quan tài chính' },
      { key: '/finance/receivables', icon: <DollarOutlined />, label: 'Công nợ phải thu' },
      { key: '/finance/cashflow', icon: <SyncOutlined />, label: 'Sổ cái dòng tiền' },
      { key: '/payments', icon: <DollarOutlined />, label: 'Payments' },
      { key: '/commissions', icon: <AuditOutlined />, label: 'Commissions' },
      { key: '/kpi', icon: <GiftOutlined />, label: 'KPI' },
      { key: '/payroll', icon: <BankOutlined />, label: 'Payroll' },
      { key: '/expenses', icon: <WalletOutlined />, label: 'Expenses' },
      { key: '/acquisition', icon: <CompassOutlined />, label: 'Acquisition' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  if (isSalesLeader) {
    return [
      { key: '/workspace/sales', icon: <FundOutlined />, label: 'Dashboard Team Sale' },
      { key: '/leads', icon: <UsergroupAddOutlined />, label: 'Leads Team' },
      { key: '/deals', icon: <TrophyOutlined />, label: 'Deals Team' },
      { key: '/orders', icon: <FileTextOutlined />, label: 'Orders Team' },
      { key: '/kpi', icon: <GiftOutlined />, label: 'KPI & Doanh số Team' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/teams', icon: <TeamOutlined />, label: 'Nhân sự Team' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  if (isSale) {
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard cá nhân' },
      { key: '/leads', icon: <UsergroupAddOutlined />, label: 'Leads của tôi' },
      { key: '/deals', icon: <TrophyOutlined />, label: 'Deals của tôi' },
      { key: '/orders', icon: <FileTextOutlined />, label: 'Orders của tôi' },
      { key: '/kpi', icon: <GiftOutlined />, label: 'KPI & Doanh số' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  if (isDevLeader) {
    return [
      { key: '/workspace/dev', icon: <ToolOutlined />, label: 'Dashboard Team Dev' },
      { key: '/projects', icon: <FolderOutlined />, label: 'Projects Team' },
      { key: '/projects?tab=assign', icon: <UserAddOutlined />, label: 'Phân công Project' },
      { key: '/projects?tab=tasks', icon: <CheckSquareOutlined />, label: 'Task & Tiến độ' },
      { key: '/kpi', icon: <GiftOutlined />, label: 'KPI Team' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/teams', icon: <TeamOutlined />, label: 'Nhân sự Team' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  if (isDev) {
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard cá nhân' },
      { key: '/projects', icon: <FolderOutlined />, label: 'Projects của tôi' },
      { key: '/projects?tab=tasks', icon: <CheckSquareOutlined />, label: 'Tasks của tôi' },
      { key: '/commissions', icon: <AuditOutlined />, label: 'Hoa hồng cá nhân' },
      { key: '/kpi', icon: <GiftOutlined />, label: 'KPI cá nhân' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  if (isSeoLeader) {
    return [
      { key: '/workspace/seo', icon: <GlobalOutlined />, label: 'Dashboard Team SEO' },
      { key: '/projects', icon: <FolderOutlined />, label: 'Projects SEO Team' },
      { key: '/projects?tab=assign', icon: <UserAddOutlined />, label: 'Phân công SEO' },
      { key: '/projects?tab=tasks', icon: <CheckSquareOutlined />, label: 'Task & Tiến độ' },
      { key: '/kpi', icon: <GiftOutlined />, label: 'KPI & Doanh số Team' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/teams', icon: <TeamOutlined />, label: 'Nhân sự Team' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  if (isSeo) {
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard cá nhân' },
      { key: '/projects', icon: <FolderOutlined />, label: 'Projects của tôi' },
      { key: '/projects?tab=tasks', icon: <CheckSquareOutlined />, label: 'Tasks của tôi' },
      { key: '/commissions', icon: <AuditOutlined />, label: 'Hoa hồng cá nhân' },
      { key: '/kpi', icon: <GiftOutlined />, label: 'KPI cá nhân' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  if (isAccountant) {
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: 'Tổng quan kế toán' },
      { key: '/payments', icon: <DollarOutlined />, label: 'Thanh toán & Thu tiền' },
      { key: '/payroll', icon: <BankOutlined />, label: 'Bảng lương' },
      { key: '/expenses', icon: <WalletOutlined />, label: 'Chi phí' },
      { key: '/orders', icon: <FileTextOutlined />, label: 'Đơn hàng' },
      { key: '/subscriptions', icon: <SyncOutlined />, label: 'Dịch vụ định kỳ' },
      { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ];
  }

  // Default / Admin fallback
  return [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard điều hành' },
    { key: '/reports', icon: <FileDoneOutlined />, label: 'Báo cáo' },
    { key: '/leads', icon: <UsergroupAddOutlined />, label: 'Leads' },
    { key: '/deals', icon: <TrophyOutlined />, label: 'Deals' },
    { key: '/orders', icon: <FileTextOutlined />, label: 'Orders' },
    { key: '/subscriptions', icon: <SyncOutlined />, label: 'Subscriptions' },
    { key: '/projects', icon: <FolderOutlined />, label: 'Projects' },
    { key: '/payments', icon: <DollarOutlined />, label: 'Payments' },
    { key: '/commissions', icon: <AuditOutlined />, label: 'Commissions' },
    { key: '/kpi', icon: <GiftOutlined />, label: 'KPI' },
    { key: '/payroll', icon: <BankOutlined />, label: 'Payroll' },
    { key: '/expenses', icon: <WalletOutlined />, label: 'Expenses' },
    { key: '/employees', icon: <TeamOutlined />, label: 'Employees' },
    { key: '/teams', icon: <UsergroupAddOutlined />, label: 'Teams' },
    { key: '/acquisition', icon: <CompassOutlined />, label: 'Acquisition' },
    { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
  ];
}

/**
 * Checks whether user has permission capability.
 * Follows RBAC hierarchy: BOSS & ADMIN have full capability bypass.
 */
export function hasCapability(user: UserProfile | null, capability: string): boolean {
  if (!user) return false;
  const roles = user.roles || [];
  if (roles.includes('BOSS') || roles.includes('ADMIN')) {
    return true;
  }
  return user.permissions?.includes(capability) ?? false;
}

/**
 * Helper to check route role allowance
 */
export function isRouteAllowed(
  userRoles: string[] = [],
  allowedRoles: readonly string[],
  strict = false,
): boolean {
  if (!strict && (userRoles.includes('ADMIN') || userRoles.includes('BOSS'))) {
    return true;
  }
  return allowedRoles.some((r) => userRoles.includes(r));
}
