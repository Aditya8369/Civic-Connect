
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, Search, ChevronDown, Mail } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { faqs, SUPPORT_EMAIL } from '@/data/faqs'
import { useLanguage } from '@/contexts/LanguageContext'

export function HelpPage() {
  const { t } = useLanguage()

  const [activeTab, setActiveTab] = useState('faqs')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)

  const term = search.trim().toLowerCase()

  const filteredFaqs = faqs.filter((faq) => {
  const question = t(faq.questionKey).toLowerCase()
  const answer = t(faq.answerKey).toLowerCase()

  return question.includes(term) || answer.includes(term)
})

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
          {t('helpSupport')}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          {t('helpPageDescription')}
        </p>
      </div>

      <div
        role="tablist"
        aria-label={t('helpSupportTabs')}
        className="mb-6 inline-flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'faqs'}
          onClick={() => setActiveTab('faqs')}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'faqs'
              ? 'bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          {t('faqs')}
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'contact'}
          onClick={() => setActiveTab('contact')}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'contact'
              ? 'bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          {t('contact')}
        </button>
      </div>

      {activeTab === 'faqs' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary-600" />
              {t('frequentlyAskedQuestions')}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchQuestions')}
                aria-label={t('searchQuestions')}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-primary-500 dark:border-gray-700 dark:text-gray-100"
              />
            </div>

            {filteredFaqs.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('noMatchingQuestions')}
              </p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredFaqs.map((faq) => {
                  const isOpen = openId === faq.id

                  return (
                    <div key={faq.id}>
                      <button
                        onClick={() => setOpenId(isOpen ? null : faq.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-4 py-4 text-left"
                      >
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {t(faq.questionKey)}
                        </span>

                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <p className="pb-4 text-sm text-gray-500 dark:text-gray-400">
                              {t(faq.answerKey)}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'contact' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary-600" />
              {t('getInTouch')}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('generalEnquiries')}
            </p>

            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-2 inline-block text-lg font-semibold text-primary-600 hover:underline dark:text-primary-400"
            >
              {SUPPORT_EMAIL}
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
