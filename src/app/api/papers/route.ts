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
  thesis?: string
  method?: string
}

const TOPIC_TAGS = [
  'synthetic data',
  'post-training/alignment',
  'information retrieval/search',
  'embeddings',
  'interpretability',
  'program search/synthesis',
  'low-latency generation',
  'code generation',
  'agents/tool use',
  'evaluation/verification',
  'human-AI collaboration',
  'AI in society',
] as const

const USER_INTERESTS = `synthetic data, post-training/alignment methods, information retrieval/search, embeddings, interpretability (mechanistic interpretability, representation engineering - understanding what models learn and why), program search/synthesis (using search or learning to write programs as a way to solve problems), low-latency LLM generation (radical 100-1000x speedups like speculative decoding or new architectures, NOT incremental training or optimizer improvements), code generation, agents and tool use, evaluation/verification (especially where ground truth is hard to obtain), new modes of human-AI collaboration and UX for scientific computing, AI's impact on and role in society.

NOT interested in: training optimizer tweaks (Adam variants, learning rate schedules, gradient flow improvements, convergence speedups), incremental model architecture changes (yet another attention variant), standard benchmark improvements without new ideas, differential privacy, pure fairness/ethics frameworks without technical novelty.`


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


// Search recent papers from arXiv, sorted by submission date
async function searchArxivPapers(maxResults: number = 50, offset: number = 0): Promise<ArxivPaper[]> {
  const baseUrl = 'http://export.arxiv.org/api/query'

  // Broad category-based queries sorted by newest first.
  // We fetch more than needed from each and deduplicate, since there's overlap.
  const categories = [
    'cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:cs.NE+OR+cat:cs.IR+OR+cat:cs.HC',
    'cat:cs.SE+OR+cat:cs.PL+OR+cat:cs.MA+OR+cat:stat.ML'
  ]

  const perQuery = Math.ceil(maxResults / categories.length)
  const searchQueries = categories.map(cats =>
    `search_query=${cats}&start=${offset}&max_results=${perQuery}&sortBy=submittedDate&sortOrder=descending`
  )

  const allPapers: ArxivPaper[] = []
  const seenIds = new Set<string>()

  // Only keep papers from the last 7 days
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7)

  try {
    for (const searchQuery of searchQueries) {
      const response = await fetch(`${baseUrl}?${searchQuery}`)
      const xmlText = await response.text()

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

        const publishedDate = new Date(publishedAt)

        // Skip duplicates, short abstracts, and papers older than 7 days
        if (!seenIds.has(arxivId) && abstract.length > 100 && publishedDate >= cutoffDate) {
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

    console.log(`Fetched ${allPapers.length} papers from last 7 days`)

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

    const response = await openai.responses.create({
      model: 'gpt-5.2',
      input: [
        {
          role: 'system',
          content: 'You are a helpful research assistant. Your job is to review recent arxiv publications from the fields of AI and Computer Science and select relevant readings based on the user\'s interests. Focus on ambitious or transformational work, not incremental improvements.'
        },
        {
          role: 'user',
          content: `My AI-related technical interests:

${USER_INTERESTS}

Here are ${papers.length} recent arXiv papers. Select the ${targetCount} most relevant ones. I want papers that introduce genuinely new ideas or directions - things that shift how we think about a problem. Be strict: if a paper is just an incremental improvement or doesn't clearly connect to my interests, skip it. When in doubt about whether something matches an interest, consider whether I'd learn a new *idea* from it vs. just a new *result*. Prefer diversity across subfields.

${paperList}

Respond with JSON: {"indices": [0, 3, 7, ...]}`
        }
      ],
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'paper_filter',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              indices: { type: 'array', items: { type: 'integer' } }
            },
            required: ['indices'],
            additionalProperties: false
          }
        }
      }
    })

    const content = response.output_text
    if (!content) return papers.slice(0, targetCount)

    const parsed = JSON.parse(content)
    const indices: number[] = parsed.indices

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

    const prompt = `Extract 4 fields from this paper. Each field must be ONE short sentence - something you can read in under 3 seconds. Plain language, no jargon, but don't lose the actual idea.

Paper Title: ${paper.title}
Abstract: ${paper.abstract}${contentSection}

1. TAG: 1-2 word subfield label (e.g., "interpretability", "speculative decoding", "synthetic data"). Not "AI" or "LLM".
2. QUESTION: Frame the core problem or tension as an open-ended question. NOT "can X do Y?" or "is X possible?" — instead frame it as "how should we...", "what's the best way to...", or "why does X happen?" The reader should be able to form their own thesis in response. For ResNet: "How do you train a 100+ layer net without gradients vanishing?"
3. THESIS: The belief about the world that motivated this work. This is NOT a summary of the paper - it's the pre-existing conviction that led the researchers to pursue this approach in the first place. It should be something you could disagree with. Think "why this approach?" not "what did they do?" For ResNet: "Deeper is better if you can get gradients to flow."
4. METHOD: The specific technical trick that operationalizes the thesis. The "how." For ResNet: "Learn f(x)+x instead of f(x) — each layer learns a small correction."

{"tag": "...", "question": "...", "thesis": "...", "method": "..."}`

    console.log('Making OpenAI API call for paper:', paper.title)

    const response = await openai.responses.create({
      model: 'gpt-5.2',
      input: [
        {
          role: 'system',
          content: 'You are an expert at analyzing research papers and extracting key insights. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'paper_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              tag: { type: 'string', enum: [...TOPIC_TAGS] },
              question: { type: 'string' },
              thesis: { type: 'string' },
              method: { type: 'string' }
            },
            required: ['tag', 'question', 'thesis', 'method'],
            additionalProperties: false
          }
        }
      }
    })

    const responseContent = response.output_text
    console.log('LLM Response for paper:', paper.title, '->', responseContent)

    let tag = 'ML research'
    let question = ''
    let thesis = ''
    let method = ''

    if (responseContent) {
      try {
        const cleanResponse = responseContent.replace(/```json\n?|\n?```/g, '').trim()
        const extracted = JSON.parse(cleanResponse)
        tag = extracted.tag || 'ML research'
        question = extracted.question || ''
        thesis = extracted.thesis || ''
        method = extracted.method || ''
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError, 'Response was:', responseContent)
      }
    }

    return {
      ...paper,
      tag,
      question,
      thesis,
      method,
      content: ''
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
    question: '',
    thesis: '',
    method: '',
    content: ''
  }
}


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '30')
    const excludeParam = searchParams.get('exclude') || ''
    const excludeIds = new Set(excludeParam ? excludeParam.split(',') : [])

    // Fetch a larger pool from arXiv so the filter has enough to choose from
    const fetchCount = Math.max(limit * 3, 50)
    const allPapers = await searchArxivPapers(fetchCount + excludeIds.size)
    const papers = allPapers.filter(p => !excludeIds.has(p.id))

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
