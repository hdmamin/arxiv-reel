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

// Fetch and extract full paper content from PDF
async function fetchFullPaperContent(arxivId: string): Promise<string> {
  try {
    // Construct PDF URL
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`
    
    // Download PDF
    const response = await fetch(pdfUrl)
    if (!response.ok) {
      console.log(`Failed to fetch PDF for ${arxivId}: ${response.status}`)
      return ''
    }
    
    const buffer = await response.arrayBuffer()
    
    // Extract text from PDF
    const pdfData = await pdfparse(Buffer.from(buffer))
    const text = pdfData.text
    
    // Clean up the extracted text
    const cleanedText = text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n\n') // Replace multiple newlines with double newline
      .trim()
    
    console.log(`Extracted ${cleanedText.length} characters from ${arxivId}`)
    return cleanedText
  } catch (error) {
    console.error(`Error fetching full content for ${arxivId}:`, error)
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

// Process paper with LLM to extract tag, question, and core idea
async function processPaperWithLLM(paper: ArxivPaper): Promise<ProcessedPaper> {
  try {
    console.log('API Key available:', !!process.env.OPENAI_API_KEY)

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const prompt = `Analyze this arXiv paper and extract the following information. This is for a literature review of LLM, symbolic AI, and related ML research.

Paper Title: ${paper.title}
Abstract: ${paper.abstract}

Please provide:

1. TAG: An extremely quick 1-2 word topic label (e.g., "interpretability", "inference", "synthetic data", "alignment"). Since these are all AI/ML papers, don't use generic tags like "AI" or "LLM" - be specific about the subfield.

2. QUESTION: Put yourself in the researchers' minds. Before they wrote this paper, what was the core question that motivated it? They were likely bumping up against the bounds of existing knowledge - what question extended beyond that boundary? Write in simple Grug-programmer style (like "Grug think big neural net better, but how make big neural net not break?"). Be specific, not generic.

3. ANSWER: The ONE core idea from the paper. Think of the ResNet example: the answer would be "learn f(x) + x instead of f(x)". Maximum information density - provide as much intuition as possible in a single sentence or fragment. Write in simple Grug-programmer style (like "Grug add skip connections so gradient flow better").

4. BET: Research is opinionated - researchers bet on what works and what doesn't. What philosophical bet or assumption underlies this work? For GPT-2, the bet might be "scaling beats handcrafted algorithmic advances". Write in simple Grug-programmer style (like "Grug think more data always better than clever algorithm").

Format your response as JSON:
{
  "tag": "topic",
  "question": "Grug wonder: specific research question in simple terms?",
  "answer": "Grug solve by: core technical idea in simple terms",
  "bet": "Grug believe: philosophical assumption in simple terms"
}

Be concrete, specific, and information-dense. Write like Grug programmer - simple, direct, caveman-style language. Avoid generic statements.`

    console.log('Making OpenAI API call for paper:', paper.title)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
      max_completion_tokens: 300,
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

    // Fetch full paper content (commented out for faster initial loading)
    // console.log(`Fetching full content for ${paper.id}...`)
    // const fullContent = await fetchFullPaperContent(paper.id)
    
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
    if (error.response) {
      console.error('OpenAI API Error Response:', error.response.status, error.response.data)
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
    
    // Fetch papers from arXiv with expanded search
    const papers = await searchArxivPapers(limit, offset)
    
    // Process each paper with LLM (in parallel for efficiency, but limit concurrency)
    const processedPapers = await Promise.all(
      papers.map(paper => processPaperWithLLM(paper))
    )
    
    return NextResponse.json({
      papers: processedPapers,
      total: processedPapers.length,
      offset,
      hasMore: processedPapers.length >= limit,
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