import { useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Home, Mail, Phone, User, Shield, Sparkles, MessageSquare, Send, X, CheckCircle, AlertCircle } from 'lucide-react';
import type { Agent, Property } from '../data/philippineData';
import { getAgents, getProperties, sendInquiry, resolveAssetUrl } from '../lib/api';
import { isLoggedIn } from '../lib/auth';
import FloatingParticles from '../components/FloatingParticles';

gsap.registerPlugin(ScrollTrigger);

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);
  // Message Agent modal state
  const [msgAgent, setMsgAgent] = useState<Agent | null>(null);
  const [agentProperties, setAgentProperties] = useState<Property[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<number>(0);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgStatus, setMsgStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [propsLoading, setPropsLoading] = useState(false);

  const openMessageModal = async (agent: Agent) => {
    setMsgAgent(agent);
    setMsgText('');
    setMsgStatus(null);
    setSelectedPropId(0);
    setPropsLoading(true);
    try {
      const allProps = await getProperties({ status: 'available' });
      const agentProps = allProps.items.filter((p) => p.ownerName === agent.name);
      setAgentProperties(agentProps);
      if (agentProps.length > 0) setSelectedPropId(agentProps[0].id);
    } catch { /* */ }
    setPropsLoading(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropId || !msgText.trim()) return;
    setMsgSending(true);
    setMsgStatus(null);
    try {
      await sendInquiry(selectedPropId, msgText);
      setMsgStatus({ ok: true, text: 'Message sent successfully!' });
      setMsgText('');
    } catch (err) {
      setMsgStatus({ ok: false, text: err instanceof Error ? err.message : 'Failed to send' });
    }
    setMsgSending(false);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAgents();
        setAgents(data);
      } catch {
        /* empty */
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!agents.length) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.agent-header', { opacity: 0.9, y: -8 }, { opacity: 1, y: 0, duration: 0.36, ease: 'power2.out' });
      gsap.fromTo(
        '.agent-card',
        { opacity: 0.88, y: 18, rotateY: -2 },
        {
          opacity: 1, y: 0, rotateY: 0, duration: 0.45, stagger: 0.07, ease: 'power3.out',
          scrollTrigger: { trigger: gridRef.current, start: 'top 80%' },
        },
      );
    }, gridRef);
    return () => ctx.revert();
  }, [agents]);

  return (
    <div className="min-h-screen bg-navy pt-24 pb-16 px-6 lg:px-[4vw] relative overflow-hidden">
      {/* Background particles */}
      <FloatingParticles count={12} className="fixed inset-0 pointer-events-none overflow-hidden z-0" />

      {/* Decorative gradient orbs */}
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-sand/[0.03] blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-blue-500/[0.02] blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        {/* Header */}
        <div className="agent-header text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sand/10 text-sand text-xs font-semibold uppercase tracking-wider mb-4 border border-sand/20">
            <Shield className="w-3.5 h-3.5" /> PRC-Licensed Professionals
          </div>
          <h1 className="text-4xl lg:text-5xl font-display font-bold text-white mb-4">
            Meet Our Agents
          </h1>
          <p className="text-gray-blue max-w-2xl mx-auto text-lg">
            Our professional agents are ready to help you find the perfect property in the Philippines.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-sand/20 to-sand/5 rounded-2xl flex items-center justify-center border border-white/10 animate-float-slow">
              <User className="w-8 h-8 text-sand" />
            </div>
            <p className="text-gray-blue">Loading agents...</p>
          </div>
        ) : agents.length === 0 ? (
          <p className="text-center text-gray-blue">No agents found.</p>
        ) : (
          <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-7">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="agent-card card-3d card-glow bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.06] group"
              >
                {/* Avatar */}
                <div className="aspect-square overflow-hidden relative img-reveal">
                  {agent.avatar ? (
                    <img src={resolveAssetUrl(agent.avatar)} alt={agent.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sand/20 to-sand/5 flex items-center justify-center">
                      <span className="text-6xl font-display font-bold text-sand/30">{agent.name.charAt(0)}</span>
                    </div>
                  )}
                  {/* Hover overlay */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isLoggedIn()) {
                        openMessageModal(agent);
                      } else {
                        const card = document.getElementById(`agent-info-${agent.id}`);
                        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end justify-center pb-6 cursor-pointer"
                    aria-label={`View profile of ${agent.name}`}
                  >
                    <span className="text-sand text-sm font-semibold flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full hover:bg-black/50 transition-colors">
                      <Sparkles className="w-3.5 h-3.5" /> View Profile
                    </span>
                  </button>
                </div>
                {/* Info */}
                <div id={`agent-info-${agent.id}`} className="p-5 space-y-3">
                  <h3 className="text-white font-semibold text-lg group-hover:text-sand transition-colors">{agent.name}</h3>
                  {agent.bio && (
                    <p className="text-gray-blue text-sm line-clamp-2">{agent.bio}</p>
                  )}
                  <div className="space-y-2 text-sm text-gray-blue pt-2">
                    <p className="flex items-center gap-2.5 bg-white/[0.03] px-3 py-2 rounded-lg">
                      <Mail className="w-3.5 h-3.5 text-sand/60 shrink-0" /> <span className="truncate">{agent.email}</span>
                    </p>
                    <p className="flex items-center gap-2.5 bg-white/[0.03] px-3 py-2 rounded-lg">
                      <Phone className="w-3.5 h-3.5 text-sand/60 shrink-0" /> {agent.phone}
                    </p>
                    <p className="flex items-center gap-2.5 bg-white/[0.03] px-3 py-2 rounded-lg">
                      <Home className="w-3.5 h-3.5 text-sand/60 shrink-0" /> {agent.listingsCount} listing{agent.listingsCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isLoggedIn() && (
                    <button
                      onClick={() => openMessageModal(agent)}
                      className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sand/20 to-sand/10 text-sand rounded-xl border border-sand/20 hover:from-sand/30 hover:to-sand/20 transition-all duration-300 text-sm font-semibold"
                    >
                      <MessageSquare className="w-4 h-4" /> Message Agent
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Agent Modal */}
      {msgAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !msgSending && setMsgAgent(null)}>
          <div
            className="bg-[#0d2d4a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sand/30 to-sand/10 flex items-center justify-center text-sand font-bold text-sm border border-sand/20">
                  {msgAgent.avatar ? (
                    <img src={resolveAssetUrl(msgAgent.avatar)} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    msgAgent.name.charAt(0)
                  )}
                </div>
                <div>
                  <h3 className="text-white font-semibold">{msgAgent.name}</h3>
                  <p className="text-gray-blue text-xs">{msgAgent.email}</p>
                </div>
              </div>
              <button onClick={() => !msgSending && setMsgAgent(null)} className="text-gray-blue hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSendMessage} className="p-5 space-y-4">
              {/* Property select */}
              <div>
                <label className="block text-sm text-gray-blue mb-1.5">Regarding Property</label>
                {propsLoading ? (
                  <div className="text-gray-blue text-sm py-2">Loading listings...</div>
                ) : agentProperties.length === 0 ? (
                  <div className="text-gray-blue text-sm py-2 bg-white/5 rounded-lg px-3">This agent has no active listings right now.</div>
                ) : (
                  <select
                    value={selectedPropId}
                    onChange={(e) => setSelectedPropId(Number(e.target.value))}
                    className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-sand/40 focus:outline-none transition-colors"
                  >
                    {agentProperties.map((p) => (
                      <option key={p.id} value={p.id} className="bg-navy text-white">
                        {p.title} — ₱{p.price.toLocaleString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm text-gray-blue mb-1.5">Your Message</label>
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  rows={4}
                  placeholder="Hi, I'm interested in this property..."
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-gray-blue/50 focus:border-sand/40 focus:outline-none resize-none transition-colors"
                  disabled={msgSending || agentProperties.length === 0}
                />
              </div>

              {/* Status */}
              {msgStatus && (
                <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${msgStatus.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {msgStatus.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {msgStatus.text}
                </div>
              )}

              {/* Send */}
              <button
                type="submit"
                disabled={msgSending || !selectedPropId || !msgText.trim() || agentProperties.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-sand to-sand/80 text-navy font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-sand/20 transition-all duration-300"
              >
                <Send className="w-4 h-4" />
                {msgSending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
