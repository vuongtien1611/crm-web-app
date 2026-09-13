import React, { useState } from 'react';
import { markWonApi } from '../../api/deals';
import { formatCurrency } from '../../constants/labels';

interface Props {
  isOpen: boolean;
  dealId: string;
  dealName: string;
  closingSaleName: string | null;
  expectedValue: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealWonConfirmModal: React.FC<Props> = ({
  isOpen,
  dealId,
  dealName,
  closingSaleName,
  expectedValue,
  onClose,
  onSuccess,
}) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!closingSaleName) {
      setError('Bắt buộc phải thiết lập Sale chốt hợp đồng trước khi xác nhận THẮNG DEAL.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await markWonApi(dealId);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể xác nhận THẮNG DEAL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
        <h2 className="text-lg font-bold text-emerald-400 border-b border-slate-800 pb-2 flex items-center gap-2">
          🏆 Xác nhận THẮNG DEAL
        </h2>

        <div className="bg-slate-800/60 p-4 rounded-lg text-xs space-y-2 border border-slate-700">
          <div>
            <span className="text-slate-400">Cơ hội:</span> <strong className="text-slate-200">{dealName}</strong>
          </div>
          <div>
            <span className="text-slate-400">Giá trị kỳ vọng:</span>{' '}
            <strong className="text-emerald-400">{formatCurrency(expectedValue)}</strong>
          </div>
          <div>
            <span className="text-slate-400">Sale chốt được ghi nhận:</span>{' '}
            <strong className={closingSaleName ? 'text-indigo-400' : 'text-rose-400'}>
              {closingSaleName || 'CHƯA THIẾT LẬP (Bắt buộc!)'}
            </strong>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Xác nhận THẮNG DEAL sẽ cập nhật trạng thái cơ hội thành công, đồng thời tự động tạo mục đơn hàng mới gắn liền với cơ hội này.
        </p>

        {error && <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !closingSaleName}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : 'Xác nhận THẮNG DEAL'}
          </button>
        </div>
      </div>
    </div>
  );
};

