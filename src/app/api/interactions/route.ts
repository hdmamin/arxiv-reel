import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'


export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const interaction = await db.interaction.create({
      data: {
        paperId: body.paperId,
        paperTitle: body.paperTitle,
        paperTag: body.paperTag || null,
        question: body.question,
        thesisGuess: body.thesisGuess,
        methodGuess: body.methodGuess,
        realThesis: body.realThesis,
        realMethod: body.realMethod,
        thesisFeedback: body.thesisFeedback || null,
        methodFeedback: body.methodFeedback || null,
        overallFeedback: body.overallFeedback || null,
      },
    })

    return NextResponse.json({ id: interaction.id })
  } catch (error) {
    console.error('Error saving interaction:', error)
    return NextResponse.json(
      { error: 'Failed to save interaction' },
      { status: 500 }
    )
  }
}


export async function GET(request: NextRequest) {
  try {
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')

    const interactions = await db.interaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ interactions, total: interactions.length })
  } catch (error) {
    console.error('Error fetching interactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch interactions' },
      { status: 500 }
    )
  }
}
