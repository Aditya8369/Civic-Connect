import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Send,
  X,
  ShieldCheck,
  Lock,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  sendResolutionMessage,
  subscribeToResolutionChat,
  markResolutionMessagesAsRead,
  QUICK_ACTION_PROMPTS,
} from '@/firebase/resolutionChat'
import { sanitizeText } from '@/utils/sanitize'
import toast from 'react-hot-toast'

export function ResolutionChatDrawer({
  isOpen,
  onClose,
  complaint,
  currentUser,
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const complaintId = complaint?.complaintId || complaint?.id || ''
  const isOfficerOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'officer' ||
    currentUser?.role === 'municipal_admin'
  const currentRole = isOfficerOrAdmin ? 'officer' : 'citizen'

  const quickPrompts = isOfficerOrAdmin
    ? QUICK_ACTION_PROMPTS.officer
    : QUICK_ACTION_PROMPTS.citizen

  // Subscribe to real-time messages
  useEffect(() => {
    if (!isOpen || !complaintId) return

    setLoading(true)
    const unsubscribe = subscribeToResolutionChat(
      complaintId,
      (fetchedMessages) => {
        setMessages(fetchedMessages)
        setLoading(false)

        // Mark unread messages as read
        if (currentUser?.uid) {
          const unreadIds = fetchedMessages
            .filter((m) => m.senderId !== currentUser.uid && !m.readBy?.includes(currentUser.uid))
            .map((m) => m.id)

          if (unreadIds.length > 0) {
            void markResolutionMessagesAsRead(complaintId, unreadIds, currentUser.uid)
          }
        }
      },
      (error) => {
        console.error('Chat subscription error:', error)
        setLoading(false)
      }
    )

    return () => {
      unsubscribe()
    }
  }, [isOpen, complaintId, currentUser?.uid])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  const handleSendMessage = async (textToSend = inputText, quickType = null) => {
    const trimmed = (textToSend || '').trim()
    if (!trimmed || sending) return

    if (!currentUser?.uid) {
      toast.error('You must be logged in to send messages.')
      return
    }

    setSending(true)
    try {
      const recipientUid =
        currentRole === 'citizen'
          ? complaint?.assignedOfficerId || null
          : complaint?.reportedBy || null

      await sendResolutionMessage({
        issueId: complaintId,
        senderId: currentUser.uid,
        senderRole: currentRole,
        senderName: currentUser.displayName || (currentRole === 'officer' ? 'Municipal Officer' : 'Citizen'),
        content: trimmed,
        quickActionType: quickType,
        recipientUid,
        recipientRole: currentRole === 'citizen' ? 'admin' : 'citizen',
      })

      setInputText('')
      if (inputRef.current) inputRef.current.focus()
    } catch (err) {
      console.error('Failed to send resolution message:', err)
      toast.error('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolution Chat Channel"
      data-testid="resolution-chat-drawer"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
    >
      {/* Backdrop */}
      <div
        data-testid="chat-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        aria-hidden="true"
      />

      {/* Drawer slide-over */}
      <aside className="relative w-full max-w-md sm:max-w-lg bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full border-l border-gray-200 dark:border-gray-800 z-10 transition-transform duration-300">
        {/* Drawer Header */}
        <header className="px-4 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white shadow-xs">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  Resolution Channel
                </h2>
                <Badge variant="outline" className="text-[10px] shrink-0 font-semibold border-primary-300 text-primary-700 dark:text-primary-300">
                  #{complaintId}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                <Lock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">Encrypted | Contact details protected</span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close resolution chat"
            className="h-8 w-8 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Complaint context sub-bar */}
        {complaint?.title && (
          <div className="px-4 py-2 bg-primary-50/50 dark:bg-primary-950/20 border-b border-primary-100 dark:border-primary-900/40 text-xs text-primary-800 dark:text-primary-200 flex items-center justify-between gap-2 shrink-0">
            <span className="truncate font-medium">{complaint.title}</span>
            {complaint.department && (
              <span className="shrink-0 text-[11px] font-semibold text-primary-600 dark:text-primary-400">
                {complaint.department}
              </span>
            )}
          </div>
        )}

        {/* Message Thread Area */}
        <div
          data-testid="chat-message-list"
          className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gray-50/40 dark:bg-gray-950/40"
        >
          {loading ? (
            <div
              data-testid="chat-loading-spinner"
              className="flex flex-col items-center justify-center h-full gap-2 text-gray-400"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
              <span className="text-xs">Connecting to secure resolution channel...</span>
            </div>
          ) : messages.length === 0 ? (
            <div
              data-testid="chat-empty-state"
              className="flex flex-col items-center justify-center h-full text-center px-4 py-8"
            >
              <div className="h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-3">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Direct Resolution Channel
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mt-1">
                Real-time channel between citizen and department personnel. Use the quick actions below to send immediate status updates.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser?.uid
              const isOfficer = msg.senderRole === 'officer' || msg.senderRole === 'admin'
              const formattedTime = msg.createdAt?.toDate
                ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Just now'

              return (
                <div
                  key={msg.id}
                  data-testid="chat-message-item"
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  {/* Sender identity & role badge */}
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {isMe ? 'You' : msg.senderName || (isOfficer ? 'Municipal Officer' : 'Citizen')}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                        isOfficer
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                      }`}
                    >
                      {isOfficer ? 'Officer' : 'Citizen'}
                    </span>
                    <span>{formattedTime}</span>
                  </div>

                  {/* Message bubble */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs break-words ${
                      isMe
                        ? 'bg-primary-600 text-white rounded-br-xs'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-xs'
                    }`}
                  >
                    {msg.quickActionType && (
                      <div
                        data-testid="quick-action-badge"
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold mb-1 px-1.5 py-0.5 rounded ${
                          isMe
                            ? 'bg-white/20 text-white'
                            : 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                        }`}
                      >
                        <Sparkles className="h-3 w-3" />
                        Quick Action
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.decryptedContent || msg.content?.ciphertext || '[Message]'}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick-Action Prompts Toolbar */}
        <div
          data-testid="quick-prompts-bar"
          className="px-3.5 py-2 border-t border-gray-200/80 dark:border-gray-800/80 bg-white dark:bg-gray-900 shrink-0"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary-500" />
            <span>Quick Action Prompts</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                data-testid={`quick-prompt-${prompt.id}`}
                onClick={() => handleSendMessage(prompt.text, prompt.id)}
                disabled={sending}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 hover:bg-primary-50 dark:bg-gray-800 dark:hover:bg-primary-950/40 text-gray-700 hover:text-primary-700 dark:text-gray-300 dark:hover:text-primary-300 transition-colors shrink-0 disabled:opacity-50"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message Input Footer */}
        <footer className="p-3.5 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMessage()
            }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                data-testid="chat-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type resolution message..."
                maxLength={500}
                disabled={sending}
                className="flex-1 min-w-0 h-9 px-3 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <Button
                type="submit"
                size="sm"
                data-testid="chat-send-btn"
                disabled={!inputText.trim() || sending}
                className="h-9 px-3 gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send
              </Button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 px-1">
              <span>Personal phone numbers & emails are automatically masked.</span>
              <span>{inputText.length}/500</span>
            </div>
          </form>
        </footer>
      </aside>
    </div>
  )
}
