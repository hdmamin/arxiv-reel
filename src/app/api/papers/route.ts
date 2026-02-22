import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

interface ArxivPaper {
  id: string
  title: string
  authors: string[]
  abstract: string
  arxivUrl: string
  publishedAt: string
  content?: string
}

interface ProcessedPaper extends ArxivPaper {
  tag?: string
  question?: string
  answer?: string
  bet?: string
}

const USER_INTERESTS = `synthetic data, post-training/alignment methods, information retrieval/search, embeddings, interpretability (e.g. mechanistic interpretability, representation engineering, etc), program search, low latency language generation (not talking about incremental speedups, more like things that could provide a 100-1000x speedup), program synthesis, code generation, agents and tool use, evaluation/verification particularly in domains where ground truth is hard to obtain, new modes of human-AI collaboration and new UX for scientific computing, AI impact on and role in society`


// Fetch paper content from arXiv HTML for deeper analysis
async function fetchPaperContent(arxivId: string): Promise<string> {
  try {
    const cleanId = arxivId.replace(/v\d+$/, '')
    const htmlUrl = `https://arxiv.org/html/${cleanId}`

    const response = await fetch(htmlUrl, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) return ''

    const html = await response.text()

    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (text.length < 1000) return ''

    // Take intro/methods (~8k chars) and conclusion (~2k chars) to stay within token budget
    if (text.length > 12000) {
      const head = text.slice(0, 8000)
      const tail = text.slice(-2000)
      text = head + '\n\n[...]\n\n' + tail
    }

    console.log(`Fetched ${text.length} chars of content for ${arxivId}`)
    return text
  } catch (error) {
    console.log(`Content fetch failed for ${arxivId}:`, (error as Error).message)
    return ''
  }
}


// Search recent papers from arXiv with multiple categories
async function searchArxivPapers(maxResults: number = 50, offset: number = 0): Promise<ArxivPaper[]> {
  const baseUrl = 'http://export.arxiv.org/api/query'

  // Define multiple search queries for different relevant fields
  const searchQueries = [
    `search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:cs.CV+OR+cat:cs.NE&start=${offset}&max_results=${Math.floor(maxResults/5)}`,
    `search_query=cat:stat.ML+OR+cat:cs.IR+OR+cat:cs.HC+OR+cat:cs.CR&start=${offset}&max_results=${Math.floor(maxResults/5)}`,
    `search_query=all:"machine learning"+OR+"deep learning"+OR+"neural network"+OR+"large language model"&start=${offset}&max_results=${Math.floor(maxResults/5)}`,
    `search_query=all:"transformer"+OR+"attention"+OR+"GPT"+OR+"BERT"&start=${offset}&max_results=${Math.floor(maxResults/5)}`,
    `search_query=all:"reinforcement learning"+OR+"AI ethics"+OR+"foundation model"&start=${offset}&max_results=${Math.floor(maxResults/5)}`
  ]

  const allPapers: ArxivPaper[] = []
  const seenIds = new Set<string>()

  try {
    for (const searchQuery of searchQueries) {
      const response = await fetch(`${baseUrl}?${searchQuery}`)
      const xmlText = await response.text()

      // Parse XML (simple parsing for demo)
      const entries = xmlText.split('<entry>').slice(1)

      for (const entry of entries) {
        const titleMatch = entry.match(/<title>(.*?)<\/title>/s)
        const authorMatches = entry.matchAll(/<name>(.*?)<\/name>/g)
        const abstractMatch = entry.match(/<summary>(.*?)<\/summary>/s)
        const idMatch = entry.match(/<id>(.*?)<\/id>/)
        const publishedMatch = entry.match(/<published>(.*?)<\/published>/)

        const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Unknown Title'
        const authors = Array.from(authorMatches).map(match => match[1].trim())
        const abstract = abstractMatch ? abstractMatch[1].replace(/\s+/g, ' ').trim() : ''
        const arxivId = idMatch ? idMatch[1].split('/').pop() : `paper_${Math.random()}`
        const arxivUrl = idMatch ? idMatch[1] : `https://arxiv.org/abs/${arxivId}`
        const publishedAt = publishedMatch ? publishedMatch[1] : new Date().toISOString()

        // Skip duplicates and very short abstracts
        if (!seenIds.has(arxivId) && abstract.length > 100) {
          seenIds.add(arxivId)
          allPapers.push({
            id: arxivId,
            title,
            authors,
            abstract,
            arxivUrl,
            publishedAt
          })
        }
      }
    }

    // Sort by recency and limit results
    return allPapers
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, maxResults)

  } catch (error) {
    console.error('Error fetching from arXiv:', error)
    return []
  }
}


