import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#273237] text-white flex flex-col items-center justify-center p-6">
      <div className="text-6xl font-bold text-[#9C213F] mb-2">AUIB</div>
      <div className="text-xl text-gray-400 mb-12">Queue Management System</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
        <Link href="/display"
          className="rounded-2xl bg-[#1a2328]/80 border border-white/10 p-8 text-center hover:border-[#9C213F]/50 transition-all group">
          <div className="text-4xl mb-4">🖥️</div>
          <div className="text-xl font-semibold group-hover:text-[#9C213F] transition-colors">Display</div>
          <div className="text-sm text-gray-500 mt-2">TV/Monitor view</div>
        </Link>

        <Link href="/ticket"
          className="rounded-2xl bg-[#1a2328]/80 border border-white/10 p-8 text-center hover:border-[#9C213F]/50 transition-all group">
          <div className="text-4xl mb-4">🎫</div>
          <div className="text-xl font-semibold group-hover:text-[#9C213F] transition-colors">Take Ticket</div>
          <div className="text-sm text-gray-500 mt-2">Kiosk for visitors</div>
        </Link>

        <Link href="/counter"
          className="rounded-2xl bg-[#1a2328]/80 border border-white/10 p-8 text-center hover:border-[#9C213F]/50 transition-all group">
          <div className="text-4xl mb-4">👨‍💼</div>
          <div className="text-xl font-semibold group-hover:text-[#9C213F] transition-colors">Counter</div>
          <div className="text-sm text-gray-500 mt-2">Employee dashboard</div>
        </Link>
      </div>
    </div>
  );
}
