import { Settings, Database, Server, Shield, CheckCircle2, Globe, Key, Lock } from 'lucide-react';

export default function AdminSystemTab() {
  const infoSections = [
    {
      title: 'Application',
      icon: Server,
      color: 'from-blue-500/20 to-blue-500/5',
      iconBg: 'bg-blue-500/15 text-blue-400',
      items: [
        { label: 'Platform', value: 'Brader Real Estate v1.0' },
        { label: 'Frontend', value: 'React 19 + TypeScript + Vite' },
        { label: 'Backend', value: 'PHP REST API' },
        { label: 'Styling', value: 'Tailwind CSS' },
      ],
    },
    {
      title: 'Database',
      icon: Database,
      color: 'from-emerald-500/20 to-emerald-500/5',
      iconBg: 'bg-emerald-500/15 text-emerald-400',
      items: [
        { label: 'Engine', value: 'MySQL 8.4 (InnoDB)' },
        { label: 'Database', value: 'real_estate_db' },
        { label: 'Tables', value: '9' },
        { label: 'Charset', value: 'utf8mb4_unicode_ci' },
      ],
    },
  ];

  const securityItems = [
    { icon: Key, text: 'Passwords hashed with bcrypt (cost 10)' },
    { icon: Lock, text: 'Session tokens with 7-day expiry' },
    { icon: Shield, text: 'Role-based access control (Admin, Agent, Seller, Buyer)' },
    { icon: CheckCircle2, text: 'Property lifecycle workflow (draft → pending approval → available → reserved → under offer → sold)' },
    { icon: Server, text: 'Audit logging for critical actions' },
    { icon: Globe, text: 'CORS headers on all API endpoints' },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="p-1.5 rounded-lg bg-sand/15"><Settings className="w-4 h-4 text-sand" /></div>
        <h2 className="text-white font-semibold">System Information</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {infoSections.map((section) => (
          <div key={section.title} className={`rounded-xl bg-gradient-to-br ${section.color} border border-white/[0.06] p-6`}>
            <div className="flex items-center gap-3 mb-5">
              <div className={`p-2 rounded-lg ${section.iconBg}`}>
                <section.icon className="w-4 h-4" />
              </div>
              <h3 className="text-white font-semibold">{section.title}</h3>
            </div>
            <dl className="space-y-3">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                  <dt className="text-gray-blue text-sm">{item.label}</dt>
                  <dd className="text-white text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-500/[0.02] border border-white/[0.06] p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
            <Shield className="w-4 h-4" />
          </div>
          <h3 className="text-white font-semibold">Security Features</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {securityItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03]">
              <div className="p-1.5 rounded-md bg-green-500/10">
                <item.icon className="w-3.5 h-3.5 text-green-400" />
              </div>
              <p className="text-gray-blue text-sm">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
