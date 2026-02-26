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
          content: `You are a constructive research mentor. A user is practicing scientific thinking by proposing their own thesis and method for a research question, then comparing with what one paper actually did. The paper's approach is ONE valid path, not the ground truth — the user's idea may be equally valid, complementary, or address a different angle entirely. Evaluate the user's ideas on their own merits: are they coherent, creative, and well-reasoned? Then note what's interesting about the contrast with the paper's approach. 2-3 sentences per field max.

Finally, generate a follow-up question that pushes the user UP the abstraction ladder — away from implementation details and toward evaluating their own thinking, examining assumptions, or connecting to the bigger picture. The question should be specific to this paper and these ideas, not generic. Examples of the TYPE of question (do not copy these literally):
- "What's the minimum evidence that would convince you their thesis better describes reality than yours?"
- "What assumption are you and the authors both making that might be wrong?"
- "If you could only run one experiment to distinguish your approach from theirs, what would it be?"
- "What would the field look like in 5 years if their thesis is right? What about yours?"
- "Is there a third thesis that explains both your intuition and their results?"
- "What adjacent problem would become easy to solve if your thesis is correct?"
- "Where did your intuition for this thesis come from — what prior experience or paper shaped it?"
- "If someone combined the strongest part of your approach with the strongest part of theirs, what would that look like?"`
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
              overall: { type: 'string' },
              followup: { type: 'string' }
            },
            required: ['thesis_feedback', 'method_feedback', 'overall', 'followup'],
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
