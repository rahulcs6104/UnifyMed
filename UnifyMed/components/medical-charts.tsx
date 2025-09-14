"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts"

interface MedicalMetric {
  metric: string
  value: number
  unit: string
  date?: string
  interpretation?: string
  medication?: string
  source: string
}

interface MedicalChartsProps {
  metrics: MedicalMetric[]
}

export function MedicalCharts({ metrics }: MedicalChartsProps) {
  if (!metrics || metrics.length === 0) {
    return (
      <Card className="border-2 border-border bg-card shadow-lg">
        <CardHeader className="bg-primary text-primary-foreground">
          <CardTitle className="flex items-center gap-3 text-xl">
            <span className="text-2xl">📊</span>
            Medical Data Visualization
          </CardTitle>
          <CardDescription className="text-primary-foreground/80 text-base">
            No numerical medical data found for charting
          </CardDescription>
        </CardHeader>
        <CardContent className="bg-card text-card-foreground">
          <p className="text-muted-foreground pt-6 leading-relaxed">
            Upload medical documents with numerical values (blood pressure, glucose, etc.) to see charts here.
          </p>
        </CardContent>
      </Card>
    )
  }

  const medications = metrics.filter((metric) => metric.medication)
  const regularMetrics = metrics.filter((metric) => !metric.medication)

  // Group regular metrics by type for better visualization
  const metricGroups = regularMetrics.reduce(
    (groups, metric) => {
      const key = metric.metric
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(metric)
      return groups
    },
    {} as Record<string, MedicalMetric[]>,
  )

  // Create chart data for metrics with multiple values
  const chartableMetrics = Object.entries(metricGroups).filter(([_, values]) => values.length > 1)
  const singleMetrics = Object.entries(metricGroups).filter(([_, values]) => values.length === 1)

  const getInterpretationBadgeClass = (interpretation?: string) => {
    const baseClasses = "inline-block px-3 py-1 rounded-full text-sm font-medium border whitespace-nowrap"

    if (!interpretation) {
      return `${baseClasses} bg-secondary/20 text-muted-foreground border-secondary/30`
    }

    const lowerInterpretation = interpretation.toLowerCase()

    if (lowerInterpretation.includes("normal")) {
      return `${baseClasses} bg-green-500/20 text-green-400 border-green-500/30`
    }

    if (lowerInterpretation.includes("high") || lowerInterpretation.includes("elevated")) {
      return `${baseClasses} bg-red-500/20 text-red-400 border-red-500/30`
    }

    if (lowerInterpretation.includes("low")) {
      return `${baseClasses} bg-yellow-500/20 text-yellow-400 border-yellow-500/30`
    }

    return `${baseClasses} bg-secondary/20 text-muted-foreground border-secondary/30`
  }

  return (
    <div className="space-y-6">
      {medications.length > 0 && (
        <Card className="border-2 border-border bg-card shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
            <CardTitle className="flex items-center gap-3 text-xl">
              <span className="text-2xl">💊</span>
              Current Medications
            </CardTitle>
            <CardDescription className="text-white/80 text-base">
              Found {medications.length} medication(s) with English translations
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-card text-card-foreground p-6">
            <div className="grid gap-4">
              {medications.map((medication, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <div>
                      <h4 className="font-semibold text-lg text-blue-700 dark:text-blue-300">
                        {medication.medication}
                      </h4>
                      {medication.interpretation && medication.interpretation !== medication.medication && (
                        <p className="text-sm text-muted-foreground mt-1">{medication.interpretation}</p>
                      )}
                    </div>
                  </div>
                  {medication.date && <div className="text-sm text-muted-foreground">{medication.date}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {regularMetrics.length > 0 && (
        <Card className="border-2 border-border bg-card shadow-lg">
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle className="flex items-center gap-3 text-xl">
              <span className="text-2xl">📊</span>
              Medical Data Visualization
            </CardTitle>
            <CardDescription className="text-primary-foreground/80 text-base">
              Found {regularMetrics.length} medical measurements across {Object.keys(metricGroups).length} different
              metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-card text-card-foreground">
            <div className="pt-6">
              {chartableMetrics.length > 0 && (
                <div className="space-y-6">
                  <h4 className="font-semibold text-xl text-primary">Trends Over Time</h4>
                  {chartableMetrics.map(([metricName, values]) => {
                    // Sort by date if available, otherwise by source
                    const sortedValues = values.sort((a, b) => {
                      if (a.date && b.date) {
                        return new Date(a.date).getTime() - new Date(b.date).getTime()
                      }
                      return a.source.localeCompare(b.source)
                    })

                    const chartData = sortedValues.map((metric, index) => ({
                      name: metric.date || `Document ${index + 1}`,
                      value: metric.value,
                      unit: metric.unit,
                      source: metric.source,
                      interpretation: metric.interpretation,
                    }))

                    return (
                      <Card key={metricName} className="p-6 border border-border bg-card/50">
                        <h5 className="font-medium mb-4 text-foreground text-lg">
                          {metricName} ({values[0].unit})
                        </h5>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                            <XAxis dataKey="name" tick={{ fill: "#FFFFFF", fontSize: 12 }} />
                            <YAxis
                              label={{
                                value: values[0].unit,
                                angle: -90,
                                position: "insideLeft",
                                style: { textAnchor: "middle", fill: "#FFFFFF" },
                              }}
                              tick={{ fill: "#FFFFFF", fontSize: 12 }}
                            />
                            <Tooltip
                              formatter={(value, name, props) => [`${value} ${props.payload.unit}`, metricName]}
                              labelFormatter={(label) => `Source: ${label}`}
                              contentStyle={{
                                backgroundColor: "#1A1A1A",
                                border: "2px solid #EDC001",
                                borderRadius: "8px",
                                color: "#FFFFFF",
                                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="#EDC001"
                              strokeWidth={3}
                              dot={{ fill: "#EDC001", strokeWidth: 2, r: 6 }}
                              activeDot={{ r: 8, fill: "#EDC001", stroke: "#FFFFFF", strokeWidth: 2 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Card>
                    )
                  })}
                </div>
              )}

              {singleMetrics.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-xl text-primary">Individual Measurements</h4>
                  <Card className="p-6 border border-border bg-card/50">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={singleMetrics.map(([name, values]) => ({
                          name: name.length > 15 ? name.substring(0, 15) + "..." : name,
                          fullName: name,
                          value: values[0].value,
                          unit: values[0].unit,
                          interpretation: values[0].interpretation,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                        <XAxis dataKey="name" tick={{ fill: "#FFFFFF", fontSize: 12 }} />
                        <YAxis
                          label={{
                            value: "Value",
                            angle: -90,
                            position: "insideLeft",
                            style: { textAnchor: "middle", fill: "#FFFFFF" },
                          }}
                          tick={{ fill: "#FFFFFF", fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(value, name, props) => [`${value} ${props.payload.unit}`, props.payload.fullName]}
                          contentStyle={{
                            backgroundColor: "#1A1A1A",
                            border: "2px solid #EDC001",
                            borderRadius: "8px",
                            color: "#FFFFFF",
                            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                          }}
                        />
                        <Bar dataKey="value" fill="#EDC001" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>
              )}

              <div className="mt-8">
                <h4 className="font-semibold text-xl mb-6 text-primary">All Measurements Summary</h4>
                <div className="overflow-x-auto rounded-lg border-2 border-border">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-primary">
                        <th className="border-r border-primary-foreground/20 px-6 py-4 text-left text-primary-foreground font-semibold text-base">
                          Metric
                        </th>
                        <th className="border-r border-primary-foreground/20 px-6 py-4 text-left text-primary-foreground font-semibold text-base">
                          Value & Unit
                        </th>
                        <th className="border-r border-primary-foreground/20 px-6 py-4 text-left text-primary-foreground font-semibold text-base">
                          Interpretation
                        </th>
                        <th className="px-6 py-4 text-left text-primary-foreground font-semibold text-base">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-card">
                      {regularMetrics.map((metric, index) => (
                        <tr
                          key={index}
                          className="hover:bg-secondary/20 transition-colors border-b border-border last:border-b-0"
                        >
                          <td className="border-r border-border px-6 py-4 font-medium text-foreground">
                            {metric.metric}
                          </td>
                          <td className="border-r border-border px-6 py-4 font-semibold text-primary">
                            {metric.value} {metric.unit}
                          </td>
                          <td className="border-r border-border px-6 py-4">
                            <div className="flex items-center">
                              <span className={getInterpretationBadgeClass(metric.interpretation)}>
                                {metric.interpretation || "Not specified"}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-foreground">{metric.date || "Not specified"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {regularMetrics.length === 0 && medications.length > 0 && (
        <Card className="border-2 border-border bg-card shadow-lg">
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle className="flex items-center gap-3 text-xl">
              <span className="text-2xl">📊</span>
              Medical Data Visualization
            </CardTitle>
            <CardDescription className="text-primary-foreground/80 text-base">
              No numerical medical data found for charting
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-card text-card-foreground">
            <p className="text-muted-foreground pt-6 leading-relaxed">
              Found medications above, but no numerical values (blood pressure, glucose, etc.) to chart.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
