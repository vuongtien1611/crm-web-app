import React, { useState } from 'react';
import { createSalesActivityApi } from '../../api/leads';
import { formatDateTime } from '../../constants/labels';

interface ActivityItem {
  id: string;
  activity_type: string;
  occurred_at: string;
  next_follow_up_at: string | null;
  result_note: string | null;
  employee_name: string;
}

interface Props {
  leadId?: string;
  dealId?: string;
  activities: ActivityItem[];
  onRefresh: () => void;
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'CALL': return '📞';
    case 'MEETING': return '🤝';
    case 'ZALO': return '💬';
    case 'EMAIL': return '✉️';
    case 'NOTE': return '📝';
    case 'FOLLOW_UP': return '⏰';
    case 'QUOTATION': return '📄';
    case 'TASK': return '✅';
    default: return '📌';
  }
};

const getActivityName = (type: string) => {
  switch (type) {
    case 'CALL': return 'Cuộc gọi';
    case 'MEETING': return 'Gặp mặt';
    case 'ZALO': return 'Zalo';
    case 'EMAIL': return 'Email';
    case 'NOTE': return 'Ghi chú';
    case 'FOLLOW_UP': return 'Theo dõi lại';
    case 'QUOTATION': return 'Báo giá';
    case 'TASK': return 'Nhiệm vụ';
    default: return type;
  }
};

export const ActivityTimeline: React.FC<Props> = ({ leadId, dealId, activities, onRefresh }) => {
  const [activityType, setActivityType] = useState('CALL');
  const [resultNote, setResultNote] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await createSalesActivityApi({
        leadId,
        dealId,
        activityType,
        resultNote: resultNote || undefined,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : undefined,
      });
      setResultNote('');
      setNextFollowUpAt('');
      setSuccess('Đã lưu hoạt động chăm sóc.');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Không thể lưu hoạt động chăm sóc');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Log Activity Form */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <span>➕</span> Ghi nhận hoạt động chăm sóc (Sales Activity)
        </h3>

        {error && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-xs">{error}</div>}
        {success && <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 text-green-700 rounded text-xs">{success}</div>}

        <form onSubmit={handleAddActivity} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {['CALL', 'MEETING', 'ZALO', 'EMAIL', 'NOTE', 'FOLLOW_UP', 'QUOTATION', 'TASK'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActivityType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activityType === type
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>{getActivityIcon(type)}</span>
                {getActivityName(type)}
              </button>
            ))}
          </div>

          <textarea
            value={resultNote}
            onChange={(e) => setResultNote(e.target.value)}
            rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            placeholder="Ghi chú kết quả, phản hồi của khách hàng, các bước tiếp theo..."
            required
          />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Lịch hẹn tiếp theo:</label>
              <input
                type="datetime-local"
                value={nextFollowUpAt}
                onChange={(e) => setNextFollowUpAt(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Lưu hoạt động'}
            </button>
          </div>
        </form>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Lịch sử hoạt động ({activities.length})</h3>

        {activities.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">Chưa có hoạt động bán hàng nào được ghi nhận.</div>
        ) : (
          <div className="relative pl-6 border-l-2 border-slate-800 space-y-6">
            {activities.map((act) => (
              <div key={act.id} className="relative group">
                {/* Timeline Icon Node */}
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-full bg-slate-800 border-2 border-indigo-500 flex items-center justify-center text-xs">
                  {getActivityIcon(act.activity_type)}
                </div>

                <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3 text-xs space-y-1 hover:border-slate-700 transition">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-semibold text-slate-200">{act.employee_name} ({getActivityName(act.activity_type)})</span>
                    <span>{formatDateTime(act.occurred_at)}</span>
                  </div>
                  <div className="text-slate-300 font-medium">{act.result_note}</div>
                  {act.next_follow_up_at && (
                    <div className="text-[11px] text-amber-400 flex items-center gap-1 pt-1">
                      <span>⏰ Lịch hẹn tiếp theo:</span> {formatDateTime(act.next_follow_up_at)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

