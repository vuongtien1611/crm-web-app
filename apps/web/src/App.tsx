import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { MainLayout } from './layout/MainLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LeadsListPage } from './pages/leads/LeadsListPage';
import { LeadDetailPage } from './pages/leads/LeadDetailPage';
import { AcquisitionPage } from './pages/acquisition/AcquisitionPage';
import { DealsListPage } from './pages/deals/DealsListPage';
import { DealDetailPage } from './pages/deals/DealDetailPage';
import { OrdersListPage } from './pages/orders/OrdersListPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { ProjectsListPage } from './pages/projects/ProjectsListPage';
import { ProjectDetailPage } from './pages/projects/ProjectDetailPage';
import { PaymentsListPage } from './pages/payments/PaymentsListPage';
import { PaymentDetailPage } from './pages/payments/PaymentDetailPage';
import { CommissionsListPage } from './pages/commissions/CommissionsListPage';
import { CommissionDetailPage } from './pages/commissions/CommissionDetailPage';
import { KpiDashboardPage } from './pages/kpi/KpiDashboardPage';
import { PayrollListPage } from './pages/payroll/PayrollListPage';
import { PayrollDetailPage } from './pages/payroll/PayrollDetailPage';
import { EmployeePayrollDetailPage } from './pages/payroll/EmployeePayrollDetailPage';
import { ExpensesListPage } from './pages/expenses/ExpensesListPage';
import { ExpenseDetailPage } from './pages/expenses/ExpenseDetailPage';
import { EmployeesListPage } from './pages/employees/EmployeesListPage';
import { CreateEmployeePage } from './pages/employees/CreateEmployeePage';
import { EmployeeDetailPage } from './pages/employees/EmployeeDetailPage';
import { TeamsListPage } from './pages/teams/TeamsListPage';
import { CreateTeamPage } from './pages/teams/CreateTeamPage';
import { TeamDetailPage } from './pages/teams/TeamDetailPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { SalesLeaderWorkspacePage } from './pages/workspace/SalesLeaderWorkspacePage';
import { DevLeaderWorkspacePage } from './pages/workspace/DevLeaderWorkspacePage';
import { SeoLeaderWorkspacePage } from './pages/workspace/SeoLeaderWorkspacePage';
import { DailyReportsPage } from './pages/daily-reports/DailyReportsPage';
import { SubscriptionsListPage } from './pages/subscriptions/SubscriptionsListPage';
import { SubscriptionDetailPage } from './pages/subscriptions/SubscriptionDetailPage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { EmployeeAccountsListPage } from './pages/employee-accounts/EmployeeAccountsListPage';
import { EmployeeAccountDetailPage } from './pages/employee-accounts/EmployeeAccountDetailPage';
import { OrganizationChartPage } from './pages/organization-chart/OrganizationChartPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleRoute } from './components/RoleRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const vmaxTheme = {
  token: {
    colorPrimary: '#0C6B37',
    colorPrimaryHover: '#084D29',
    colorPrimaryActive: '#084D29',
    colorSuccess: '#0C6B37',
    colorWarning: '#F69F31',
    colorError: '#E1523A',
    colorInfo: '#167A45',
    colorTextBase: '#18211C',
    colorTextSecondary: '#66736B',
    colorBgBase: '#FFFFFF',
    colorBgLayout: '#F7FAF8',
    colorBorder: '#DDE7E1',
    colorBorderSecondary: '#EEF4F0',
    borderRadius: 12,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    controlHeight: 42,
    controlHeightLG: 46,
    controlHeightSM: 32,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Button: {
      controlHeight: 42,
      borderRadius: 12,
      fontWeight: 600,
      colorPrimaryHover: '#084D29',
    },
    Card: {
      borderRadiusLG: 16,
      colorBorderSecondary: '#DDE7E1',
    },
    Table: {
      borderRadius: 12,
      headerBg: '#F2F8F4',
      headerColor: '#18211C',
      headerSplitColor: '#DDE7E1',
      rowHoverBg: '#F7FAF8',
    },
    Menu: {
      itemBorderRadius: 10,
      itemSelectedColor: '#0C6B37',
      itemSelectedBg: '#EAF3ED',
      itemHoverBg: '#F2F8F4',
      itemHoverColor: '#0C6B37',
    },
    Input: {
      controlHeight: 42,
      borderRadius: 10,
      activeBorderColor: '#0C6B37',
      hoverBorderColor: '#167A45',
    },
    InputNumber: {
      controlHeight: 42,
      borderRadius: 10,
    },
    DatePicker: {
      controlHeight: 42,
      borderRadius: 10,
    },
    Select: {
      controlHeight: 42,
      borderRadius: 10,
    },
    Form: {
      itemMarginBottom: 20,
      verticalLabelPadding: '0 0 6px',
    },
    Modal: {
      borderRadiusLG: 16,
    },
    Tabs: {
      inkBarColor: '#0C6B37',
      itemActiveColor: '#0C6B37',
      itemSelectedColor: '#0C6B37',
      itemHoverColor: '#167A45',
    },
    Pagination: {
      itemActiveBg: '#EAF3ED',
      colorPrimary: '#0C6B37',
      colorPrimaryHover: '#084D29',
    },
  },
};

