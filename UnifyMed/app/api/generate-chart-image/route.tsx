import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  console.log("[v0] Chart image generation API called")

  try {
    const { metrics, chartType = "line" } = await request.json()

    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      return NextResponse.json({ error: "No metrics provided" }, { status: 400 })
    }

    console.log("[v0] Generating chart for", metrics.length, "metrics")

    // Group metrics by type for better visualization
    const metricGroups = metrics.reduce((groups: Record<string, any[]>, metric: any) => {
      const key = metric.metric
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(metric)
      return groups
    }, {})

    // Create SVG chart for the most common metric type
    const mostCommonMetric = Object.entries(metricGroups).reduce((a, b) => (a[1].length > b[1].length ? a : b))

    const [metricName, values] = mostCommonMetric
    const sortedValues = values.sort((a: any, b: any) => {
      if (a.date && b.date) {
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      }
      return a.source.localeCompare(b.source)
    })

    // Generate SVG chart
    const width = 600
    const height = 400
    const margin = { top: 40, right: 40, bottom: 60, left: 80 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    // Calculate scales
    const maxValue = Math.max(...sortedValues.map((v: any) => v.value))
    const minValue = Math.min(...sortedValues.map((v: any) => v.value))
    const valueRange = maxValue - minValue || 1

    const svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            .chart-title { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #333; }
            .axis-label { font-family: Arial, sans-serif; font-size: 12px; fill: #666; }
            .grid-line { stroke: #e0e0e0; stroke-width: 1; }
            .data-line { stroke: #2563eb; stroke-width: 2; fill: none; }
            .data-point { fill: #2563eb; stroke: white; stroke-width: 2; }
          </style>
        </defs>
        
        <!-- Background -->
        <rect width="${width}" height="${height}" fill="white"/>
        
        <!-- Title -->
        <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
          ${metricName} Trend
        </text>
        
        <!-- Chart area background -->
        <rect x="${margin.left}" y="${margin.top}" width="${chartWidth}" height="${chartHeight}" 
              fill="#fafafa" stroke="#e0e0e0"/>
        
        <!-- Grid lines -->
        ${Array.from({ length: 5 }, (_, i) => {
          const y = margin.top + (chartHeight * i) / 4
          return `<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartWidth}" y2="${y}" class="grid-line"/>`
        }).join("")}
        
        <!-- Y-axis labels -->
        ${Array.from({ length: 5 }, (_, i) => {
          const value = maxValue - (valueRange * i) / 4
          const y = margin.top + (chartHeight * i) / 4
          return `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="axis-label">
            ${value.toFixed(1)}
          </text>`
        }).join("")}
        
        <!-- Data line and points -->
        ${
          sortedValues.length > 1
            ? `
          <polyline points="${sortedValues
            .map((v: any, i: number) => {
              const x = margin.left + (chartWidth * i) / (sortedValues.length - 1)
              const y = margin.top + chartHeight - ((v.value - minValue) / valueRange) * chartHeight
              return `${x},${y}`
            })
            .join(" ")}" class="data-line"/>
        `
            : ""
        }
        
        <!-- Data points -->
        ${sortedValues
          .map((v: any, i: number) => {
            const x =
              margin.left + (sortedValues.length > 1 ? (chartWidth * i) / (sortedValues.length - 1) : chartWidth / 2)
            const y = margin.top + chartHeight - ((v.value - minValue) / valueRange) * chartHeight
            return `<circle cx="${x}" cy="${y}" r="4" class="data-point"/>`
          })
          .join("")}
        
        <!-- X-axis labels -->
        ${sortedValues
          .map((v: any, i: number) => {
            const x =
              margin.left + (sortedValues.length > 1 ? (chartWidth * i) / (sortedValues.length - 1) : chartWidth / 2)
            const label = v.date ? new Date(v.date).toLocaleDateString() : `Doc ${i + 1}`
            return `<text x="${x}" y="${height - 20}" text-anchor="middle" class="axis-label">
            ${label}
          </text>`
          })
          .join("")}
        
        <!-- Y-axis title -->
        <text x="20" y="${height / 2}" text-anchor="middle" transform="rotate(-90 20 ${height / 2})" class="axis-label">
          ${values[0].unit}
        </text>
        
        <!-- Legend -->
        <rect x="${width - 150}" y="50" width="140" height="60" fill="white" stroke="#ccc" rx="5"/>
        <circle cx="${width - 135}" cy="70" r="4" class="data-point"/>
        <text x="${width - 125}" y="75" class="axis-label">${metricName}</text>
        <text x="${width - 135}" y="90" class="axis-label">Values: ${sortedValues.length}</text>
        <text x="${width - 135}" y="105" class="axis-label">Range: ${minValue.toFixed(1)} - ${maxValue.toFixed(1)}</text>
      </svg>
    `

    // Convert SVG to base64 for embedding in PDF
    const svgBase64 = Buffer.from(svgContent).toString("base64")

    console.log("[v0] Generated SVG chart successfully")

    return NextResponse.json({
      chartSvg: svgContent,
      chartBase64: svgBase64,
      metricName,
      dataPoints: sortedValues.length,
    })
  } catch (error) {
    console.error("[v0] Chart generation error:", error)
    return NextResponse.json(
      {
        error: "Failed to generate chart",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
