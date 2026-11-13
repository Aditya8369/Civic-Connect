import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Flag, FileText, Building2, CheckCircle2, ArrowRight, ChevronRight, Landmark } from 'lucide-react'
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
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)] dark:bg-[linear-gradient(to_right,#1a1a2e_1px,transparent_1px),linear-gradient(to_bottom,#1a1a2e_1px,transparent_1px)]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-32 pb-28 sm:px-6 lg:px-8">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6 }}
              className="text-center max-w-4xl mx-auto"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 text-xs font-medium text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300 mb-8">
                <Landmark className="h-3.5 w-3.5" />
                Municipal Grievance Redressal Platform
              </span>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 dark:text-white leading-[1.1]">
                Report Civic Issues.
                <br />
                <span className="text-primary-600 dark:text-primary-400">Track Resolutions.</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
                A digital platform that connects citizens with municipal authorities to report, track, and resolve civic complaints efficiently and transparently.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/auth">
                  <Button size="lg" className="gap-2 h-12 px-8 text-base shadow-lg shadow-primary-600/20">
                    Get Started <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                    Learn More
                  </Button>
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5 }}
              className="text-center mb-16"
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400">How It Works</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                From Complaint to Resolution
              </h2>
              <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
                A simple three-step process that ensures your civic issues are addressed promptly.
              </p>
            </motion.div>

            <div className="relative">
              <div className="hidden lg:block absolute top-1/2 left-[15%] right-[15%] h-0.5 bg-gray-200 dark:bg-gray-800 -translate-y-1/2" />

              <div className="grid lg:grid-cols-3 gap-8 lg:gap-0 relative">
                {steps.map((step, index) => (
                  <motion.div
                    key={step.title}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-50px' }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, delay: index * 0.15 }}
                    className="relative flex flex-col items-center text-center lg:px-8"
                  >
                    <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${step.color} ring-4 ring-white dark:ring-gray-950 relative z-10`}>
                      <step.icon className="h-7 w-7" />
                    </div>
                    <span className="mt-6 text-sm font-semibold text-primary-600 dark:text-primary-400">{step.number}</span>
                    <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-xs">{step.description}</p>
                    {index < steps.length - 1 && (
                      <ChevronRight className="hidden lg:block absolute top-7 -right-4 h-5 w-5 text-gray-300 dark:text-gray-700" />
                    )}
                    {index < steps.length - 1 && (
                      <ArrowRight className="lg:hidden mt-6 h-5 w-5 text-gray-300 dark:text-gray-700 rotate-90" />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  )
}
