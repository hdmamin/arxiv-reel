'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronUp, Bookmark, BookmarkCheck, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Paper {
  id: string
  title: string
  authors: string[]
  abstract: string
  arxivUrl: string
  publishedAt: string
  tag?: string
  question?: string
  answer?: string
  bet?: string
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
      const response = await fetch('/api/papers?limit=10')
      if (!response.ok) throw new Error('Failed to fetch papers')
      const data = await response.json()
      setPapers(data.papers)
      setHasMore(data.papers.length >= 10) // If we got 10 papers, there might be more
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
      const currentLength = papers.length
      const response = await fetch(`/api/papers?limit=20&offset=${currentLength}`)
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        case 'Enter':
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
        case 'r':
        case 'R':
          e.preventDefault()
          fetchPapers()
          break
        case 'Escape':
          e.preventDefault()
          if (showBookmarks) {
            setShowBookmarks(false)
            setCurrentIndex(0)
            setIsFlipped(false)
          } else if (isFlipped) {
            setIsFlipped(false)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, papers, bookmarks, isFlipped, showBookmarks, fetchPapers])

  useEffect(() => {
    fetchPapers()
  }, [fetchPapers])

  const currentPaper = showBookmarks ? bookmarks[currentIndex] : papers[currentIndex]

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
    } else if (direction === 'down' && currentIndex < papers.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
    setIsFlipped(false)
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
            <h1 className="text-2xl font-bold">GrugTok</h1>
            <p className="text-xs text-muted-foreground mt-1">
              ↑↓ Navigate | Space Flip | B Bookmark | R Refresh | ESC Back
            </p>
          </div>
          <div className="flex gap-2">
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
            onClick={handleFlip}
          >
            {/* Front of card */}
            <Card 
              className="absolute inset-0 backface-hidden"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <CardContent className="p-8 h-full flex flex-col justify-between">
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
                      <p className="text-xl text-muted-foreground italic leading-relaxed">
                        {currentPaper.question}
                      </p>
                    </div>
                  )}

                  {/* Answer (Core Idea) */}
                  {currentPaper.answer && (
                    <div className="text-center">
                      <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Answer</h3>
                      <p className="text-2xl font-bold text-primary leading-relaxed">
                        {currentPaper.answer}
                      </p>
                    </div>
                  )}

                  {/* Bet (Philosophical Assumption) */}
                  {currentPaper.bet && (
                    <div className="text-center">
                      <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Bet</h3>
                      <p className="text-lg text-muted-foreground leading-relaxed">
                        {currentPaper.bet}
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

      {/* Navigation Controls */}
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
                handleBookmark(currentPaper)
              }}
            >
              {isBookmarked ? (
                <BookmarkCheck className="h-5 w-5 text-primary" />
              ) : (
                <Bookmark className="h-5 w-5" />
              )}
            </Button>
            
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