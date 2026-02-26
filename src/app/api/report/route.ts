import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'


export async function POST(request: NextRequest) {
  try {
    const { interactions } = await request.json()

    if (!interactions || interactions.length === 0) {
      return NextResponse.json({ report: 'No interactions to analyze.' })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const summary = interactions.map((i: any, idx: number) =>
      `[${idx + 1}] "${i.paperTitle}" (${i.paperTag || 'untagged'})
  Question: ${i.question}
  Their thesis: ${i.realThesis}
  Your thesis: ${i.thesisGuess}
  Their method: ${i.realMethod}
  Your method: ${i.methodGuess}
  Feedback: ${i.overallFeedback || 'none'}`
    ).join('\n\n')

    const response = await openai.responses.create({
      model: 'gpt-5.2',
      input: [
        {
          role: 'system',
          content: `You are analyzing a researcher's practice sessions where they guess the thesis and method of ML papers before seeing the real answers. Provide a concise, specific analysis — not generic encouragement. Use concrete examples from their actual guesses.`
        },
        {
          role: 'user',
          content: `Here are my ${interactions.length} most recent paper exercises:\n\n${summary}\n\nAnalyze my patterns across these sessions:
1. Which subfields do I predict well vs poorly?
2. What recurring mental models or assumptions show up in my guesses?
3. What types of approaches do I consistently miss or underweight?
4. Any improvement trajectory visible over time?

Be specific — reference particular papers and guesses. Keep it to 3-4 short paragraphs.`
        }
      ],
      text: { verbosity: 'low' },
    })

    return NextResponse.json({ report: response.output_text })
  } catch (error) {
    console.error('Error generating report:', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}
