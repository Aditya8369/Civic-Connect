import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  runTransaction,
  addDoc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/contexts/AuthContext'
import {
  ArrowBigUp,
  MessageSquare,
  Send,
  Filter,
  Loader2,
  Clock,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function CommunityFeed() {
  const { user } = useAuth()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('recent') // 'recent' | 'upvoted'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [openComments, setOpenComments] = useState({}) // { [issueId]: boolean }
  const [commentsData, setCommentsData] = useState({}) // { [issueId]: [] }
  const [newComment, setNewComment] = useState({}) // { [issueId]: string }
  const [submittingComment, setSubmittingComment] = useState({})

  // 1. Fetch live active complaints from Firestore
  useEffect(() => {
    setLoading(true)
    const issuesRef = collection(db, 'issues')
    
    // Live stream active issues
    const unsubscribe = onSnapshot(
      issuesRef,
      (snapshot) => {
        const issues = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        setComplaints(issues)
        setLoading(false)
      },
      (error) => {
        console.error('Error fetching community issues:', error)
        toast.error('Failed to load community feed')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  // 2. Upvote / Remove Upvote Toggle with Firestore Transaction
  const handleToggleUpvote = async (issueId) => {
    if (!user) {
      toast.error('Please login to upvote issues')
      return
    }

    const issueRef = doc(db, 'issues', issueId)

    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(issueRef)
        if (!sfDoc.exists()) {
          throw new Error('Issue does not exist')
        }

        const data = sfDoc.data()
        const upvotedBy = Array.isArray(data.upvotedBy) ? data.upvotedBy : []
        const currentCount = typeof data.upvotesCount === 'number' ? data.upvotesCount : upvotedBy.length

        const hasUpvoted = upvotedBy.includes(user.uid)

        if (hasUpvoted) {
          // Remove upvote
          transaction.update(issueRef, {
            upvotedBy: upvotedBy.filter((id) => id !== user.uid),
            upvotesCount: Math.max(0, currentCount - 1),
          })
        } else {
          // Add upvote
          transaction.update(issueRef, {
            upvotedBy: [...upvotedBy, user.uid],
            upvotesCount: currentCount + 1,
          })
        }
      })
    } catch (err) {
      console.error('Upvote transaction failed:', err)
      toast.error('Failed to update upvote')
    }
  }

  // 3. Comments Toggle & Listener
  const toggleComments = (issueId) => {
    setOpenComments((prev) => {
      const nextState = !prev[issueId]
      if (nextState && !commentsData[issueId]) {
        // Subscribe to comments subcollection
        const commentsRef = collection(db, 'issues', issueId, 'comments')
        const q = query(commentsRef, orderBy('createdAt', 'asc'))
        onSnapshot(q, (snapshot) => {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
          setCommentsData((cd) => ({ ...cd, [issueId]: list }))
        })
      }
      return { ...prev, [issueId]: nextState }
    })
  }

  // 4. Submit Comment
  const handleAddComment = async (issueId) => {
    if (!user) {
      toast.error('Please login to comment')
      return
    }

    const text = (newComment[issueId] || '').trim()
    if (!text) return

    setSubmittingComment((prev) => ({ ...prev, [issueId]: true }))
    try {
      const commentsRef = collection(db, 'issues', issueId, 'comments')
      await addDoc(commentsRef, {
        text,
        authorName: user.name || 'Citizen',
        authorId: user.uid,
        createdAt: serverTimestamp(),
      })
      setNewComment((prev) => ({ ...prev, [issueId]: '' }))
    } catch (err) {
      console.error('Failed to add comment:', err)
      toast.error('Could not post comment')
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [issueId]: false }))
    }
  }

  // Categories list extraction
  const categories = ['all', ...new Set(complaints.map((c) => c.category).filter(Boolean))]

  // Filtering & Sorting
  const filteredComplaints = complaints
    .filter((item) => {
      if (categoryFilter === 'all') return true
      return item.category?.toLowerCase() === categoryFilter.toLowerCase()
    })
    .sort((a, b) => {
      if (sortBy === 'upvoted') {
        const countA = a.upvotesCount || (a.upvotedBy?.length || 0)
        const countB = b.upvotesCount || (b.upvotedBy?.length || 0)
        return countB - countA
      }
      // Recent sort
      const timeA = a.createdAt?.seconds || 0
      const timeB = b.createdAt?.seconds || 0
      return timeB - timeA
    })

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filters:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white capitalize dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sort by:</span>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
            <button
              onClick={() => setSortBy('recent')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                sortBy === 'recent'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-300'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortBy('upvoted')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                sortBy === 'upvoted'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-300'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              Most Upvoted
            </button>
          </div>
        </div>
      </div>

      {/* Feed List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <p className="text-sm">Loading community feed...</p>
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
          <p className="text-gray-500 text-sm dark:text-gray-400">No community issues found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredComplaints.map((issue) => {
            const upvotedBy = Array.isArray(issue.upvotedBy) ? issue.upvotedBy : []
            const hasUpvoted = user ? upvotedBy.includes(user.uid) : false
            const upvotesCount = typeof issue.upvotesCount === 'number' ? issue.upvotesCount : upvotedBy.length
            const isCommentsOpen = !!openComments[issue.id]
            const commentsList = commentsData[issue.id] || []

            return (
              <div
                key={issue.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-gray-300 transition dark:bg-gray-900 dark:border-gray-800 dark:hover:border-gray-700"
              >
                <div className="p-5 flex gap-4">
                  {/* Upvote Column */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => handleToggleUpvote(issue.id)}
                      className={`flex flex-col items-center justify-center w-12 h-14 rounded-lg border transition ${
                        hasUpvoted
                          ? 'bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                      title={hasUpvoted ? 'Remove upvote' : 'Upvote this issue'}
                    >
                      <ArrowBigUp
                        className={`w-6 h-6 ${hasUpvoted ? 'fill-blue-600 dark:fill-blue-400' : ''}`}
                      />
                      <span className="text-xs font-bold">{upvotesCount}</span>
                    </button>
                  </div>

                  {/* Issue Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {issue.category && (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium capitalize dark:bg-blue-900/30 dark:text-blue-300">
                          <Tag className="w-3 h-3" />
                          {issue.category}
                        </span>
                      )}
                      {issue.status && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium capitalize dark:bg-gray-800 dark:text-gray-300">
                          {issue.status}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 flex items-center gap-1 ml-auto dark:text-gray-400">
                        <Clock className="w-3 h-3" />
                        {issue.createdAt?.toDate
                          ? issue.createdAt.toDate().toLocaleDateString()
                          : 'Recent'}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-gray-900 mb-1 dark:text-gray-100">
                      {issue.title || issue.subject || 'Civic Issue'}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3 whitespace-pre-line dark:text-gray-400">
                      {issue.description || 'No description provided.'}
                    </p>

                    {issue.location && (
                      <p className="text-xs text-gray-500 mb-3 dark:text-gray-400">
                        📍 {typeof issue.location === 'string' ? issue.location : issue.location.address || 'Local area'}
                      </p>
                    )}

                    {/* Bottom Action: Comments Toggle */}
                    <button
                      onClick={() => toggleComments(issue.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 transition dark:text-gray-400 dark:hover:text-blue-400"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>{commentsList.length} Comments</span>
                      {isCommentsOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Comment Section / Drawer */}
                {isCommentsOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/70 p-4 space-y-4 dark:border-gray-800 dark:bg-gray-950/50">
                    <div className="space-y-2.5 max-h-60 overflow-y-auto">
                      {commentsList.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2 dark:text-gray-400">
                          No comments yet. Be the first to add details or context!
                        </p>
                      ) : (
                        commentsList.map((c) => (
                          <div
                            key={c.id}
                            className="bg-white p-3 rounded-lg border border-gray-200 text-xs space-y-1 dark:bg-gray-900 dark:border-gray-800"
                          >
                            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                              <span className="font-semibold text-gray-800 dark:text-gray-200">
                                {c.authorName || 'Citizen'}
                              </span>
                              <span>
                                {c.createdAt?.toDate
                                  ? c.createdAt.toDate().toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                  : 'Just now'}
                              </span>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300">{c.text}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Comment Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add details, context, or community support..."
                        value={newComment[issue.id] || ''}
                        onChange={(e) =>
                          setNewComment((prev) => ({ ...prev, [issue.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddComment(issue.id)
                        }}
                        className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                      <button
                        onClick={() => handleAddComment(issue.id)}
                        disabled={submittingComment[issue.id] || !newComment[issue.id]?.trim()}
                        className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {submittingComment[issue.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
