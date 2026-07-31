interface SectionSwitcherProps {
  activeSection: 'knowledge-base' | 'admin-assistant' | 'platform-settings' | 'analytics'
  onSectionChange: (section: 'knowledge-base' | 'admin-assistant' | 'platform-settings' | 'analytics') => void
}

const sections = [
  { id: 'analytics', icon: '📊', label: 'Analytics', sublabel: 'Live metrics', gradient: 'from-emerald-500 to-teal-500', glow: 'shadow-emerald-500/40' },
  { id: 'knowledge-base', icon: '📚', label: 'Knowledge', sublabel: 'AI training', gradient: 'from-blue-500 to-indigo-500', glow: 'shadow-blue-500/40' },
  { id: 'admin-assistant', icon: '🤖', label: 'Assistant', sublabel: 'Voice & Chat', gradient: 'from-purple-500 to-pink-500', glow: 'shadow-purple-500/40' },
  { id: 'platform-settings', icon: '⚙️', label: 'Settings', sublabel: 'Configuration', gradient: 'from-slate-500 to-zinc-600', glow: 'shadow-slate-500/40' },
] as const

export default function SectionSwitcher({ activeSection, onSectionChange }: SectionSwitcherProps) {
  return (
    <div className="px-6 py-6">
      <div className="max-w-7xl mx-auto">
        {/* Navigation Pills */}
        <div className="flex gap-3 p-2 glass-card rounded-2xl">
          {sections.map((section) => {
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id as SectionSwitcherProps['activeSection'])}
                className={`
                  flex-1 relative overflow-hidden rounded-xl p-4 transition-all duration-500 group
                  ${isActive 
                    ? `bg-gradient-to-r ${section.gradient} text-white shadow-xl ${section.glow} scale-[1.02]` 
                    : 'bg-white/80 text-gray-900 hover:bg-white hover:shadow-md'
                  }
                `}
              >
                {/* Shimmer effect on active */}
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" 
                       style={{ animation: 'shimmer 2s infinite' }} />
                )}
                
                <div className="flex items-center gap-3 relative z-10">
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all duration-300
                    ${isActive 
                      ? 'bg-white/20 shadow-inner' 
                      : 'bg-gray-100 group-hover:bg-gray-200'
                    }
                  `}>
                    {section.icon}
                  </div>
                  <div className="text-left">
                    <h2 className={`text-base font-bold ${isActive ? 'text-white' : 'text-gray-900'}`}>
                      {section.label}
                    </h2>
                    <p className={`text-xs mt-0.5 font-medium ${isActive ? 'text-white/80' : 'text-gray-600'}`}>
                      {section.sublabel}
                    </p>
                  </div>
                </div>

                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                    <div className="w-1.5 h-1.5 rounded-full bg-white shadow-lg shadow-white/50"></div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
