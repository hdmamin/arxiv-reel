import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'


export async function POST(request: NextRequest) {
  try {
    const {
      title, abstract, content, question, thesis, method,
      thesisGuess, methodGuess, feedback,
      mode, stage,
      messages,
    } = await request.json()

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Build paper context
    const paperContext = [
      `Title: ${title}`,
      `Abstract: ${abstract}`,
      content ? `\nPaper Content (excerpts):\n${content}` : '',
    ].filter(Boolean).join('\n')

    let systemPrompt: string

    if (mode === 'active' && (stage === 1 || stage === 2)) {
      // Pre-guess: help them think without spoiling the answer
      systemPrompt = `You're discussing a research paper with an ML researcher who is practicing their scientific thinking. They are trying to guess the paper's thesis and method on their own.

IMPORTANT: Do NOT reveal the paper's thesis, method, or key results. Help them think through the problem, clarify the question being asked, and reason about possible approaches — but let them discover the answer themselves.

Paper context:
${paperContext}

The question being explored: ${question}

Keep responses concise (2-4 sentences). Be a helpful thinking partner, not an answer key.`
    } else {
      // Post-feedback or passive: discuss freely
      const fullContext = [
        paperContext,
        `\nQuestion: ${question}`,
        `Thesis: ${thesis}`,
        `Method: ${method}`,
      ]

      if (thesisGuess || methodGuess) {
        fullContext.push(`\nUser's thesis guess: ${thesisGuess || '(none)'}`)
        fullContext.push(`User's method guess: ${methodGuess || '(none)'}`)
      }
      if (feedback) {
        fullContext.push(`\nFeedback on thesis guess: ${feedback.thesisFeedback || ''}`)
        fullContext.push(`Feedback on method guess: ${feedback.methodFeedback || ''}`)
        fullContext.push(`Overall feedback: ${feedback.overall || ''}`)
      }

      systemPrompt = `You're discussing a research paper with an ML researcher. Answer their questions, explore implications, debate ideas, and help them think deeply about the work. Be concise but substantive (2-4 sentences unless they ask for more detail).

${fullContext.join('\n')}`
    }

    const input = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    const response = await openai.responses.create({
      model: 'gpt-5.2',
      input,
      text: { verbosity: 'low' },
    })

    return NextResponse.json({ response: response.output_text })
  } catch (error) {
    console.error('Error in chat API:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
