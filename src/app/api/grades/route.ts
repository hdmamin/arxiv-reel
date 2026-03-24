import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'


const VALID_GRADES = ['A', 'B', 'C', 'D', 'F']

export async function PUT(request: NextRequest) {
  try {
    const { paperId, grade } = await request.json()

    if (!paperId || !VALID_GRADES.includes(grade)) {
      return NextResponse.json(
        { error: `Invalid grade. Must be one of: ${VALID_GRADES.join(', ')}` },
        { status: 400 }
      )
    }

    const result = await db.paperGrade.upsert({
      where: { paperId },
      update: { grade },
      create: { paperId, grade },
    })

    return NextResponse.json({ id: result.id, grade: result.grade })
  } catch (error) {
    console.error('Error saving grade:', error)
    return NextResponse.json(
      { error: 'Failed to save grade' },
      { status: 500 }
    )
  }
}


export async function GET(request: NextRequest) {
  try {
    const paperId = request.nextUrl.searchParams.get('paperId')

    if (paperId) {
      const grade = await db.paperGrade.findUnique({ where: { paperId } })
      return NextResponse.json({ grade: grade?.grade || null })
    }

    const grades = await db.paperGrade.findMany({
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ grades })
  } catch (error) {
    console.error('Error fetching grades:', error)
    return NextResponse.json(
      { error: 'Failed to fetch grades' },
      { status: 500 }
    )
  }
}
