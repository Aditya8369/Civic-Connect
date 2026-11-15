import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Flag, FileText, Building2, CheckCircle2, ArrowRight,
  ChevronRight, Landmark, MapPin, HeartHandshake,
  Activity, ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { Footer } from '@/components/layout/Footer'

const steps = [
  {
    number: '01',
    icon: FileText,
    title: 'Report Complaint',
    description: 'Citizen submits a civic complaint through the portal with details and location.',
    color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30',
  },
  {
    number: '02',
    icon: Building2,
    title: 'Authority Reviews',
    description: 'Municipal department reviews and assigns the complaint to the concerned team.',
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
  },
  {
    number: '03',
    icon: CheckCircle2,
    title: 'Track Resolution',
    description: 'Citizen tracks complaint status in real-time until it is resolved.',
    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',
  },
]

export function HomePage() {
  const { user } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <header className="sticky top-0 z-50 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/90 backdrop-blur-xl dark:bg-gray-950/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 shadow-sm">
              <Flag className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">CivicConnect</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
              How It Works
            </a>
          </nav>
          <div className="flex items-center gap-4">
            {user ? (
              <Link
                to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'}
              >
                <Button size="sm" variant="outline">Go to Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link to="/auth">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
       <section className="relative overflow-hidden bg-[#f6f3eb] dark:bg-[#151d19]">
  <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-[#d9e3d4]/60 blur-3xl dark:bg-emerald-900/20" />
  <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-[#ead7c5]/50 blur-3xl dark:bg-amber-900/10" />

  <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
    <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">

      {/* Editorial copy */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6 }}
      >
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#c9d5c5] bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#315b43] dark:border-emerald-900 dark:bg-gray-900/60 dark:text-emerald-300">
          <Landmark className="h-4 w-4" />
          Your city. Your voice.
        </div>

        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#a65d3d]">
          A community that moves forward
        </p>

        <h1 className="max-w-2xl text-5xl font-black leading-[1.04] tracking-tight text-[#1c3026] sm:text-6xl lg:text-7xl dark:text-white">
          Better streets
          <br />
          begin with
          <br />
          <span className="font-serif italic font-medium text-[#b76543]">
            being heard.
          </span>
        </h1>

        <p className="mt-7 max-w-xl text-base leading-8 text-[#59675d] sm:text-lg dark:text-gray-300">
          A pothole, a broken streetlight, an overflowing drain — every
          civic issue deserves attention. Raise your voice and follow
          your complaint from report to resolution.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link to={user ? '/report' : '/auth'}>
            <Button
              size="lg"
              className="h-14 w-full gap-3 rounded-xl bg-[#244b36] px-7 text-base font-semibold text-white shadow-lg shadow-green-950/15 hover:bg-[#183b29] sm:w-auto"
            >
              <Flag className="h-5 w-5" />
              Report a Problem in Your Street
              <ArrowUpRight className="h-5 w-5" />
            </Button>
          </Link>

          <Link to={user ? '/my-reports' : '/auth'}>
            <Button
              size="lg"
              variant="outline"
              className="h-14 w-full gap-2 rounded-xl border-[#aab9aa] bg-white/70 px-6 text-base text-[#244b36] hover:bg-white dark:border-gray-600 dark:bg-gray-900 dark:text-white sm:w-auto"
            >
              Track Existing Grievance
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap gap-6 border-t border-[#d9ded5] pt-6 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-medium text-[#526456] dark:text-gray-300">
            <HeartHandshake className="h-5 w-5 text-[#b76543]" />
            Citizen powered
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-[#526456] dark:text-gray-300">
            <Activity className="h-5 w-5 text-[#b76543]" />
            Transparent tracking
          </div>
        </div>
      </motion.div>

      {/* Editorial civic impact panel */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.7, delay: 0.15 }}
        className="relative"
      >
        <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-[#294b38] p-7 text-white shadow-2xl shadow-green-950/20 sm:p-10">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute -right-5 -top-5 h-44 w-44 rounded-full border border-white/10" />
          <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#b76543]/30 blur-3xl" />

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#d8e4d6]">
              The community journal
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#a8d5a0]" />
              Civic activity
            </span>
          </div>

          <div className="relative z-10 mt-14">
            <p className="text-sm font-medium text-[#d6dfd2]">
              CHANGE STARTS CLOSE TO HOME
            </p>
            <h2 className="mt-4 max-w-sm font-serif text-4xl leading-tight sm:text-5xl">
              Small actions.
              <br />
              <span className="italic text-[#e8b18d]">Stronger</span> neighbourhoods.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#d6dfd2]">
              Every report creates a record. Every update brings citizens
              closer to the answers they deserve.
            </p>
          </div>

          <div className="relative z-10 mt-12 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
              <MapPin className="mb-4 h-6 w-6 text-[#e8b18d]" />
              <p className="text-2xl font-bold">Live</p>
              <p className="mt-1 text-xs text-[#d6dfd2]">
                Complaint tracking
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
              <CheckCircle2 className="mb-4 h-6 w-6 text-[#a8d5a0]" />
              <p className="text-2xl font-bold">Verified</p>
              <p className="mt-1 text-xs text-[#d6dfd2]">
                Resolution updates
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-5 flex items-center gap-3 rounded-xl bg-[#f1e9dc] p-4 text-[#294b38]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d9c6ae]">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold">Your voice matters here.</p>
              <p className="text-xs text-[#647267]">
                Be part of your city's progress.
              </p>
            </div>
          </div>
        </div>

        <div className="absolute -bottom-5 -left-3 rounded-xl border border-[#e5d7c6] bg-white px-5 py-3 shadow-lg sm:-left-7 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#a65d3d]">
            Community first
          </p>
          <p className="mt-1 text-sm font-bold text-[#294b38] dark:text-white">
            One report can make a difference.
          </p>
        </div>
      </motion.div>
    </div>

    {/* Civic transparency ticker */}
    <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-[#d9ded5] bg-[#d9ded5] sm:grid-cols-3 dark:border-gray-700 dark:bg-gray-700">
      <div className="bg-[#fffdf8] p-6 dark:bg-gray-900">
        <p className="text-xs font-bold uppercase tracking-widest text-[#8b725e]">
          Issues resolved this week
        </p>
        <p className="mt-3 text-3xl font-black text-[#294b38] dark:text-white">
          —
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Awaiting verified public statistics
        </p>
      </div>

      <div className="bg-[#fffdf8] p-6 dark:bg-gray-900">
        <p className="text-xs font-bold uppercase tracking-widest text-[#8b725e]">
          Average response time
        </p>
        <p className="mt-3 text-3xl font-black text-[#294b38] dark:text-white">
          —
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Based on verified resolution data
        </p>
      </div>

      <div className="bg-[#fffdf8] p-6 dark:bg-gray-900">
        <p className="text-xs font-bold uppercase tracking-widest text-[#8b725e]">
          Community impact
        </p>
        <p className="mt-3 text-3xl font-black text-[#294b38] dark:text-white">
          Together
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Every citizen contribution counts
        </p>
      </div>
    </div>
  </div>
</section>
<section
  id="how-it-works"
  className="bg-white px-4 py-20 dark:bg-gray-950 sm:px-6 lg:px-8"
>
  <div className="mx-auto max-w-7xl">
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#a65d3d]">
        Simple and transparent
      </p>

      <h2 className="mt-4 text-3xl font-black tracking-tight text-gray-900 dark:text-white sm:text-4xl">
        How It Works
      </h2>

      <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">
        From reporting a civic issue to tracking its resolution,
        every step keeps you informed.
      </p>
    </div>

    <div className="mt-14 grid gap-8 md:grid-cols-3">
      {steps.map((step) => {
        const Icon = step.icon

        return (
          <div
            key={step.number}
            className="relative rounded-2xl border border-gray-200 p-7 dark:border-gray-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-black tracking-widest text-[#b76543]">
                {step.number}
              </span>

              <div className={`rounded-xl p-3 ${step.color}`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>

            <h3 className="mt-6 text-xl font-bold text-gray-900 dark:text-white">
              {step.title}
            </h3>

            <p className="mt-3 leading-7 text-gray-600 dark:text-gray-400">
              {step.description}
            </p>
          </div>
        )
      })}
    </div>
  </div>
</section>
      </main>

      <Footer />
    </div>
  )
}
