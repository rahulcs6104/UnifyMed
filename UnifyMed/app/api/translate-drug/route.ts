import { type NextRequest, NextResponse } from "next/server"

interface RxNormCandidate {
  rxcui: string
  score: string
  rank: string
}

interface RxNormProperties {
  rxcui: string
  name: string
  synonym: string
  tty: string
  language: string
  suppress: string
  umlscui: string
}

interface RxNormResponse {
  properties?: RxNormProperties
  error?: string
}

async function getRxNorm(drugName: string): Promise<RxNormResponse> {
  try {
    // Step 1: Search approximate term
    const searchUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(drugName)}&maxEntries=1`
    const searchResponse = await fetch(searchUrl)
    const searchData = await searchResponse.json()

    const candidates = searchData?.approximateGroup?.candidate || []
    if (!candidates.length) {
      return { error: "Drug not found in RxNorm" }
    }

    // Take the first candidate
    const rxcui = candidates[0].rxcui

    // Step 2: Get detailed properties
    const propertiesUrl = `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`
    const propertiesResponse = await fetch(propertiesUrl)
    const propertiesData = await propertiesResponse.json()

    const properties = propertiesData?.properties
    if (!properties) {
      return { error: "Could not retrieve drug properties" }
    }

    return { properties }
  } catch (error) {
    return { error: `API error: ${error instanceof Error ? error.message : "Unknown error"}` }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { drugName } = await request.json()

    if (!drugName) {
      return NextResponse.json({ error: "Drug name is required" }, { status: 400 })
    }

    console.log("[v0] Translating drug name:", drugName)
    const result = await getRxNorm(drugName)

    if (result.error) {
      console.log("[v0] Drug translation error:", result.error)
      return NextResponse.json(result, { status: 404 })
    }

    console.log("[v0] Drug translation successful:", result.properties?.name)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Drug translation API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
