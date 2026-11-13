import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { SpotlightProvider } from '@/contexts/SpotlightContext'
import { AppRoutes } from '@/routes/AppRoutes'
import { Toaster } from 'react-hot-toast'
import KeyboardShortcutsModal from '@/components/common/KeyboardShortcutsModal'


import OfflineBanner from '@/components/common/OfflineBanner'
import OfflineSyncManager from '@/components/common/OfflineSyncManager'


function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SpotlightProvider>
              <OfflineBanner />
              <OfflineSyncManager />
              <KeyboardShortcutsModal />

              <AppRoutes />

              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    borderRadius: '12px',
                    padding: '12px 16px',
                    fontSize: '14px',
                  },
                }}
              />
            </SpotlightProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </MotionConfig>
  )
}

export default App