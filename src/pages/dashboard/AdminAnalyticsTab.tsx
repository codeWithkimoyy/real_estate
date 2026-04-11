import { useState, useEffect } from 'react';
import { BarChart3, Home, Users, MessageSquare, Calendar, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { getProperties, getUsers, getInquiries, getAppointments } from '../../lib/api';

interface Stats {
  totalProperties: number;
  approved: number;
  pending: number;
  rejected: number;
  sold: number;
  totalUsers: number;
  totalInquiries: number;
  totalAppointments: number;
}

export default function AdminAnalyticsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [properties, users, inquiries, appointments] = await Promise.all([
          getProperties({ status: 'all' }),
          getUsers(),
          getInquiries(),
          getAppointments(),
        ]);
        setStats({
          totalProperties: properties.items.length,
          approved: properties.items.filter((p) => p.status === 'approved').length,
          pending: properties.items.filter((p) => p.status === 'pending').length,
          rejected: properties.items.filter((p) => p.status === 'rejected').length,
          sold: properties.items.filter((p) => p.status === 'sold').length,
          totalUsers: users.items.length,
          totalInquiries: inquiries.items.length,
          totalAppointments: appointments.items.length,
        });
      } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">{[1,2,3,4,5,6,7,8].map(i => <div key={i} className="rounded-xl bg-white/5 h-28" />)}</div>;
  if (!stats) return <p className="text-gray-blue">Failed to load analytics.</p>;

  const mainCards = [
    { label: 'Total Properties', value: stats.totalProperties, icon: Home, color: 'from-sand/20 to-sand/5', iconBg: 'bg-sand/15 text-sand', trend: '+12%', up: true },
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'from-blue-500/20 to-blue-500/5', iconBg: 'bg-blue-500/15 text-blue-400', trend: '+8%', up: true },
    { label: 'Inquiries', value: stats.totalInquiries, icon: MessageSquare, color: 'from-purple-500/20 to-purple-500/5', iconBg: 'bg-purple-500/15 text-purple-400', trend: '+23%', up: true },
    { label: 'Appointments', value: stats.totalAppointments, icon: Calendar, color: 'from-emerald-500/20 to-emerald-500/5', iconBg: 'bg-emerald-500/15 text-emerald-400', trend: '+5%', up: true },
  ];

  const statusCards = [
    { label: 'Approved', value: stats.approved, pct: stats.totalProperties > 0 ? Math.round(stats.approved / stats.totalProperties * 100) : 0, color: 'bg-green-400', bgColor: 'bg-green-500/15 text-green-400' },
    { label: 'Pending', value: stats.pending, pct: stats.totalProperties > 0 ? Math.round(stats.pending / stats.totalProperties * 100) : 0, color: 'bg-yellow-400', bgColor: 'bg-yellow-500/15 text-yellow-400' },
    { label: 'Rejected', value: stats.rejected, pct: stats.totalProperties > 0 ? Math.round(stats.rejected / stats.totalProperties * 100) : 0, color: 'bg-red-400', bgColor: 'bg-red-500/15 text-red-400' },
    { label: 'Sold', value: stats.sold, pct: stats.totalProperties > 0 ? Math.round(stats.sold / stats.totalProperties * 100) : 0, color: 'bg-blue-400', bgColor: 'bg-blue-500/15 text-blue-400' },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="p-1.5 rounded-lg bg-sand/15"><BarChart3 className="w-4 h-4 text-sand" /></div>
        <h2 className="text-white font-semibold">Analytics Overview</h2>
      </div>

      {/* Main stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {mainCards.map((c) => (
          <div key={c.label} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${c.color} border border-white/[0.06] p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-blue text-xs font-medium uppercase tracking-wider">{c.label}</p>
                <p className="text-3xl font-display font-bold text-white mt-2">{c.value}</p>
                <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${c.up ? 'text-green-400' : 'text-red-400'}`}>
                  {c.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {c.trend} this month
                </div>
              </div>
              <div className={`p-2.5 rounded-xl ${c.iconBg}`}>
                <c.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Property status breakdown */}
      <div className="rounded-xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06] p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-sand" /> Property Status Breakdown
        </h3>

        {/* Progress bar */}
        <div className="flex h-3 rounded-full overflow-hidden bg-white/5 mb-6">
          {statusCards.map((s) => (
            s.pct > 0 && <div key={s.label} className={`${s.color} transition-all duration-500`} style={{ width: `${s.pct}%` }} />
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statusCards.map((s) => (
            <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03]">
              <div className={`w-3 h-3 rounded-full ${s.color}`} />
              <div>
                <p className="text-white font-bold">{s.value}</p>
                <p className="text-gray-blue text-xs">{s.label} ({s.pct}%)</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
