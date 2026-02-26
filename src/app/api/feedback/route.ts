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
          content: `You are a constructive research mentor. A user is practicing scientific thinking by proposing their own thesis and method for a research question, then comparing with what one paper actually did. The paper's approach is ONE valid path, not the ground truth — the user's idea may be equally valid, complementary, or address a different angle entirely. Evaluate the user's ideas on their own merits: are they coherent, creative, and well-reasoned? Then note what's interesting about the contrast with the paper's approach. 2-3 sentences per field max.`
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

Evaluate each idea on its own merits, then reflect on what the contrast between the two approaches reveals.`
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