export const App: React.FC = () => {
  return (
    <ConfigProvider locale={viVN} theme={vmaxTheme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/login" element={<Login />} />

              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/change-password" element={<ChangePasswordPage />} />
                <Route element={<MainLayout />}>
                  {/* Common Routes */}
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/daily-reports" element={<DailyReportsPage />} />
                  <Route path="/kpi" element={<KpiDashboardPage />} />
                  <Route path="/commissions" element={<CommissionsListPage />} />
                  <Route path="/commissions/:id" element={<CommissionDetailPage />} />

                  {/* Sales Routes (BOSS, ADMIN, SALES_TEAM_LEADER, SALE) */}
                  <Route element={<RoleRoute allowedRoles={['SALES_TEAM_LEADER', 'SALE']} />}>
                    <Route path="/leads" element={<LeadsListPage />} />
                    <Route path="/leads/:id" element={<LeadDetailPage />} />
                    <Route path="/deals" element={<DealsListPage />} />
                    <Route path="/deals/:id" element={<DealDetailPage />} />
                  </Route>

                  {/* Orders Routes (BOSS, ADMIN, ACCOUNTANT, SALES_TEAM_LEADER, SALE) */}
                  <Route element={<RoleRoute allowedRoles={['SALES_TEAM_LEADER', 'SALE', 'ACCOUNTANT']} />}>
                    <Route path="/orders" element={<OrdersListPage />} />
                    <Route path="/orders/:id" element={<OrderDetailPage />} />
                  </Route>

                  {/* Subscriptions Routes */}
                  <Route element={<RoleRoute allowedRoles={['SALES_TEAM_LEADER', 'SALE', 'ACCOUNTANT', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER']} />}>
                    <Route path="/subscriptions" element={<SubscriptionsListPage />} />
                    <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />
                  </Route>

                  {/* Projects Routes (DEV_TEAM_LEADER, DEV, SEO_TEAM_LEADER, SEO, SALES_TEAM_LEADER, SALE) */}
                  <Route element={<RoleRoute allowedRoles={['DEV_TEAM_LEADER', 'DEV', 'SEO_TEAM_LEADER', 'SEO', 'SALES_TEAM_LEADER', 'SALE']} />}>
                    <Route path="/projects" element={<ProjectsListPage />} />
                    <Route path="/projects/:id" element={<ProjectDetailPage />} />
                  </Route>

                  {/* Finance Routes (BOSS, ADMIN, ACCOUNTANT only) */}
                  <Route element={<RoleRoute allowedRoles={['ACCOUNTANT']} />}>
                    <Route path="/payments" element={<PaymentsListPage />} />
                    <Route path="/payments/:id" element={<PaymentDetailPage />} />
                    <Route path="/payroll" element={<PayrollListPage />} />
                    <Route path="/payroll/:periodId" element={<PayrollDetailPage />} />
                    <Route path="/payroll/:periodId/employees/:employeeId" element={<EmployeePayrollDetailPage />} />
                    <Route path="/expenses" element={<ExpensesListPage />} />
                    <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
                  </Route>

                  {/* HR & Management Routes (BOSS, ADMIN only) */}
                  <Route element={<RoleRoute allowedRoles={[]} />}>
                    <Route path="/employees" element={<EmployeesListPage />} />
                    <Route path="/employees/new" element={<CreateEmployeePage />} />
                    <Route path="/employees/:id" element={<EmployeeDetailPage />} />
                    <Route path="/acquisition" element={<AcquisitionPage />} />
                  </Route>

                  {/* Employee Accounts Management (Strict BOSS only) */}
                  <Route element={<RoleRoute allowedRoles={['BOSS']} strict />}>
                    <Route path="/employee-accounts" element={<EmployeeAccountsListPage />} />
                    <Route path="/employee-accounts/:employeeId" element={<EmployeeAccountDetailPage />} />
                    <Route path="/organization-chart" element={<OrganizationChartPage />} />
                  </Route>

                  {/* Teams Routes (BOSS, ADMIN, Team Leaders) */}
                  <Route element={<RoleRoute allowedRoles={['SALES_TEAM_LEADER', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER']} />}>
                    <Route path="/teams" element={<TeamsListPage />} />
                    <Route path="/teams/new" element={<CreateTeamPage />} />
                    <Route path="/teams/:id" element={<TeamDetailPage />} />
                  </Route>

                  {/* Workspaces */}
                  <Route element={<RoleRoute allowedRoles={['SALES_TEAM_LEADER']} />}>
                    <Route path="/workspace/sales" element={<SalesLeaderWorkspacePage />} />
                  </Route>
                  <Route element={<RoleRoute allowedRoles={['DEV_TEAM_LEADER']} />}>
                    <Route path="/workspace/dev" element={<DevLeaderWorkspacePage />} />
                  </Route>
                  <Route element={<RoleRoute allowedRoles={['SEO_TEAM_LEADER']} />}>
                    <Route path="/workspace/seo" element={<SeoLeaderWorkspacePage />} />
                  </Route>

                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
};

