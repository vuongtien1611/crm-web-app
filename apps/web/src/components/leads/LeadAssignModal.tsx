import React, { useState } from 'react';
import { assignLeadApi } from '../../api/leads';

interface Props {
  isOpen: boolean;
  leadId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadAssignModal: React.FC<Props> = ({
  isOpen,
  leadId,
  onClose,
  onSuccess,
}) => {
  const [toSaleId, setToSaleId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toSaleId.trim()) {
      setError('Vui lòng chọn ID nhân viên Sale');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await assignLeadApi(leadId, toSaleId, reason || undefined);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể phân công Lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
        <h2 className="text-lg font-bold mb-4 border-b border-slate-800 pb-2">Phân công Lead cho Sale</h2>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              ID Nhân viên Sale *
            </label>
            <input
              type="number"
              value={toSaleId}
              onChange={(e) => setToSaleId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              placeholder="Ví dụ: 1"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Ghi chú / Lý do phân công
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              placeholder="Ví dụ: Khách hàng yêu cầu tư vấn gói giải pháp CRM..."
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
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Đang phân công...' : 'Phân công Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

