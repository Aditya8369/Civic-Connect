
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flag, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import toast from 'react-hot-toast'

export function AuthPage() {
  const { login, register, resetPassword } = useAuth()
  const { t, language, setLanguage } = useLanguage()
  const navigate = useNavigate()

  const [role, setRole] = useState('citizen')
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return

    if (mode === 'reset') {
      if (!email.trim()) {
        toast.error(t('authEnterEmail'))
        return
      }

      setSubmitting(true)

      try {
        await resetPassword(email.trim())
        toast.success(t('authResetEmailSent'))
        setMode('signin')
        setPassword('')
      } catch (err) {
        const msg =
          err.code === 'auth/invalid-email'
            ? t('authInvalidEmail')
            : err.code === 'auth/too-many-requests'
              ? t('authTooManyAttempts')
              : err.code === 'auth/network-request-failed'
                ? t('authNetworkError')
                : t('authResetEmailError')

        toast.error(msg)
      } finally {
        setSubmitting(false)
      }

      return
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        toast.error(t('authEnterName'))
        return
      }

      if (password.length < 6) {
        toast.error(t('authPasswordTooShort'))
        return
      }

      if (password !== confirmPassword) {
        toast.error(t('authPasswordsMismatch'))
        return
      }
    }

    setSubmitting(true)

    try {
      if (mode === 'signin') {
        const user = await login(email, password)

        if (role === 'citizen' && user.role !== 'citizen') {
          toast.error(t('authNotCitizen'))
          setSubmitting(false)
          return
        }

        if (role === 'admin' && user.role !== 'admin') {
          toast.error(t('authNotAdmin'))
          setSubmitting(false)
          return
        }

        navigate(role === 'admin' ? '/admin/dashboard' : '/dashboard')
      } else {
        await register({ name, email, password, role })
        navigate(role === 'admin' ? '/admin/dashboard' : '/dashboard')
      }
    } catch (err) {
      if (err.code === 'auth/session-changed') return

      const msg =
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-credential'
          ? t('authInvalidCredentials')
          : err.code === 'auth/email-already-in-use'
            ? t('authEmailAlreadyExists')
            : err.code === 'auth/weak-password'
              ? t('authPasswordTooShort')
              : t('authSomethingWentWrong')

      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Language Switcher */}
        <div className="flex justify-end mb-4">
          <div
            className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1"
            aria-label={t('language')}
          >
            <button
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                language === 'en'
                  ? 'bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-400'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              EN
            </button>

            <button
              type="button"
              onClick={() => setLanguage('hi')}
              aria-pressed={language === 'hi'}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                language === 'hi'
                  ? 'bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-400'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              हिंदी
            </button>
          </div>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary-600 shadow-lg shadow-primary-600/20 mb-4">
            <Flag className="h-6 w-6 text-white" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            CivicConnect
          </h1>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {role === 'admin'
              ? t('authAdministratorPortal')
              : t('authCitizenPortal')}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 mb-4">
              <button
                type="button"
                onClick={() => {
                  setRole('citizen')
                  setEmail('')
                  setPassword('')
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  role === 'citizen'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('authCitizen')}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRole('admin')
                  setMode('signin')
                  setEmail('')
                  setPassword('')
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  role === 'admin'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('authAdministrator')}
              </button>
            </div>

            <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  mode === 'signin'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('authSignIn')}
              </button>

              {role !== 'admin' && (
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    mode === 'signup'
                      ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {t('authSignUp')}
                </button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t('authName')}</Label>
                  <Input
                    id="name"
                    placeholder={t('authFullNamePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              {mode === 'reset' && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('authResetDescription')}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {mode !== 'reset' && (
                <div className="space-y-2">
                  <Label htmlFor="password">{t('authPassword')}</Label>

                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('authPasswordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? t('authHidePassword')
                          : t('authShowPassword')
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'signin' && role !== 'admin' && (
                <div className="flex justify-end -mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset')
                      setPassword('')
                    }}
                    className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {t('authForgotPassword')}
                  </button>
                </div>
              )}

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">
                    {t('authConfirmPassword')}
                  </Label>

                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={t('authConfirmPasswordPlaceholder')}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      aria-label={
                        showConfirmPassword
                          ? t('authHidePassword')
                          : t('authShowPassword')
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2 h-11"
                disabled={submitting}
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {mode === 'signin'
                  ? t('authSignIn')
                  : mode === 'signup'
                    ? t('authCreateAccount')
                    : t('authSendResetLink')}
              </Button>

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {t('authBackToSignIn')}
                </button>
              )}

              {role === 'admin' && (
                <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">
                  {t('authAdminAccountNotice')}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
