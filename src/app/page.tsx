'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRef } from 'react'
import { ChevronUp, Bookmark, BookmarkCheck, Loader2, RefreshCw, MessageCircle, X, Copy, Check, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'

interface Paper {
  id: string
  title: string
  authors: string[]
  abstract: string
  arxivUrl: string
  publishedAt: string
  tag?: string
  question?: string
  thesis?: string
  method?: string
  content?: string
}

interface BookmarkedPaper extends Paper {
  bookmarkedAt: string
}

export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkedPaper[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isFlipped, setIsFlipped] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [loadingContent, setLoadingContent] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // Mode state
  type Mode = 'passive' | 'active' | 'review'
  const [mode, setMode] = useState<Mode>('active')
  const [activeStage, setActiveStage] = useState<1 | 2 | 3>(1)
  const [thesisGuess, setThesisGuess] = useState('')
  const [methodGuess, setMethodGuess] = useState('')
  const [feedback, setFeedback] = useState<{
    thesisFeedback: string
    methodFeedback: string
    overall: string
  } | null>(null)
  const [loadingFeedback, setLoadingFeedback] = useState(false)

  // Grading state
  const GRADES = ['A', 'B', 'C', 'D', 'F'] as const
  type Grade = typeof GRADES[number]
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  const [gradingActive, setGradingActive] = useState(false)

  // Chat state
  const [showChat, setShowChat] = useState(false)
  const [chatWide, setChatWide] = useState(false)
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Review mode state
  interface Interaction {
    id: string
    paperId: string
    paperTitle: string
    paperTag: string | null
    question: string
    thesisGuess: string
    methodGuess: string
    realThesis: string
    realMethod: string
    thesisFeedback: string | null
    methodFeedback: string | null
    overallFeedback: string | null
    createdAt: string
  }
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loadingInteractions, setLoadingInteractions] = useState(false)
  const [expandedInteraction, setExpandedInteraction] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)

  // Fetch interactions when entering review mode
  useEffect(() => {
    if (mode !== 'review') return
    setLoadingInteractions(true)
    fetch('/api/interactions?limit=100')
      .then(res => res.json())
      .then(data => setInteractions(data.interactions || []))
      .catch(err => console.error('Error fetching interactions:', err))
      .finally(() => setLoadingInteractions(false))
  }, [mode])

  const generateReport = async () => {
    if (interactions.length === 0) return
    setLoadingReport(true)
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactions: interactions.slice(0, 50) }),
      })
      if (response.ok) {
        const data = await response.json()
        setReport(data.report)
      }
    } catch (error) {
      console.error('Error generating report:', error)
    } finally {
      setLoadingReport(false)
    }
  }

  const copyCardText = () => {
    if (!currentPaper) return
    const parts = [
      currentPaper.question && `Question: ${currentPaper.question}`,
      currentPaper.thesis && `Thesis: ${currentPaper.thesis}`,
      currentPaper.method && `Method: ${currentPaper.method}`,
      `\n${currentPaper.title}`,
      currentPaper.arxivUrl,
    ].filter(Boolean)
    navigator.clipboard.writeText(parts.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Load bookmarks from localStorage
  useEffect(() => {
    const savedBookmarks = localStorage.getItem('arxiv-bookmarks')
    if (savedBookmarks) {
      setBookmarks(JSON.parse(savedBookmarks))
    }
  }, [])

  // Save bookmarks to localStorage
  useEffect(() => {
    if (bookmarks.length > 0) {
      localStorage.setItem('arxiv-bookmarks', JSON.stringify(bookmarks))
    }
  }, [bookmarks])

  const fetchPapers = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/papers?limit=3')
      if (!response.ok) throw new Error('Failed to fetch papers')
      const data = await response.json()
      setPapers(data.papers || [])
      setHasMore((data.papers || []).length >= 3)
    } catch (error) {
      console.error('Error fetching papers:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchMorePapers = useCallback(async () => {
    if (loadingMore || !hasMore) return
    
    setLoadingMore(true)
    try {
      const seenIds = papers.map(p => p.id).join(',')
      const response = await fetch(`/api/papers?limit=20&exclude=${encodeURIComponent(seenIds)}`)
      if (!response.ok) throw new Error('Failed to fetch more papers')
      const data = await response.json()
      
      if (data.papers.length > 0) {
        setPapers(prev => [...prev, ...data.papers])
        setHasMore(data.papers.length >= 20)
      } else {
        setHasMore(false)
      }
    } catch (error) {
      console.error('Error fetching more papers:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, papers.length])

  const currentPaper = showBookmarks ? bookmarks[currentIndex] : papers[currentIndex]

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      const inInput = tag === 'textarea' || tag === 'input'

      // When typing in a textarea: Escape blurs it, all other keys pass through
      if (inInput) {
        if (e.key === 'Escape') {
          e.preventDefault()
          ;(document.activeElement as HTMLElement)?.blur()
        }
        return
      }

      // Grading chord: G activates, then A-F assigns grade, Escape/any other key cancels
      if (gradingActive) {
        e.preventDefault()
        const key = e.key.toUpperCase()
        if (GRADES.includes(key as Grade) && currentPaper) {
          saveGrade(currentPaper.id, key as Grade)
        }
        setGradingActive(false)
        return
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          handleScroll('up')
          break
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          handleScroll('down')
          break
        case ' ':
          e.preventDefault()
          handleFlip()
          break
        case 'b':
        case 'B':
          e.preventDefault()
          if (currentPaper) {
            handleBookmark(currentPaper)
          }
          break
        case 'c':
        case 'C':
          e.preventDefault()
          setShowChat(prev => !prev)
          break
        case 'w':
        case 'W':
          if (showChat) {
            e.preventDefault()
            setChatWide(prev => !prev)
          }
          break
        case 'g':
        case 'G':
          e.preventDefault()
          setGradingActive(true)
          break
        case 'r':
        case 'R':
          e.preventDefault()
          fetchPapers()
          break
        case 'Escape':
          e.preventDefault()
          if (showChat) {
            setShowChat(false)
          } else if (showBookmarks) {
            setShowBookmarks(false)
            setCurrentIndex(0)
            setIsFlipped(false)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, papers, bookmarks, isFlipped, showBookmarks, mode, showChat, fetchPapers, gradingActive, currentPaper])

  useEffect(() => {
    fetchPapers()
  }, [fetchPapers])

  // Load existing grades on mount
  useEffect(() => {
    fetch('/api/grades')
      .then(res => res.json())
      .then(data => {
        const map: Record<string, Grade> = {}
        for (const g of data.grades || []) map[g.paperId] = g.grade
        setGrades(map)
      })
      .catch(err => console.error('Error loading grades:', err))
  }, [])

  const saveGrade = async (paperId: string, grade: Grade) => {
    setGrades(prev => ({ ...prev, [paperId]: grade }))
    try {
      await fetch('/api/grades', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId, grade }),
      })
    } catch (err) {
      console.error('Error saving grade:', err)
    }
  }

  // Auto-exit bookmarks view when bookmarks become empty
  useEffect(() => {
    if (showBookmarks && bookmarks.length === 0) {
      setShowBookmarks(false)
      setCurrentIndex(0)
    }
  }, [showBookmarks, bookmarks.length])

  // Generate a consistent color for a tag based on its text
  const getTagColor = (tag: string) => {
    const colors = [
      'bg-blue-500/20 text-blue-700 dark:text-blue-300',
      'bg-green-500/20 text-green-700 dark:text-green-300',
      'bg-purple-500/20 text-purple-700 dark:text-purple-300',
      'bg-orange-500/20 text-orange-700 dark:text-orange-300',
      'bg-pink-500/20 text-pink-700 dark:text-pink-300',
      'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
      'bg-amber-500/20 text-amber-700 dark:text-amber-300',
      'bg-rose-500/20 text-rose-700 dark:text-rose-300',
      'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
      'bg-teal-500/20 text-teal-700 dark:text-teal-300',
    ]

    // Use a simple hash to consistently map tags to colors
    let hash = 0
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const handleBookmark = (paper: Paper) => {
    const isBookmarked = bookmarks.some(b => b.id === paper.id)
    if (isBookmarked) {
      setBookmarks(bookmarks.filter(b => b.id !== paper.id))
    } else {
      setBookmarks([...bookmarks, { ...paper, bookmarkedAt: new Date().toISOString() }])
    }
  }

  const handleScroll = (direction: 'up' | 'down') => {
    if (direction === 'up' && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    } else if (direction === 'down') {
      if (currentIndex < papers.length - 1) {
        setCurrentIndex(currentIndex + 1)
      }
      // Auto-fetch more when near the end
      if (currentIndex >= papers.length - 2 && hasMore && !loadingMore) {
        fetchMorePapers()
      }
    }
    setIsFlipped(false)
    setActiveStage(1)
    setThesisGuess('')
    setMethodGuess('')
    setFeedback(null)
    setShowChat(false)
    setChatMessages([])
    setChatInput('')
  }

  const handleFlip = async () => {
    if (!isFlipped && currentPaper && !currentPaper.content && !loadingContent) {
      // Fetch full content when flipping for the first time
      setLoadingContent(currentPaper.id)
      try {
        const response = await fetch(`/api/papers/${currentPaper.id}/content`)
        if (response.ok) {
          const data = await response.json()
          // Update the paper with full content
          if (showBookmarks) {
            setBookmarks(bookmarks.map(p => 
              p.id === currentPaper.id ? { ...p, content: data.content } : p
            ))
          } else {
            setPapers(papers.map(p => 
              p.id === currentPaper.id ? { ...p, content: data.content } : p
            ))
          }
        }
      } catch (error) {
        console.error('Error fetching full content:', error)
      } finally {
        setLoadingContent(null)
      }
    }
    setIsFlipped(!isFlipped)
  }

  const handleStageSubmit = async () => {
    if (activeStage === 1) {
      if (!thesisGuess.trim()) return
      setActiveStage(2)
    } else if (activeStage === 2) {
      if (!methodGuess.trim()) return
      setActiveStage(3)
      setLoadingFeedback(true)
      try {
        const response = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: currentPaper?.question,
            thesisGuess,
            methodGuess,
            realThesis: currentPaper?.thesis,
            realMethod: currentPaper?.method,
          }),
        })
        if (response.ok) {
          const data = await response.json()
          setFeedback({
            thesisFeedback: data.thesis_feedback,
            methodFeedback: data.method_feedback,
            overall: data.overall,
          })

          // Seed chat with the follow-up question
          if (data.followup) {
            setChatMessages([{ role: 'assistant', content: data.followup }])
            setShowChat(true)
          }

          // Save interaction to database (non-blocking)
          fetch('/api/interactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paperId: currentPaper?.id,
              paperTitle: currentPaper?.title,
              paperTag: currentPaper?.tag,
              question: currentPaper?.question,
              thesisGuess,
              methodGuess,
              realThesis: currentPaper?.thesis,
              realMethod: currentPaper?.method,
              thesisFeedback: data.thesis_feedback,
              methodFeedback: data.method_feedback,
              overallFeedback: data.overall,
            }),
          }).catch(err => console.error('Error saving interaction:', err))
        }
      } catch (error) {
        console.error('Error fetching feedback:', error)
      } finally {
        setLoadingFeedback(false)
      }
    }
  }

  const ensurePaperContent = async (): Promise<string> => {
    if (!currentPaper) return ''
    if (currentPaper.content) return currentPaper.content
    if (loadingContent) return ''
    setLoadingContent(currentPaper.id)
    try {
      const response = await fetch(`/api/papers/${currentPaper.id}/content`)
      if (response.ok) {
        const data = await response.json()
        if (showBookmarks) {
          setBookmarks(bookmarks.map(p =>
            p.id === currentPaper.id ? { ...p, content: data.content } : p
          ))
        } else {
          setPapers(papers.map(p =>
            p.id === currentPaper.id ? { ...p, content: data.content } : p
          ))
        }
        return data.content || ''
      }
    } catch (error) {
      console.error('Error fetching paper content:', error)
    } finally {
      setLoadingContent(null)
    }
    return ''
  }

  // Convert \(...\) → $...$ and \[...\] → $$...$$ for remark-math
  const normalizeMathDelimiters = (text: string) =>
    text.replace(/\\\((.*?)\\\)/g, '$$$1$$').replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading || !currentPaper) return

    const userMessage = { role: 'user' as const, content: chatInput.trim() }
    const updatedMessages = [...chatMessages, userMessage]
    setChatMessages(updatedMessages)
    setChatInput('')
    setChatLoading(true)
    setShowChat(true)

    // Ensure paper content is loaded for context
    const paperContent = await ensurePaperContent()

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperId: currentPaper.id,
          title: currentPaper.title,
          abstract: currentPaper.abstract,
          content: paperContent,
          question: currentPaper.question,
          thesis: currentPaper.thesis,
          method: currentPaper.method,
          thesisGuess: thesisGuess || undefined,
          methodGuess: methodGuess || undefined,
          feedback: feedback || undefined,
          mode: mode === 'active' ? 'active' : 'passive',
          stage: mode === 'active' ? activeStage : undefined,
          messages: updatedMessages,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        setChatMessages([...updatedMessages, { role: 'assistant', content: data.response }])
      }
    } catch (error) {
      console.error('Error sending chat message:', error)
    } finally {
      setChatLoading(false)
    }
  }

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  const isBookmarked = currentPaper ? bookmarks.some(b => b.id === currentPaper.id) : false

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading papers...</p>
        </div>
      </div>
    )
  }

  if (!currentPaper) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground">No papers available</p>
          <Button onClick={fetchPapers} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-background/80 to-transparent">
        <div className="flex justify-between items-center max-w-4xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold">TLDRxiv</h1>
            <p className="text-xs text-muted-foreground mt-1">
              ↑↓ Navigate | Space Flip | G Grade | C Chat | W Widen | B Bookmark | R Refresh
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Tabs value={mode} onValueChange={(v) => {
              setMode(v as Mode)
              setActiveStage(1)
              setThesisGuess('')
              setMethodGuess('')
              setFeedback(null)
              setShowChat(false)
              setChatMessages([])
            }}>
              <TabsList className="h-8">
                <TabsTrigger value="passive" className="text-xs px-3">Passive</TabsTrigger>
                <TabsTrigger value="active" className="text-xs px-3">Active</TabsTrigger>
                <TabsTrigger value="review" className="text-xs px-3">Review</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant={showBookmarks ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowBookmarks(!showBookmarks)
                setCurrentIndex(0)
                setIsFlipped(false)
              }}
            >
              <Bookmark className="h-4 w-4 mr-2" />
              Bookmarks ({bookmarks.length})
            </Button>
            <Button variant="outline" size="sm" onClick={fetchPapers}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {mode === 'review' ? (
        <div className="h-full pt-20 pb-20 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 space-y-6">
            {/* Report section */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Review</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={generateReport}
                disabled={loadingReport || interactions.length === 0}
              >
                {loadingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  'Generate Report'
                )}
              </Button>
            </div>

            {report && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Report</h3>
                  <div className="text-sm whitespace-pre-wrap">{report}</div>
                </CardContent>
              </Card>
            )}

            {/* Interaction history */}
            {loadingInteractions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : interactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                No interactions yet. Complete some exercises in Active mode first.
              </p>
            ) : (
              <div className="space-y-3">
                {interactions.map((interaction) => (
                  <Card
                    key={interaction.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setExpandedInteraction(
                      expandedInteraction === interaction.id ? null : interaction.id
                    )}
                  >
                    <CardContent className="p-4">
                      {/* Compact row */}
                      <div className="flex items-start gap-3">
                        {interaction.paperTag && (
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                            getTagColor(interaction.paperTag)
                          )}>
                            {interaction.paperTag}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{interaction.paperTitle}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(interaction.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {expandedInteraction === interaction.id && (
                        <div className="mt-4 space-y-4 border-t pt-4">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Question</p>
                            <p className="text-sm italic">{interaction.question}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Your Thesis</p>
                              <p className="text-sm">{interaction.thesisGuess}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-primary mb-1">Actual Thesis</p>
                              <p className="text-sm">{interaction.realThesis}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Your Method</p>
                              <p className="text-sm">{interaction.methodGuess}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-primary mb-1">Actual Method</p>
                              <p className="text-sm">{interaction.realMethod}</p>
                            </div>
                          </div>

                          {interaction.overallFeedback && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Feedback</p>
                              <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">
                                {interaction.overallFeedback}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex items-center justify-center h-full pt-20 pb-20">
        <div className="relative w-full max-w-2xl h-[80vh] perspective-1000">
          {/* Paper Card */}
          <div 
            className={cn(
              "absolute inset-0 cursor-pointer transition-all duration-700 transform-gpu",
              "preserve-3d hover:scale-[1.02]"
            )}
            style={{
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transformStyle: 'preserve-3d'
            }}
            onClick={(e) => {
              const tag = (e.target as HTMLElement).tagName.toLowerCase()
              if (tag === 'textarea' || tag === 'input' || tag === 'button') return
              handleFlip()
            }}
          >
            {/* Front of card */}
            <Card
              className="absolute inset-0 backface-hidden"
              style={{ backfaceVisibility: 'hidden' }}
            >
              {isBookmarked && (
                <div className="absolute top-0 right-4 z-10">
                  <Bookmark className="h-6 w-6 fill-red-500 text-red-500" />
                </div>
              )}
              <CardContent className="p-8 h-full flex flex-col justify-between">
                {mode === 'active' ? (
                  /* Active mode: staged reveal */
                  <>
                    <div className="space-y-6 flex-1 overflow-y-auto">
                      {/* Tag */}
                      {currentPaper.tag && (
                        <div className="flex justify-center">
                          <span className={cn(
                            "px-4 py-2 rounded-full text-base font-semibold",
                            getTagColor(currentPaper.tag)
                          )}>
                            {currentPaper.tag}
                          </span>
                        </div>
                      )}

                      {/* Question (always visible) */}
                      {currentPaper.question && (
                        <div className="text-center">
                          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Question</h3>
                          <p className="text-2xl font-bold text-primary italic leading-relaxed">
                            {currentPaper.question}
                          </p>
                        </div>
                      )}

                      {/* Stage 1: Guess the thesis */}
                      {activeStage === 1 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide text-center">What&apos;s your thesis?</h3>
                          <Textarea
                            value={thesisGuess}
                            onChange={(e) => setThesisGuess(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleStageSubmit()
                              }
                            }}
                            placeholder="If you were tackling this problem, what would your bet be?"
                            className="resize-none"
                            rows={2}
                            autoFocus
                          />
                          <p className="text-xs text-muted-foreground text-center">Press Enter to submit</p>
                        </div>
                      )}

                      {/* Stage 2+3: Thesis comparison */}
                      {activeStage >= 2 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide text-center">Thesis</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Yours</p>
                              <p className="text-sm text-muted-foreground">{thesisGuess}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-primary mb-1">Actual</p>
                              <p className="text-sm text-primary">{currentPaper.thesis}</p>
                            </div>
                          </div>
                          {feedback && feedback.thesisFeedback && (
                            <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">{feedback.thesisFeedback}</p>
                          )}
                        </div>
                      )}

                      {/* Stage 2: Guess the method */}
                      {activeStage === 2 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide text-center">How would you operationalize your thesis?</h3>
                          <Textarea
                            value={methodGuess}
                            onChange={(e) => setMethodGuess(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleStageSubmit()
                              }
                            }}
                            placeholder="How would you operationalize your thesis?"
                            className="resize-none"
                            rows={2}
                            autoFocus
                          />
                          <p className="text-xs text-muted-foreground text-center">Press Enter to submit</p>
                        </div>
                      )}

                      {/* Stage 3: Method comparison + feedback */}
                      {activeStage === 3 && (
                        <>
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide text-center">Method</h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Yours</p>
                                <p className="text-sm text-muted-foreground">{methodGuess}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-primary mb-1">Actual</p>
                                <p className="text-sm text-primary">{currentPaper.method}</p>
                              </div>
                            </div>
                            {feedback && feedback.methodFeedback && (
                              <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">{feedback.methodFeedback}</p>
                            )}
                          </div>

                          {loadingFeedback && (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                              <span className="text-sm text-muted-foreground">Generating feedback...</span>
                            </div>
                          )}

                          {feedback && feedback.overall && (
                            <div className="text-center border-t pt-4">
                              <p className="text-sm text-muted-foreground italic">{feedback.overall}</p>
                            </div>
                          )}

                          {feedback && !showChat && (
                            <div className="text-center pt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShowChat(true)
                                }}
                              >
                                <MessageCircle className="h-3 w-3 mr-1" />
                                Continue chatting about this paper...
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Title hint at bottom */}
                    <div className="text-center mt-4 pt-4 border-t">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {currentPaper.title}
                      </p>
                    </div>
                  </>
                ) : (
                  /* Passive mode: show all fields */
                  <>
                    <div className="space-y-8">
                      {/* Tag */}
                      {currentPaper.tag && (
                        <div className="flex justify-center">
                          <span className={cn(
                            "px-4 py-2 rounded-full text-base font-semibold",
                            getTagColor(currentPaper.tag)
                          )}>
                            {currentPaper.tag}
                          </span>
                        </div>
                      )}

                      {/* Question */}
                      {currentPaper.question && (
                        <div className="text-center">
                          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Question</h3>
                          <p className="text-2xl font-bold text-primary italic leading-relaxed">
                            {currentPaper.question}
                          </p>
                        </div>
                      )}

                      {/* Thesis (Why) */}
                      {currentPaper.thesis && (
                        <div className="text-center">
                          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Thesis</h3>
                          <p className="text-2xl font-bold text-primary leading-relaxed">
                            {currentPaper.thesis}
                          </p>
                        </div>
                      )}

                      {/* Method (How) */}
                      {currentPaper.method && (
                        <div className="text-center">
                          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Method</h3>
                          <p className="text-2xl font-bold text-primary leading-relaxed">
                            {currentPaper.method}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Title hint at bottom */}
                    <div className="text-center mt-4 pt-4 border-t">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {currentPaper.title}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Back of card */}
            <Card 
              className="absolute inset-0 backface-hidden"
              style={{ 
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)'
              }}
            >
              <CardContent className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold line-clamp-2">{currentPaper.title}</h2>
                  <div className="text-xs text-muted-foreground">
                    {currentPaper.authors.length > 2 ? 
                      `${currentPaper.authors[0]} et al.` : 
                      currentPaper.authors.join(', ')
                    }
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-4">
                    {/* Abstract Section */}
                    <div className="border-b pb-4">
                      <h3 className="text-sm font-semibold mb-2 text-primary">Abstract</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {currentPaper.abstract}
                      </p>
                    </div>
                    
                    {/* Full Content Section */}
                    {loadingContent === currentPaper.id ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">Extracting full paper content...</p>
                          <p className="text-xs text-muted-foreground">This may take a few moments</p>
                        </div>
                      </div>
                    ) : currentPaper.content && currentPaper.content.length > 0 ? (
                      <div className="pb-4">
                        <h3 className="text-sm font-semibold mb-3 text-primary">Full Paper Content</h3>
                        <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 p-4 rounded-lg max-h-[60vh] overflow-y-auto custom-scrollbar">
                          {currentPaper.content}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">Full paper content not available</p>
                        <p className="text-xs mt-2">Click to fetch and extract PDF content</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Footer with arXiv link */}
                <div className="border-t pt-3 mt-4">
                  <a 
                    href={currentPaper.arxivUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View on arXiv
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      )}

      {/* Chat Panel — right side */}
      {showChat && (
        <div className={cn(
          "fixed top-0 right-0 z-40 h-full border-l bg-background shadow-lg flex flex-col transition-all duration-200",
          chatWide ? "w-[50vw]" : "w-[400px]"
        )}>
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-xs text-muted-foreground truncate flex-1 mr-2">
              {currentPaper?.title}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setChatWide(prev => !prev)}
                title="Toggle width (W)"
              >
                {chatWide ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowChat(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center italic pt-8">
                Ask anything about this paper...
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn(
                "max-w-[85%] text-sm rounded-lg px-3 py-2",
                msg.role === 'user'
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted chat-markdown"
              )}>
                {msg.role === 'user' ? msg.content : (
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '')
                        const inline = !match && !String(children).includes('\n')
                        return inline ? (
                          <code className="bg-background/50 rounded px-1 py-0.5 text-xs font-mono" {...props}>
                            {children}
                          </code>
                        ) : (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match?.[1] || 'text'}
                            PreTag="div"
                            customStyle={{ margin: '0.5rem 0', borderRadius: '0.375rem', fontSize: '0.75rem' }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        )
                      },
                      p({ children }) {
                        return <p className="mb-2 last:mb-0">{children}</p>
                      },
                      ul({ children }) {
                        return <ul className="list-disc pl-4 mb-2">{children}</ul>
                      },
                      ol({ children }) {
                        return <ol className="list-decimal pl-4 mb-2">{children}</ol>
                      },
                    }}
                  >
                    {normalizeMathDelimiters(msg.content)}
                  </ReactMarkdown>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking...
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendChatMessage()
                }
              }}
              placeholder="Ask a question..."
              className="resize-none text-sm"
              rows={2}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Navigation Controls */}
      {mode !== 'review' && (
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-background/80 to-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleScroll('up')}
              disabled={currentIndex === 0}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleScroll('down')}
              disabled={currentIndex === (showBookmarks ? bookmarks.length : papers.length) - 1}
            >
              <ChevronUp className="h-4 w-4 rotate-180" />
            </Button>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setShowChat(prev => !prev)
              }}
            >
              <MessageCircle className={cn("h-5 w-5", showChat && "text-primary")} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                copyCardText()
              }}
            >
              {copied ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleBookmark(currentPaper)
              }}
            >
              {isBookmarked ? (
                <BookmarkCheck className="h-5 w-5 text-primary" />
              ) : (
                <Bookmark className="h-5 w-5" />
              )}
            </Button>

            {/* Grade indicator / grading panel */}
            <div className="relative">
              {gradingActive ? (
                <div className="flex items-center gap-1 bg-background/90 border rounded-lg px-2 py-1">
                  {GRADES.map(g => (
                    <button
                      key={g}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (currentPaper) saveGrade(currentPaper.id, g)
                        setGradingActive(false)
                      }}
                      className={cn(
                        "w-7 h-7 rounded text-xs font-bold transition-colors",
                        currentPaper && grades[currentPaper.id] === g
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setGradingActive(true)
                  }}
                  title="Grade paper (G)"
                >
                  {currentPaper && grades[currentPaper.id] ? (
                    <span className={cn(
                      "text-sm font-bold",
                      grades[currentPaper.id] === 'A' && "text-green-500",
                      grades[currentPaper.id] === 'B' && "text-blue-500",
                      grades[currentPaper.id] === 'C' && "text-yellow-500",
                      grades[currentPaper.id] === 'D' && "text-orange-500",
                      grades[currentPaper.id] === 'F' && "text-red-500",
                    )}>
                      {grades[currentPaper.id]}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">G</span>
                  )}
                </Button>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              {currentIndex + 1} / {showBookmarks ? bookmarks.length : papers.length}
            </div>
            
            {!showBookmarks && hasMore && currentIndex >= papers.length - 5 && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  fetchMorePapers()
                }}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Load More</span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      )}

      {/* Keyboard navigation */}
      <div className="sr-only">
        <p>Use arrow keys to navigate, space to flip card, b to bookmark</p>
      </div>

      <style jsx>{`
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  )
}