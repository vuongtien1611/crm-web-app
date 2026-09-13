import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getDealsApi, DealItem } from '../../api/deals';
import { formatCurrency, getStatusLabel } from '../../constants/labels';

export const DealsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const s = searchParams.get('status') || 'ALL';
    setStatusFilter(s);
    setPage(1);
  }, [searchParams]);

  const fetchDeals = async () => {
    setLoading(true);
    try {
      const res = await getDealsApi({
        page,
        limit: 10,
        q: search || undefined,
        status: statusFilter,
      });
      setDeals(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách cơ hội bán hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchDeals();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="vmax-badge vmax-badge-blue">ĐANG MỞ</span>;
      case 'NEGOTIATING':
        return <span className="vmax-badge vmax-badge-orange">ĐANG ĐÀM PHÁN</span>;
      case 'WON':
        return <span className="vmax-badge vmax-badge-green">🏆 THẮNG DEAL</span>;
      case 'LOST':
        return <span className="vmax-badge vmax-badge-red">❌ THẤT BẠI</span>;
      default:
        return <span className="vmax-badge vmax-badge-gray">{getStatusLabel(status)}</span>;
    }
  };

  return (
    <div className="vmax-page-wrapper space-y-6">
      {/* Header */}
      <div className="vmax-page-header">
        <div>
          <h1 className="vmax-page-title">
            <span style={{ color: 'var(--vmax-green)', marginRight: 8 }}>❖</span>
            Cơ hội bán hàng (Deals Pipeline)
          </h1>
          <span className="vmax-page-subtitle">Quản lý đàm phán hợp đồng, phân bổ doanh số và chuyển đổi đơn hàng</span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="vmax-filter-card">
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, display: 'flex', gap: 10, minWidth: 280 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm theo tên cơ hội hoặc công ty khách hàng..."
            className="vmax-filter-input"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn-secondary"
            style={{ minHeight: 42, padding: '0 18px', fontWeight: 600 }}
          >
            Tìm kiếm
          </button>
        </form>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
            <option value="OPEN">Đang mở</option>
            <option value="NEGOTIATING">Đang đàm phán</option>
            <option value="WON">Thắng deal</option>
            <option value="LOST">Thất bại</option>
          </select>
        </div>
      </div>

      {/* Deals Table */}
      <div className="vmax-table-card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--vmax-text-muted)' }}>Đang tải danh sách cơ hội...</div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--vmax-red-orange)' }}>{error}</div>
        ) : deals.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--vmax-text-muted)' }}>Không tìm thấy cơ hội bán hàng nào phù hợp.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="vmax-data-table">
              <thead>
                <tr>
                  <th>Tên cơ hội</th>
                  <th>Khách hàng / Doanh nghiệp</th>
                  <th>Giá trị kỳ vọng</th>
                  <th>Trạng thái</th>
                  <th>Người phụ trách</th>
                  <th>Sale chốt deal</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr
                    key={deal.id}
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--vmax-text)' }}>{deal.deal_name}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--vmax-text)' }}>{deal.company_name}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--vmax-green)', fontSize: 13.5 }}>
                        {formatCurrency(deal.expected_value)}
                      </span>
                    </td>
                    <td>{getStatusBadge(deal.status)}</td>
                    <td>
                      {deal.assigned_sale_name ? (
                        <span style={{ fontWeight: 600, fontSize: 12 }}>👤 {deal.assigned_sale_name}</span>
                      ) : (
                        <span style={{ color: 'var(--vmax-text-muted)', fontStyle: 'italic', fontSize: 12 }}>Chưa phân công</span>
                      )}
                    </td>
                    <td>
                      {deal.closing_sale_name ? (
                        <span style={{ color: 'var(--vmax-green)', fontWeight: 600, fontSize: 12 }}>🤝 {deal.closing_sale_name}</span>
                      ) : (
                        <span style={{ color: 'var(--vmax-text-muted)', fontStyle: 'italic', fontSize: 12 }}>Chưa thiết lập</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/deals/${deal.id}`);
                        }}
                        className="btn-table-action"
                      >
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="vmax-table-pagination">
          <div>
            Hiển thị <strong>{deals.length}</strong> trên <strong>{total}</strong> cơ hội
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="vmax-page-btn"
            >
              Trước
            </button>
            <span style={{ fontWeight: 600, padding: '0 8px', color: 'var(--vmax-text)' }}>
              Trang {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="vmax-page-btn"
            >
              Tiếp theo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

