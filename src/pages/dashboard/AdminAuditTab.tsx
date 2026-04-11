import { useState, useEffect } from 'react';
import { FileText, Search } from 'lucide-react';
import { getAuditLogs } from '../../lib/api';
import type { AuditLog } from '../../data/philippineData';

const actionColor: Record<string, string> = {
  CREATE: 'bg-green-500/15 text-green-400 ring-green-500/20',
  UPDATE: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  DELETE: 'bg-red-500/15 text-red-400 ring-red-500/20',
  LOGIN: 'bg-sand/15 text-sand ring-sand/20',
  APPROVE: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  REJECT: 'bg-orange-500/15 text-orange-400 ring-orange-500/20',
};

export default function AdminAuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      try { setLogs((await getAuditLogs()).items); } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  const filtered = filter
    ? logs.filter((l) =>
        (l.action + ' ' + l.resourceType + ' ' + (l.details ?? '') + ' ' + (l.userName ?? ''))
          .toLowerCase()
          .includes(filter.toLowerCase())
      )
    : logs;

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3,4].map(i => <div key={i} className="rounded-xl bg-white/5 h-14" />)}</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sand/15"><FileText className="w-4 h-4 text-sand" /></div>
          <h2 className="text-white font-semibold">Audit Logs</h2>
          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/10 text-gray-blue">{logs.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/50" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="pl-9 pr-4 py-2 w-full sm:w-64 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-gray-blue/50" />
          </div>
          <p className="text-white font-semibold">{filter ? 'No matching logs' : 'No audit logs recorded yet'}</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-white/[0.06]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-blue text-xs uppercase tracking-wider bg-white/[0.03]">
                  <th className="py-3 px-4 font-medium">Time</th>
                  <th className="py-3 px-4 font-medium">User</th>
                  <th className="py-3 px-4 font-medium">Action</th>
                  <th className="py-3 px-4 font-medium">Resource</th>
                  <th className="py-3 px-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-gray-blue whitespace-nowrap text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-white text-sm">{log.userName ?? <span className="text-gray-blue italic">System</span>}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2.5 py-1 text-[11px] font-medium rounded-lg ring-1 ${actionColor[log.action] ?? 'bg-white/10 text-gray-blue ring-white/10'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-blue text-sm">
                      {log.resourceType}{log.resourceId ? <span className="text-white/50"> #{log.resourceId}</span> : ''}
                    </td>
                    <td className="py-3 px-4 text-gray-blue text-xs max-w-xs truncate">{log.details ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
