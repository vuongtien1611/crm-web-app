import React, { useState } from 'react';
import { markLostApi } from '../../api/deals';

interface Props {
  isOpen: boolean;
  dealId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealLostModal: React.FC<Props> = ({ isOpen, dealId, onClose, onSuccess }) => {
  const [lostReason, setLostReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lostReason.trim()) {
      setError('Vui lòng nhập lý do thất bại');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await markLostApi(dealId, lostReason);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể đánh dấu thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
        <h2 className="text-lg font-bold text-rose-400 mb-4 border-b border-slate-800 pb-2">Đánh dấu Cơ hội THẤT BẠI</h2>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Lý do thất bại *
            </label>
            <textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-rose-500"
              placeholder="Ví dụ: Đối thủ giảm giá 20%, Khách hàng tạm hoãn dự án vô thời hạn..."
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Đánh dấu THẤT BẠI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

