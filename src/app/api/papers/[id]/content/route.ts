import { NextRequest, NextResponse } from 'next/server'

// Fetch and extract full paper content from arXiv
async function fetchFullPaperContent(arxivId: string): Promise<string> {
  try {
    // Method 1: Try arXiv's text format API
    console.log(`Trying text format for ${arxivId}...`)
    const textUrl = `https://arxiv.org/e-print/${arxivId}`
    
    try {
      const textResponse = await fetch(textUrl)
      if (textResponse.ok) {
        const buffer = await textResponse.arrayBuffer()
        
        // Try to detect if it's a gzip compressed file
        const uint8Array = new Uint8Array(buffer)
        
        // Check for gzip magic number (1f 8b)
        if (uint8Array[0] === 0x1f && uint8Array[1] === 0x8b) {
          console.log(`Detected gzip compressed file for ${arxivId}`)
          // For now, skip gzip extraction as it requires additional libraries
          throw new Error('Gzip compression detected')
        }
        
        // Try to decode as text
        const decoder = new TextDecoder('utf-8', { fatal: false })
        let text = decoder.decode(buffer)
        
        // If the text contains too many non-printable characters, it's probably binary
        const printableChars = text.replace(/[^\x20-\x7E\n\r\t]/g, '').length
        const totalChars = text.length
        
        if (printableChars / totalChars < 0.7) {
          console.log(`Content appears to be binary (${printableChars}/${totalChars} printable) for ${arxivId}`)
          throw new Error('Binary content detected')
        }
        
        if (text.length > 1000) {
          console.log(`Extracted ${text.length} characters from text format for ${arxivId}`)
          return text
        }
      }
    } catch (error) {
      console.log(`Text format failed for ${arxivId}:`, error.message)
    }
    
    // Method 2: Try HTML version with better extraction
    console.log(`Trying HTML extraction for ${arxivId}...`)
    const htmlUrl = `https://arxiv.org/html/${arxivId}`
    
    try {
      const htmlResponse = await fetch(htmlUrl)
      if (htmlResponse.ok) {
        const html = await htmlResponse.text()
        
        // Better HTML text extraction
        let text = html
          // Remove script and style elements
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          // Remove HTML tags but preserve line breaks
          .replace(/<[^>]*>/g, ' ')
          // Clean up whitespace
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim()
        
        // Remove common arXiv header/footer text
        text = text
          .replace(/arXiv:\d+\.\d+v\d+\s*\[\w+\.\w+\]\s*\d+\s*\w+\s*\d+/g, '')
          .replace(/Abstract\s*\.\s*/g, '')
          .replace(/References\s*\.\s*$/g, '')
        
        if (text.length > 1000) {
          console.log(`Extracted ${text.length} characters from HTML for ${arxivId}`)
          return text
        }
      }
    } catch (error) {
      console.log(`HTML extraction failed for ${arxivId}:`, error.message)
    }
    
    // Method 3: Try to get LaTeX source and extract text
    console.log(`Trying LaTeX source for ${arxivId}...`)
    try {
      const latexResponse = await fetch(`https://arxiv.org/e-print/${arxivId}`)
      if (latexResponse.ok) {
        const latex = await latexResponse.text()
        
        // Extract text from LaTeX
        let text = latex
          .removeComments()
          .replace(/\\[a-zA-Z]+\{[^}]*\}/g, '') // Remove LaTeX commands
          .replace(/[^a-zA-Z0-9\s.,;:!?()-]/g, ' ') // Keep only basic chars
          .replace(/\s+/g, ' ')
          .trim()
        
        if (text.length > 1000) {
          console.log(`Extracted ${text.length} characters from LaTeX for ${arxivId}`)
          return text
        }
      }
    } catch (error) {
      console.log(`LaTeX extraction failed for ${arxivId}:`, error.message)
    }
    
    // If all methods fail, return a more informative message
    console.log(`All extraction methods failed for ${arxivId}`)
    return `Full paper content extraction is currently unavailable for this paper.\n\nPaper ID: ${arxivId}\nDirect PDF link: https://arxiv.org/pdf/${arxivId}.pdf\n\nThe automatic text extraction encountered issues. Please use the arXiv link above to view the full paper directly.`
    
  } catch (error) {
    console.error(`Error fetching full content for ${arxivId}:`, error)
    return `Error fetching paper content for ${arxivId}. Please visit arXiv directly.`
  }
}

// Helper function to remove LaTeX comments
String.prototype.removeComments = function() {
  return this.replace(/%.*$/gm, '')
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const arxivId = params.id
    
    if (!arxivId) {
      return NextResponse.json(
        { error: 'Paper ID is required' },
        { status: 400 }
      )
    }

    // Fetch full paper content
    const content = await fetchFullPaperContent(arxivId)
    
    return NextResponse.json({
      id: arxivId,
      content,
      hasContent: content.length > 0
    })
  } catch (error) {
    console.error('Error in paper content API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch paper content' },
      { status: 500 }
    )
  }
}