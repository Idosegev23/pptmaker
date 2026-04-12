import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[#0a0a0f] text-white font-heebo overflow-hidden">
      {/* ── Hero Section ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 relative">
        {/* Ambient background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Grid */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
              backgroundSize: '80px 80px',
            }}
          />
          {/* Aurora glow */}
          <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-[#e94560] opacity-[0.06] blur-[160px]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#6366f1] opacity-[0.04] blur-[140px]" />
          {/* Accent lines */}
          <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#e94560]/10 to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 text-center max-w-5xl mx-auto">
          {/* Logo */}
          <div className="mb-6">
            <Image src="/logo.png" alt="Leaders" width={140} height={47} className="mx-auto opacity-90" />
          </div>

          {/* Brand */}
          <div className="mb-10">
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none">
              Leaders <span className="bg-gradient-to-l from-[#e94560] to-[#ff6b6b] bg-clip-text text-transparent">AI</span>
            </h1>
            <div className="h-0.5 w-20 bg-gradient-to-r from-[#e94560] to-transparent mx-auto mt-5" />
          </div>

          {/* Tagline */}
          <p className="text-lg md:text-2xl text-white/50 mb-4 leading-relaxed max-w-2xl mx-auto font-light">
            הצעות מחיר ומצגות קריאטיב
          </p>
          <p className="text-xl md:text-3xl text-white/90 mb-14 font-bold max-w-2xl mx-auto">
            מבריף ל-11 שקפים מעוצבים, באוטומט
          </p>

          {/* Value props — 4 pillars */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-14 max-w-3xl mx-auto">
            {[
              { icon: '🔍', label: 'מחקר מותג אוטומטי', sub: 'Google + סריקת אתר' },
              { icon: '🤖', label: 'משפיענים אמיתיים', sub: 'IMAI API — לא בדוי' },
              { icon: '🎨', label: '11 שקפים פרימיום', sub: '5 שכבות ויזואליות' },
              { icon: '📄', label: 'PDF שכבתי', sub: 'טקסט ניתן לעריכה' },
            ].map((item, i) => (
              <div key={i} className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="text-sm font-semibold text-white/80">{item.label}</div>
                <div className="text-xs text-white/30 mt-1">{item.sub}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login">
              <button className="min-w-[200px] px-8 py-4 rounded-lg bg-gradient-to-l from-[#e94560] to-[#d63051] text-white font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-[#e94560]/20">
                התחל עכשיו
              </button>
            </Link>
            <Link href="/login">
              <button className="min-w-[200px] px-8 py-4 rounded-lg border border-white/15 text-white/70 font-medium text-lg hover:bg-white/5 hover:text-white transition-all">
                התחבר
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── How it Works ── */}
      <section className="py-24 px-4 bg-[#08080d] relative">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            איך זה עובד?
          </h2>
          <p className="text-center text-white/40 mb-16 text-lg">סוכן AI אחד — מהבריף ועד המצגת</p>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'העלאת בריף', desc: 'PDF, DOCX או תמונה — הסוכן קורא ומבין', accent: '#e94560' },
              { step: '02', title: 'מחקר + משפיענים', desc: 'חוקר את המותג באינטרנט, מוצא משפיענים אמיתיים ב-IMAI', accent: '#f59e0b' },
              { step: '03', title: 'עריכה בוויזרד', desc: '9 שלבים — תובנה, אסטרטגיה, קריאייטיב. אתה מחליט.', accent: '#6366f1' },
              { step: '04', title: 'מצגת מוכנה', desc: '11 שקפים עם עיצוב פרימיום, PDF שכבתי, שיתוף', accent: '#10b981' },
            ].map((item, i) => (
              <div
                key={i}
                className="relative p-6 rounded-xl border border-white/[0.06] bg-white/[0.015] group hover:border-white/[0.15] transition-all duration-300"
              >
                <div className="text-4xl font-black mb-4" style={{ color: `${item.accent}30` }}>{item.step}</div>
                <h3 className="text-lg font-bold mb-2 text-white/90">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
                {/* Connector line */}
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -left-3 w-6 h-px bg-white/10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-4 border-t border-white/[0.05] bg-[#08080d]">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Leaders" width={80} height={27} className="opacity-30" />
          <p className="text-xs text-white/20">Leaders AI — Influencer Marketing Platform</p>
        </div>
      </footer>
    </div>
  )
}
