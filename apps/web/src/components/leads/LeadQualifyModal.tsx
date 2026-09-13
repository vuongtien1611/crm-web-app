import React, { useState } from 'react';
import { qualifyLeadApi } from '../../api/leads';

interface Props {
  isOpen: boolean;
  leadId: string;
  currentQuality: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadQualifyModal: React.FC<Props> = ({
  isOpen,
  leadId,
  currentQuality,
  onClose,
  onSuccess,
}) => {
  const [quality, setQuality] = useState<'POTENTIAL' | 'NOT_POTENTIAL'>(
    currentQuality === 'POTENTIAL' ? 'POTENTIAL' : 'NOT_POTENTIAL',
  );
  const [notPotentialReason, setNotPotentialReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quality === 'NOT_POTENTIAL' && !notPotentialReason.trim()) {
      setError('Vui lòng nhập lý do vì sao khách hàng KHÔNG TIỀM NĂNG');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await qualifyLeadApi(leadId, quality, quality === 'NOT_POTENTIAL' ? notPotentialReason : undefined);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể đánh giá chất lượng Lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
        <h2 className="text-lg font-bold mb-4 border-b border-slate-800 pb-2">Đánh giá chất lượng Lead</h2>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Chọn mức độ chất lượng
            </label>
            <div className="flex gap-4">
              <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer font-semibold text-sm transition ${
                quality === 'POTENTIAL'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}>
                <input
                  type="radio"
                  name="quality"
                  value="POTENTIAL"
                  checked={quality === 'POTENTIAL'}
                  onChange={() => setQuality('POTENTIAL')}
                  className="hidden"
                />
                <span className="text-base">⭐</span> TIỀM NĂNG
              </label>

              <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer font-semibold text-sm transition ${
                quality === 'NOT_POTENTIAL'
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}>
                <input
                  type="radio"
                  name="quality"
                  value="NOT_POTENTIAL"
                  checked={quality === 'NOT_POTENTIAL'}
                  onChange={() => setQuality('NOT_POTENTIAL')}
                  className="hidden"
                />
                <span className="text-base">🚫</span> KHÔNG TIỀM NĂNG
              </label>
            </div>
          </div>

          {quality === 'NOT_POTENTIAL' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Lý do không tiềm năng *
              </label>
              <textarea
                value={notPotentialReason}
                onChange={(e) => setNotPotentialReason(e.target.value)}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                placeholder="Ví dụ: Ngân sách quá thấp, Ngoài khu vực hỗ trợ, Sai số điện thoại..."
                required
              />
            </div>
          )}

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
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Lưu đánh giá'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

