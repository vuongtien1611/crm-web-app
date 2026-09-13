import React, { useState } from 'react';
import { convertLeadToDealApi } from '../../api/leads';

interface Props {
  isOpen: boolean;
  leadId: string;
  defaultContactName: string;
  defaultPhone: string;
  defaultEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadConvertDealModal: React.FC<Props> = ({
  isOpen,
  leadId,
  defaultContactName,
  defaultPhone,
  defaultEmail,
  onClose,
  onSuccess,
}) => {
  const [companyName, setCompanyName] = useState(defaultContactName ? `${defaultContactName} Corp` : '');
  const [taxCode, setTaxCode] = useState('');
  const [contactName, setContactName] = useState(defaultContactName);
  const [contactPhone, setContactPhone] = useState(defaultPhone);
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [dealName, setDealName] = useState(defaultContactName ? `Cơ hội - ${defaultContactName}` : '');
  const [expectedValue, setExpectedValue] = useState('10000000');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim() || !dealName.trim()) {
      setError('Vui lòng điền tên công ty, tên người liên hệ và tên cơ hội bán hàng');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await convertLeadToDealApi(leadId, {
        companyName,
        taxCode: taxCode || undefined,
        contactName,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
        dealName,
        expectedValue: Number(expectedValue) || 0,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể chuyển đổi Lead thành Deal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-slate-100 shadow-2xl">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
          <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
            🚀 Chuyển đổi Lead thành Deal
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs">
          Chuyển đổi khách hàng <strong>TIỀM NĂNG</strong> này sẽ tự động tạo một <strong>Doanh nghiệp (Account)</strong> mới, <strong>Người liên hệ chính (Contact)</strong>, và <strong>Cơ hội bán hàng (Deal)</strong> với trạng thái Đang mở, đồng thời chuyển Lead sang trạng thái <strong>ĐÃ CHUYỂN ĐỔI</strong>.
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Tên công ty / Doanh nghiệp *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Mã số thuế (MST)
              </label>
              <input
                type="text"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                placeholder="0312345678"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Người liên hệ *
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Số điện thoại
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Email liên hệ
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Tên cơ hội bán hàng (Deal Name) *
              </label>
              <input
                type="text"
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Giá trị kỳ vọng (VND)
              </label>
              <input
                type="number"
                value={expectedValue}
                onChange={(e) => setExpectedValue(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
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
              {loading ? 'Đang chuyển đổi...' : 'Tạo Deal & Chuyển đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

