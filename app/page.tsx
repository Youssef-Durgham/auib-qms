import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#9C213F]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#D4A843]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center mb-16 animate-slide-up">
        <div className="text-7xl font-black tracking-tight mb-1">
          <span className="text-[#9C213F]">AUIB</span>
        </div>
        <div className="text-lg text-gray-400 font-light tracking-widest uppercase">
          Queue Management System
        </div>
        <div className="mt-3 w-24 h-0.5 bg-gradient-to-r from-transparent via-[#D4A843] to-transparent mx-auto" />
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 w-full max-w-5xl">
        {[
          { href: '/display', icon: '🖥️', title: 'Display', desc: 'TV/Monitor view', delay: '0s' },
          { href: '/ticket', icon: '🎫', title: 'Take Ticket', desc: 'Visitor kiosk', delay: '0.1s' },
          { href: '/counter', icon: '👨‍💼', title: 'Counter', desc: 'Employee panel', delay: '0.2s' },
          { href: '/admin', icon: '⚙️', title: 'Admin', desc: 'Management', delay: '0.3s' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="glass-card p-8 text-center hover:border-[#9C213F]/40 transition-all duration-300 group hover:-translate-y-1 hover:shadow-xl hover:shadow-[#9C213F]/10 animate-slide-up"
            style={{ animationDelay: item.delay }}
          >
            <div className="text-5xl mb-5 group-hover:scale-110 transition-transform duration-300">{item.icon}</div>
            <div className="text-xl font-semibold group-hover:text-[#9C213F] transition-colors duration-300">{item.title}</div>
            <div className="text-sm text-gray-500 mt-2">{item.desc}</div>
          </Link>
        ))}
      </div>

      <div className="relative z-10 mt-16 text-center text-gray-600 text-sm animate-fade-in" style={{ animationDelay: '0.5s' }}>
        American University in Iraq, Baghdad
      </div>
    </div>
  );
}
