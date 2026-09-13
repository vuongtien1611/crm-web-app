import React, { useState } from 'react';
import { setClosingSaleApi } from '../../api/deals';

interface Props {
  isOpen: boolean;
  dealId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealClosingSaleModal: React.FC<Props> = ({ isOpen, dealId, onClose, onSuccess }) => {
  const [closingSaleId, setClosingSaleId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingSaleId.trim()) {
      setError('Vui lòng chọn ID nhân viên Sale chốt');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await setClosingSaleApi(dealId, closingSaleId);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể thiết lập Sale chốt hợp đồng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
        <h2 className="text-lg font-bold mb-4 border-b border-slate-800 pb-2">Thiết lập Sale chốt hợp đồng</h2>

        <p className="text-xs text-slate-400 mb-4">
          Chỉ định nhân viên được ghi nhận hoa hồng chốt cơ hội này. Bắt buộc trước khi đánh dấu THẮNG DEAL.
        </p>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              ID Nhân viên Sale chốt *
            </label>
            <input
              type="number"
              value={closingSaleId}
              onChange={(e) => setClosingSaleId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              placeholder="Ví dụ: 1"
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
              className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Lưu Sale chốt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

