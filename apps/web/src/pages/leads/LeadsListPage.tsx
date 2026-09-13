import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  UsergroupAddOutlined,
  PlusOutlined,
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  EyeOutlined,
  MoreOutlined,
  PhoneOutlined,
  MailOutlined,
  GlobalOutlined,
  FacebookFilled,
  GoogleOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  LeftOutlined,
  RightOutlined,
  FileTextOutlined,
  NotificationOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { getLeadsApi, LeadItem } from '../../api/leads';
import { LeadCreateModal } from '../../components/leads/LeadCreateModal';
import { useAuthStore } from '../../store/authStore';
import { getStatusLabel, formatDate } from '../../constants/labels';

export const LeadsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'ALL');
  const [qualityFilter, setQualityFilter] = useState(() => searchParams.get('quality') || 'ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [assignmentFilter, setAssignmentFilter] = useState(() => {
    return searchParams.get('assignment') === 'UNASSIGNED' ? 'UNASSIGNED' : 'ALL';
  });

  useEffect(() => {
    const q = searchParams.get('quality') || 'ALL';
    const s = searchParams.get('status') || 'ALL';
    const a = searchParams.get('assignment') === 'UNASSIGNED' ? 'UNASSIGNED' : 'ALL';
    setQualityFilter(q);
    setStatusFilter(s);
    setAssignmentFilter(a);
    setPage(1);
  }, [searchParams]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('crm_leads_view_mode') as 'list' | 'grid') || 'list';
  });

  const handleSetViewMode = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('crm_leads_view_mode', mode);
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Quyền tạo lead: cho phép Admin, Boss và các vai trò kinh doanh
  const canCreateLead =
    !user || !user.roles || user.roles.some((r) => ['ADMIN', 'BOSS', 'SALE', 'SALES_TEAM_LEADER'].includes(r));

  // Tải danh sách lead theo bộ lọc
  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await getLeadsApi({
        page,
        limit,
        q: search || undefined,
        status: statusFilter,
        quality: qualityFilter,
        unassigned: assignmentFilter === 'UNASSIGNED' ? true : undefined,
      });
      setLeads(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages || Math.ceil(res.total / limit) || 1);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách khách hàng tiềm năng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [page, limit, statusFilter, qualityFilter, assignmentFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLeads();
  };

  // Chọn / bỏ chọn tất cả
  const toggleSelectAll = () => {
    if (selectedIds.length === leads.length && leads.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l) => l.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Xuất file CSV danh sách lead hiện tại
  const handleExportData = () => {
    if (leads.length === 0) return;
    const headers = ['Mã ID', 'Tên lead', 'Số điện thoại', 'Email', 'Chất lượng', 'Trạng thái', 'Kênh tiếp thị', 'Sale phụ trách', 'Ngày tạo'];
    const rows = leads.map((l) => [
      l.id,
      `"${(l.full_name || '').replace(/"/g, '""')}"`,
      `"${l.phone || ''}"`,
      `"${l.email || ''}"`,
      `"${l.quality || ''}"`,
      `"${l.status || ''}"`,
      `"${(l.platform_name || l.channel_name || 'Nhập thủ công').replace(/"/g, '""')}"`,
      `"${(l.assigned_sale_name || 'Chờ phân công').replace(/"/g, '""')}"`,
      `"${l.created_at || ''}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `danh-sach-leads-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Badge chất lượng chuẩn pill
  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'POTENTIAL':
        return <span className="vmax-badge vmax-badge-quality-potential">⭐ TIỀM NĂNG</span>;
      case 'NOT_POTENTIAL':
        return <span className="vmax-badge vmax-badge-quality-not-potential">🚫 KHÔNG TIỀM NĂNG</span>;
      default:
        return <span className="vmax-badge vmax-badge-quality-unclassified">CHƯA PHÂN LOẠI</span>;
    }
  };

  // Badge trạng thái chuẩn pill
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NEW':
        return <span className="vmax-badge vmax-badge-blue">MỚI</span>;
      case 'CALLED':
        return <span className="vmax-badge vmax-badge-orange">ĐÃ GỌI</span>;
      case 'CONSULTED':
        return <span className="vmax-badge vmax-badge-green">ĐÃ TƯ VẤN</span>;
      case 'FOLLOWING':
        return <span className="vmax-badge vmax-badge-purple">ĐANG THEO DÕI</span>;
      case 'CONVERTED':
        return <span className="vmax-badge vmax-badge-green">ĐÃ CHUYỂN ĐỔI</span>;
      case 'FAILED':
        return <span className="vmax-badge vmax-badge-red">THẤT BẠI</span>;
      default:
        return <span className="vmax-badge vmax-badge-gray">{getStatusLabel(status)}</span>;
    }
  };

  // Render icon & tên kênh tiếp thị
  const getChannelDisplay = (lead: LeadItem) => {
    const raw = `${lead.platform_name || ''} ${lead.channel_name || ''}`.toLowerCase();
    let icon = <GlobalOutlined style={{ color: '#0C6B37', fontSize: 17 }} />;
    if (raw.includes('facebook') || raw.includes('fb') || raw.includes('fanpage')) {
      icon = <FacebookFilled style={{ color: '#1877F2', fontSize: 18 }} />;
    } else if (raw.includes('google') || raw.includes('seo') || raw.includes('organic')) {
      icon = <GoogleOutlined style={{ color: '#EA4335', fontSize: 17 }} />;
    } else if (raw.includes('form') || raw.includes('inbound')) {
      icon = <FileTextOutlined style={{ color: '#7E22CE', fontSize: 17 }} />;
    } else if (raw.includes('marketing') || raw.includes('chiến dịch')) {
      icon = <NotificationOutlined style={{ color: '#F59E0B', fontSize: 17 }} />;
    }

    const title = lead.platform_name || lead.channel_name || 'Inbound Form';
    const sub =
      lead.utm_campaign ||
      lead.utm_source ||
      (lead.landing_page ? 'Landing Page' : lead.platform_name && lead.channel_name ? lead.channel_name : 'Nhập thủ công');

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0 }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: '#1F2937',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 160,
            }}
            title={title}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: '#667085',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 160,
            }}
            title={sub}
          >
            {sub}
          </div>
        </div>
      </div>
    );
  };

  // Render thông tin Sale phụ trách
  const getSaleDisplay = (lead: LeadItem) => {
    if (lead.assigned_sale_name) {
      const initial = (lead.assigned_sale_name || 'S').trim().charAt(0).toUpperCase();
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#E2ECE5',
              color: '#0C6B37',
              fontWeight: 700,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <span
            style={{
              fontWeight: 500,
              fontSize: 13,
              color: '#1F2937',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 130,
            }}
            title={lead.assigned_sale_name}
          >
            {lead.assigned_sale_name}
          </span>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#F2F4F7',
            color: '#667085',
            fontWeight: 600,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          —
        </div>
        <span style={{ fontSize: 13, color: '#667085', fontWeight: 500, whiteSpace: 'nowrap' }}>
          Chờ phân công
        </span>
      </div>
    );
  };

  // Render danh sách nút số trang
  const renderPaginationPages = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (page < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    return pages.map((p, idx) => {
      if (p === '...') {
        return (
          <span key={`ellipsis-${idx}`} style={{ padding: '0 6px', color: '#9CA3AF' }}>
            ...
          </span>
        );
      }
      return (
        <button
          key={`page-${p}`}
          onClick={() => setPage(p as number)}
          className={`vmax-page-btn ${page === p ? 'active' : ''}`}
        >
          {p}
        </button>
      );
    });
  };

  return (
    <div className="vmax-page-wrapper space-y-6">
      {/* 1. Page Header */}
      <div className="vmax-page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--vmax-green-soft)',
              color: 'var(--vmax-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            <UsergroupAddOutlined />
          </div>
          <div>
            <h1 className="vmax-page-title" style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1F2937' }}>
              Khách hàng tiềm năng
            </h1>
            <span className="vmax-page-subtitle" style={{ fontSize: 13, color: '#667085', marginTop: 2 }}>
              Quản lý và theo dõi toàn bộ lead từ nhiều kênh khác nhau
            </span>
          </div>
        </div>

        {canCreateLead && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 40,
              padding: '0 18px',
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 13.5,
            }}
          >
            <PlusOutlined />
            <span>Thêm lead mới</span>
          </button>
        )}
      </div>

      {/* 2. Filter Bar */}
      <div className="vmax-filter-card" style={{ marginBottom: 20 }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: 'flex', gap: 8, flex: 1, minWidth: 280, maxWidth: 460 }}
        >
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <SearchOutlined
              style={{
                position: 'absolute',
                left: 12,
                color: '#9CA3AF',
                fontSize: 15,
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm theo tên, số điện thoại hoặc email..."
              className="vmax-filter-input"
              style={{ width: '100%', paddingLeft: 36 }}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{
              height: 40,
              padding: '0 16px',
              fontWeight: 600,
              fontSize: 13,
              borderRadius: 8,
              flexShrink: 0,
            }}
          >
            Tìm kiếm
          </button>
        </form>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Trạng thái */}
          <select
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value;
              setStatusFilter(val);
              setPage(1);
              const nextParams = new URLSearchParams(searchParams);
              if (val && val !== 'ALL') {
                nextParams.set('status', val);
              } else {
                nextParams.delete('status');
              }
              setSearchParams(nextParams);
            }}
            className="vmax-filter-select"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="NEW">Mới</option>
            <option value="CALLED">Đã gọi</option>
            <option value="CONSULTED">Đã tư vấn</option>
            <option value="FOLLOWING">Đang theo dõi</option>
            <option value="CONVERTED">Đã chuyển đổi</option>
            <option value="FAILED">Thất bại</option>
          </select>

          {/* Chất lượng */}
          <select
            value={qualityFilter}
            onChange={(e) => {
              const val = e.target.value;
              setQualityFilter(val);
              setPage(1);
              const nextParams = new URLSearchParams(searchParams);
              if (val && val !== 'ALL') {
                nextParams.set('quality', val);
              } else {
                nextParams.delete('quality');
              }
              setSearchParams(nextParams);
            }}
            className="vmax-filter-select"
          >
            <option value="ALL">Tất cả chất lượng</option>
            <option value="UNCLASSIFIED">Chưa phân loại</option>
            <option value="POTENTIAL">Tiềm năng</option>
            <option value="NOT_POTENTIAL">Không tiềm năng</option>
          </select>

          {/* Kênh tiếp thị */}
          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
            className="vmax-filter-select"
          >
            <option value="ALL">Tất cả kênh tiếp thị</option>
            <option value="FACEBOOK">Facebook Ads & Fanpage</option>
            <option value="GOOGLE">SEO & Organic</option>
            <option value="INBOUND">Inbound Form</option>
            <option value="OTHER">Kênh khác</option>
          </select>

          {/* Sale phụ trách / Phân công */}
          <select
            value={assignmentFilter}
            onChange={(e) => {
              const val = e.target.value;
              setAssignmentFilter(val);
              setPage(1);
              const nextParams = new URLSearchParams(searchParams);
              if (val === 'UNASSIGNED') {
                nextParams.set('assignment', 'UNASSIGNED');
              } else {
                nextParams.delete('assignment');
              }
              setSearchParams(nextParams);
            }}
            className="vmax-filter-select"
          >
            <option value="ALL">Tất cả nhân viên</option>
            <option value="UNASSIGNED">Chờ phân công</option>
          </select>

          {/* Bộ lọc nâng cao */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setStatusFilter('ALL');
              setQualityFilter('ALL');
              setChannelFilter('ALL');
              setAssignmentFilter('ALL');
              setSearch('');
              setPage(1);
              setSearchParams(new URLSearchParams());
            }}
            style={{
              height: 40,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#374151',
            }}
          >
            <FilterOutlined style={{ color: '#0C6B37' }} />
            <span>Bộ lọc nâng cao</span>
          </button>
        </div>
      </div>

      {/* 3. Table Card */}
      <div className="vmax-table-card">
        {/* Header Toolbar trên bảng */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            borderBottom: '1px solid #EEF2EF',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Danh sách leads</div>
            <div style={{ fontSize: 13, color: '#667085', marginTop: 2 }}>
              Hiển thị {leads.length > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, total)} trong tổng số {total} leads
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Nút Xuất dữ liệu */}
            <button
              type="button"
              onClick={handleExportData}
              className="btn-secondary"
              style={{
                height: 36,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: '#0C6B37',
                border: '1px solid #DDE8E1',
                background: '#ffffff',
                cursor: 'pointer',
              }}
            >
              <DownloadOutlined />
              <span>Xuất dữ liệu</span>
            </button>

            {/* List / Grid view toggle */}
            <div
              style={{
                display: 'inline-flex',
                border: '1px solid #DDE8E1',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => handleSetViewMode('list')}
                style={{
                  height: 36,
                  width: 36,
                  background: viewMode === 'list' ? '#0C6B37' : '#ffffff',
                  color: viewMode === 'list' ? '#ffffff' : '#667085',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                aria-label="Xem dạng danh sách"
                title="Xem dạng danh sách"
              >
                <UnorderedListOutlined style={{ fontSize: 15 }} />
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode('grid')}
                style={{
                  height: 36,
                  width: 36,
                  background: viewMode === 'grid' ? '#0C6B37' : '#ffffff',
                  color: viewMode === 'grid' ? '#ffffff' : '#667085',
                  border: 'none',
                  borderLeft: '1px solid #DDE8E1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                aria-label="Xem dạng lưới"
                title="Xem dạng lưới"
              >
                <AppstoreOutlined style={{ fontSize: 15 }} />
              </button>
            </div>

            {/* Chọn số dòng hiển thị */}
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              style={{
                height: 36,
                border: '1px solid #DDE8E1',
                borderRadius: 8,
                padding: '0 10px',
                fontSize: 13,
                color: '#1F2937',
                background: '#ffffff',
                cursor: 'pointer',
              }}
            >
              <option value={10}>Hiển thị 10 dòng</option>
              <option value={20}>Hiển thị 20 dòng</option>
              <option value={50}>Hiển thị 50 dòng</option>
            </select>
          </div>
        </div>

        {/* 4. Data Content: Table or Grid */}
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#667085' }}>Đang tải danh sách Lead...</div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#E1523A' }}>{error}</div>
        ) : leads.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#667085' }}>Không tìm thấy khách hàng tiềm năng nào phù hợp.</div>
        ) : viewMode === 'list' ? (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="vmax-data-table" style={{ width: '100%', minWidth: 1060, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === leads.length && leads.length > 0}
                      onChange={toggleSelectAll}
                      style={{ width: 16, height: 16, accentColor: '#0C6B37', cursor: 'pointer' }}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th style={{ width: 170 }}>Tên lead</th>
                  <th style={{ width: 160 }}>Liên hệ</th>
                  <th style={{ width: 140 }}>Chất lượng</th>
                  <th style={{ width: 125 }}>Trạng thái</th>
                  <th style={{ width: 155 }}>Kênh tiếp thị</th>
                  <th style={{ width: 136 }}>Sale phụ trách</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const isSelected = selectedIds.includes(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? '#F2F8F4' : undefined,
                      }}
                    >
                      <td
                        style={{ textAlign: 'center' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(lead.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id)}
                          style={{ width: 16, height: 16, accentColor: '#0C6B37', cursor: 'pointer' }}
                          aria-label={`Chọn lead ${lead.full_name}`}
                        />
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: '#1F2937',
                            maxWidth: 220,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.35,
                          }}
                          title={lead.full_name}
                        >
                          {lead.full_name}
                        </div>
                        {lead.landing_page && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: '#667085',
                              marginTop: 3,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 200,
                            }}
                          >
                            🌐 {lead.landing_page}
                          </div>
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#1F2937',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <PhoneOutlined style={{ color: '#667085', fontSize: 12 }} />
                          <span>{lead.phone || '—'}</span>
                        </div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: '#667085',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 3,
                          }}
                        >
                          <MailOutlined style={{ color: '#9CA3AF', fontSize: 12 }} />
                          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.email || '—'}
                          </span>
                        </div>
                      </td>
                      <td>{getQualityBadge(lead.quality)}</td>
                      <td>{getStatusBadge(lead.status)}</td>
                      <td>{getChannelDisplay(lead)}</td>
                      <td>{getSaleDisplay(lead)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 6,
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/leads/${lead.id}`);
                            }}
                            className="btn-table-action"
                          >
                            <EyeOutlined style={{ fontSize: 13, marginRight: 6 }} />
                            <span>Xem chi tiết</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/leads/${lead.id}`);
                            }}
                            className="btn-table-action-more"
                            aria-label="Thao tác khác"
                          >
                            <MoreOutlined />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View */
          <div>
            {/* Thanh chọn tất cả khi ở dạng lưới */}
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid #EEF2EF',
                background: '#F9FAF9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.length === leads.length && leads.length > 0}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, accentColor: '#0C6B37', cursor: 'pointer' }}
                />
                <span>Chọn tất cả ({leads.length} leads)</span>
              </label>

              {selectedIds.length > 0 && (
                <span style={{ fontSize: 12.5, color: '#0C6B37', fontWeight: 600 }}>
                  Đã chọn {selectedIds.length}/{leads.length} lead
                </span>
              )}
            </div>

            {/* Grid danh sách card */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 16,
                padding: 20,
              }}
            >
              {leads.map((lead) => {
                const isSelected = selectedIds.includes(lead.id);
                const initial = (lead.full_name || 'L').trim().charAt(0).toUpperCase();

                return (
                  <div
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    style={{
                      background: isSelected ? '#F2F8F4' : '#FFFFFF',
                      border: isSelected ? '1.5px solid #0C6B37' : '1px solid #E8EEE9',
                      borderRadius: 14,
                      padding: 16,
                      boxShadow: isSelected
                        ? '0 4px 12px rgba(12, 107, 55, 0.12)'
                        : '0 1px 3px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#0C6B37';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(12, 107, 55, 0.08)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#E8EEE9';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }
                    }}
                  >
                    {/* Header: Checkbox + Avatar + Tên + Ngày tạo */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(lead.id);
                          }}
                          style={{ display: 'flex', alignItems: 'center' }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(lead.id)}
                            style={{ width: 16, height: 16, accentColor: '#0C6B37', cursor: 'pointer' }}
                            aria-label={`Chọn lead ${lead.full_name}`}
                          />
                        </div>

                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: 'var(--vmax-green-soft)',
                            color: 'var(--vmax-green)',
                            fontWeight: 700,
                            fontSize: 14,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {initial}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 14.5,
                              color: '#1F2937',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              lineHeight: 1.3,
                            }}
                            title={lead.full_name}
                          >
                            {lead.full_name}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: '#667085',
                              marginTop: 2,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <CalendarOutlined style={{ fontSize: 11, color: '#9CA3AF' }} />
                            <span>{formatDate(lead.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Badges: Chất lượng & Trạng thái */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {getQualityBadge(lead.quality)}
                      {getStatusBadge(lead.status)}
                    </div>

                    {/* Thông tin liên hệ */}
                    <div
                      style={{
                        background: isSelected ? '#EAF3ED' : '#F8FAF9',
                        borderRadius: 8,
                        padding: '8px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        fontSize: 12.5,
                        transition: 'background 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                        <PhoneOutlined style={{ color: '#0C6B37', fontSize: 12 }} />
                        <span style={{ fontWeight: 500 }}>{lead.phone || 'Chưa có SĐT'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#667085' }}>
                        <MailOutlined style={{ color: '#9CA3AF', fontSize: 12 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.email || 'Chưa có email'}
                        </span>
                      </div>
                      {lead.landing_page && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: '#0C6B37',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title={lead.landing_page}
                        >
                          <span>🌐</span>
                          <span>{lead.landing_page}</span>
                        </div>
                      )}
                    </div>

                    {/* Kênh tiếp thị & Sale phụ trách */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontSize: 12.5,
                        paddingTop: 8,
                        borderTop: '1px dashed #E8EEE9',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ color: '#667085', fontSize: 11.5, flexShrink: 0 }}>Kênh:</span>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>{getChannelDisplay(lead)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ color: '#667085', fontSize: 11.5, flexShrink: 0 }}>Phụ trách:</span>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>{getSaleDisplay(lead)}</div>
                      </div>
                    </div>

                    {/* Nút hành động */}
                    <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/leads/${lead.id}`);
                        }}
                        className="btn-table-action"
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          height: 34,
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          gap: 6,
                        }}
                      >
                        <EyeOutlined style={{ fontSize: 13 }} />
                        <span>Xem chi tiết</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Pagination Footer */}
        <div className="vmax-table-pagination">
          <div>
            Hiển thị <strong>{leads.length > 0 ? (page - 1) * limit + 1 : 0}</strong> - <strong>{Math.min(page * limit, total)}</strong> trong tổng số <strong>{total}</strong> leads
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="vmax-page-btn"
              aria-label="Trang trước"
            >
              <LeftOutlined style={{ fontSize: 11 }} />
            </button>
            {renderPaginationPages()}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="vmax-page-btn"
              aria-label="Trang sau"
            >
              <RightOutlined style={{ fontSize: 11 }} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Tạo Lead mới */}
      <LeadCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={fetchLeads}
      />
    </div>
  );
};


