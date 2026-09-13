import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '../store/authStore';
import { refreshApi } from '../api/auth';

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  const hasSession = typeof window !== 'undefined' && localStorage.getItem('crm_has_session') === 'true';
  const [checking, setChecking] = useState(!isAuthenticated && hasSession);

  useEffect(() => {
    if (!isAuthenticated) {
      if (hasSession) {
        refreshApi()
          .catch(() => {})
          .finally(() => setChecking(false));
      } else {
        setChecking(false);
      }
    }
  }, [isAuthenticated, hasSession]);

  if (checking) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 16,
          background: 'var(--vmax-bg)',
        }}
      >
        <Spin size="large" />
        <span style={{ color: 'var(--vmax-text-muted)', fontSize: 14, fontWeight: 500 }}>
          Đang xác thực phiên đăng nhập...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If user must change password:
  // - Allow access to /change-password
  // - Block all other protected routes and redirect to /change-password
  if (user?.mustChangePassword) {
    if (location.pathname !== '/change-password') {
      return <Navigate to="/change-password" replace />;
    }
    return <Outlet />;
  }

  // If user does NOT need to change password but visits /change-password directly,
  // they can still access it or continue. But if mustChangePassword is false, let Outlet render.
  return <Outlet />;
};
