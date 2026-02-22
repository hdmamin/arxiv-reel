import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'


export async function POST(request: NextRequest) {
  try {
    const { question, thesisGuess, methodGuess, realThesis, realMethod } = await request.json()

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const response = await openai.responses.create({
      model: 'gpt-5.2',
      input: [
        {
          role: 'system',
          content: `You are a constructive research mentor. A user is practicing their scientific thinking by guessing a paper's thesis and method before seeing the real answers. Give brief, specific feedback that highlights what they got right, what they missed, and what the difference reveals about the research landscape. Be encouraging but honest. 2-3 sentences per field max.`
        },
        {
          role: 'user',
          content: `Question the paper addresses: ${question}

Thesis (the belief about the world that motivated the work):
- User's guess: ${thesisGuess}
- Paper's actual thesis: ${realThesis}

Method (the specific technical approach):
- User's guess: ${methodGuess}
- Paper's actual method: ${realMethod}

Give constructive feedback on each guess, then a short overall reflection on what the user can take away.`
        }
      ],
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'guess_feedback',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              thesis_feedback: { type: 'string' },
              method_feedback: { type: 'string' },
              overall: { type: 'string' }
            },
            required: ['thesis_feedback', 'method_feedback', 'overall'],
            additionalProperties: false
          }
        }
      }
    })

    const parsed = JSON.parse(response.output_text)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Error generating feedback:', error)
    return NextResponse.json(
      { error: 'Failed to generate feedback' },
      { status: 500 }
    )
  }
}
