"use server"
import { NextRequest, NextResponse } from 'next/server'
import { getStationHourlyData } from '@/services/irristratService'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stationID: string }> }
) {
  try {
    // Await the params to extract stationID
    const { stationID } = await params

    const data = await getStationHourlyData(stationID)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800' // 1 hour cache, stale for 30 more minutes
      }
    })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `Erro horários` },
      { status: 500 }
    )
  }
}