// Filter papers for relevance using LLM batch evaluation
async function filterRelevantPapers(papers: ArxivPaper[], targetCount: number): Promise<ArxivPaper[]> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const paperList = papers.map((p, i) =>
      `[${i}] "${p.title}"\n    ${p.abstract.slice(0, 400)}`
    ).join('\n\n')

    console.log(`Filtering ${papers.length} papers down to ~${targetCount}...`)

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful research assistant. Your job is to review recent arxiv publications from the fields of AI and Computer Science and select relevant readings based on the user\'s interests. Focus on ambitious or transformational work, not incremental improvements.'
        },
        {
          role: 'user',
          content: `My AI-related technical interests include: ${USER_INTERESTS}

Here are ${papers.length} recent arXiv papers. Select the ${targetCount} most relevant ones - papers that introduce important new ideas I would enjoy or learn from. Prefer diversity across subfields.

${paperList}

Respond with JSON: {"indices": [0, 3, 7, ...]}`
        }
      ],
      max_completion_tokens: 300,
      response_format: { type: 'json_object' }
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return papers.slice(0, targetCount)

    const parsed = JSON.parse(content)
    const indices: number[] = parsed.indices || []

    const filtered = indices
      .filter(i => i >= 0 && i < papers.length)
      .map(i => papers[i])

    console.log(`Filtered ${papers.length} papers down to ${filtered.length}`)
    return filtered.length > 0 ? filtered : papers.slice(0, targetCount)
  } catch (error) {
    console.error('Error filtering papers:', error)
    return papers.slice(0, targetCount)
  }
}


// Process paper with LLM to extract tag, question, and core idea
async function processPaperWithLLM(paper: ArxivPaper): Promise<ProcessedPaper> {
  try {
    console.log('API Key available:', !!process.env.OPENAI_API_KEY)

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Fetch full content for richer analysis
    const fullContent = await fetchPaperContent(paper.id)
    const contentSection = fullContent
      ? `\n\nPaper Content (excerpts):\n${fullContent}`
      : ''

    const prompt = `Analyze this arXiv paper and extract the following information.

Paper Title: ${paper.title}
Abstract: ${paper.abstract}${contentSection}

Please provide:

1. TAG: 1-2 word topic label specific to the ML subfield (e.g., "interpretability", "inference", "synthetic data", "alignment"). Since these are all AI/ML papers, avoid generic tags like "AI" or "LLM".

2. QUESTION: The core research question that motivated this paper. What question were the authors trying to answer? Write in simple Grug-programmer style (like "Grug think big neural net better, but how make big neural net not break?"). Be specific, not generic.

3. ANSWER: The ONE core technical idea or finding from the paper. Maximum information density - like "learn f(x) + x instead of f(x)" for ResNet. Write in simple Grug-programmer style.

4. BET: The philosophical bet or assumption underlying this work. What belief about what works/doesn't work does this research reflect? Write in simple Grug-programmer style.

Format as JSON:
{
  "tag": "topic",
  "question": "Grug wonder: ...",
  "answer": "Grug solve by: ...",
  "bet": "Grug believe: ..."
}

Be concrete, specific, and information-dense. Avoid generic statements.`

    console.log('Making OpenAI API call for paper:', paper.title)

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing research papers and extracting key insights. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_completion_tokens: 600,
      response_format: { type: 'json_object' }
    })

    const responseContent = completion.choices[0]?.message?.content
    console.log('LLM Response for paper:', paper.title, '->', responseContent)

    let tag = 'ML research'
    let question = 'Q: Research question not extracted'
    let answer = 'A: Core idea not extracted'
    let bet = 'Philosophical assumption not extracted'

    if (responseContent) {
      try {
        // Clean up the response to ensure it's valid JSON
        const cleanResponse = responseContent.replace(/```json\n?|\n?```/g, '').trim()
        const extracted = JSON.parse(cleanResponse)
        tag = extracted.tag || 'ML research'
        question = extracted.question || 'Q: Research question not extracted'
        answer = extracted.answer || 'A: Core idea not extracted'
        bet = extracted.bet || 'Philosophical assumption not extracted'
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError, 'Response was:', responseContent)
      }
    }

    return {
      ...paper,
      tag,
      question,
      answer,
      bet,
      content: '' // Will be fetched on demand
    }
  } catch (error) {
    console.error('Error processing paper with LLM:', paper.title, error)
    if ((error as any).response) {
      console.error('OpenAI API Error Response:', (error as any).response.status, (error as any).response.data)
    }
  }

  return {
    ...paper,
    tag: 'ML research',
    question: 'Q: Research question not extracted',
    answer: 'A: Core idea not extracted',
    bet: 'Philosophical assumption not extracted',
    content: ''
  }
}


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '30')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Fetch a larger pool from arXiv so the filter has enough to choose from
    const fetchCount = Math.max(limit * 3, 50)
    const papers = await searchArxivPapers(fetchCount, offset)

    // Filter to the most relevant papers using LLM
    const relevantPapers = await filterRelevantPapers(papers, limit)

    // Process each filtered paper with LLM (in parallel)
    const processedPapers = await Promise.all(
      relevantPapers.map(paper => processPaperWithLLM(paper))
    )

    return NextResponse.json({
      papers: processedPapers,
      total: processedPapers.length,
      offset,
      hasMore: papers.length >= fetchCount,
      categories: ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'cs.NE', 'stat.ML', 'cs.IR', 'cs.HC', 'cs.CR']
    })
  } catch (error) {
    console.error('Error in papers API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch papers' },
      { status: 500 }
    )
  }
}
