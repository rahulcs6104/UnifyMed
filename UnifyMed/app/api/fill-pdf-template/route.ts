import { type NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { GoogleGenerativeAI } from "@google/generative-ai"

async function initializeGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required")
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  return genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
}

async function readTextFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return buffer.toString("utf-8")
}

async function mapFieldsWithGemini(
  fields: string[],
  extractedData: string,
  model: any,
): Promise<Record<string, string>> {
  const prompt = `You are a medical assistant. You have the following patient medical record:

---PATIENT RECORD START---
${extractedData}
---PATIENT RECORD END---

Please fill out the following medical form fields with the appropriate information from the patient record. If information is not available, leave the field empty (return empty string).

Fields to fill:
${fields.map((field, index) => `${index + 1}. ${field}`).join("\n")}

Provide the response in this exact JSON format:
{
  "Field Name 1": "value or empty string",
  "Field Name 2": "value or empty string"
}

Only return the JSON object, no additional text.`

  const result = await model.generateContent(prompt)
  const response = await result.response
  const responseText = response.text()

  try {
    // Clean the response to extract JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (error) {
    console.log("[v0] Failed to parse Gemini JSON response, falling back to manual parsing")
  }

  // Fallback to manual parsing
  const filled: Record<string, string> = {}
  fields.forEach((field) => {
    filled[field] = "" // Default to empty
  })
  return filled
}

function sanitizeTextForPDF(text: string): string {
  if (!text) return text

  // Replace common Unicode characters with ASCII equivalents
  const replacements: Record<string, string> = {
    μ: "u", // Greek mu (micro)
    α: "a", // Greek alpha
    β: "b", // Greek beta
    γ: "g", // Greek gamma
    δ: "d", // Greek delta
    ε: "e", // Greek epsilon
    θ: "th", // Greek theta
    λ: "l", // Greek lambda
    π: "pi", // Greek pi
    σ: "s", // Greek sigma
    τ: "t", // Greek tau
    φ: "ph", // Greek phi
    χ: "ch", // Greek chi
    ψ: "ps", // Greek psi
    ω: "w", // Greek omega
    "°": "deg", // Degree symbol
    "±": "+/-", // Plus-minus
    "≤": "<=", // Less than or equal
    "≥": ">=", // Greater than or equal
    "≠": "!=", // Not equal
    "×": "x", // Multiplication
    "÷": "/", // Division
    "²": "2", // Superscript 2
    "³": "3", // Superscript 3
    "½": "1/2", // One half
    "¼": "1/4", // One quarter
    "¾": "3/4", // Three quarters
    "‘": "'", // Smart quote
    "’": "'", // Smart quote
    "“": '"', // Smart quote
    "”": '"', // Smart quote
    "–": "-", // En dash
    "—": "-", // Em dash
    "…": "...", // Ellipsis
  }

  let sanitized = text

  // Replace known Unicode characters
  Object.entries(replacements).forEach(([unicode, ascii]) => {
    sanitized = sanitized.replace(new RegExp(unicode, "g"), ascii)
  })

  // Remove any remaining non-ASCII characters that might cause issues
  sanitized = sanitized.replace(/[^\x00-\x7F]/g, "?")

  return sanitized
}

async function createSimpleMedicalPDF(
  filledTemplate: Array<{ question: string; answer: string }>,
  rawText: string,
  medicalMetrics?: Array<{
    metric: string
    value: number
    unit: string
    date?: string
    interpretation?: string
    medication?: string
  }>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([612, 792]) // Standard letter size
  const { width, height } = page.getSize()

  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const headerFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let yPosition = height - 60
  let currentPage = page

  // Header with professional styling
  currentPage.drawText("MEDICAL ANALYSIS REPORT", {
    x: 50,
    y: yPosition,
    size: 18,
    font: titleFont,
    color: rgb(0.1, 0.3, 0.6),
  })

  yPosition -= 30

  // Add a line under the header
  currentPage.drawLine({
    start: { x: 50, y: yPosition },
    end: { x: width - 50, y: yPosition },
    thickness: 2,
    color: rgb(0.1, 0.3, 0.6),
  })

  yPosition -= 40

  if (medicalMetrics && Array.isArray(medicalMetrics) && medicalMetrics.length > 0) {
    const medicationsFromMetrics = medicalMetrics.filter(
      (metric) => metric.medication || metric.metric.toLowerCase() === "medication",
    )

    // Extract medications from template fields as well
    const medicationFields = filledTemplate.filter((item) => {
      const question = item.question.toLowerCase()
      return (
        (question.includes("medication") || question.includes("drug")) &&
        item.answer &&
        item.answer !== "Not available" &&
        item.answer.trim() !== ""
      )
    })

    // Combine all medications and deduplicate
    const allMedications = new Set<string>()

    // Add medications from metrics
    medicationsFromMetrics.forEach((metric) => {
      const medicationName = metric.medication || metric.unit || "Unknown medication"
      if (medicationName && medicationName !== "Unknown medication") {
        allMedications.add(medicationName)
      }
    })

    // Add medications from template fields
    medicationFields.forEach((field) => {
      if (field.answer) {
        // Parse multiple medications if they're in one field (separated by commas, semicolons, etc.)
        const medications = field.answer
          .split(/[,;]/)
          .map((med) => med.trim())
          .filter((med) => med.length > 0)
        medications.forEach((med) => allMedications.add(med))
      }
    })

    const regularMetrics = medicalMetrics.filter(
      (metric) => !metric.medication && metric.metric.toLowerCase() !== "medication",
    )

    if (allMedications.size > 0) {
      // Check if we need a new page
      if (yPosition < 200) {
        currentPage = pdfDoc.addPage([612, 792])
        yPosition = height - 60
      }

      // Medications Section Header
      currentPage.drawText("CURRENT MEDICATIONS", {
        x: 50,
        y: yPosition,
        size: 14,
        font: headerFont,
        color: rgb(0.2, 0.4, 0.7),
      })

      yPosition -= 25

      // Draw section underline
      currentPage.drawLine({
        start: { x: 50, y: yPosition },
        end: { x: 350, y: yPosition },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })

      yPosition -= 30

      // List all unique medications
      Array.from(allMedications).forEach((medicationName) => {
        if (yPosition < 100) {
          currentPage = pdfDoc.addPage([612, 792])
          yPosition = height - 60
        }

        const sanitizedName = sanitizeTextForPDF(medicationName)
        currentPage.drawText(`• ${sanitizedName}`, {
          x: 70,
          y: yPosition,
          size: 11,
          font: bodyFont,
          color: rgb(0, 0, 0),
        })

        yPosition -= 20
      })

      yPosition -= 30 // Extra space before next section
    }

    if (regularMetrics.length > 0) {
      // Check if we need a new page
      if (yPosition < 300) {
        currentPage = pdfDoc.addPage([612, 792])
        yPosition = height - 60
      }

      // Medical Metrics Section Header
      currentPage.drawText("MEDICAL METRICS ANALYSIS", {
        x: 50,
        y: yPosition,
        size: 14,
        font: headerFont,
        color: rgb(0.2, 0.4, 0.7),
      })

      yPosition -= 25

      // Draw section underline
      currentPage.drawLine({
        start: { x: 50, y: yPosition },
        end: { x: 350, y: yPosition },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })

      yPosition -= 30

      // Generate chart if we have metrics
      try {
        const chartResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/generate-chart-image`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              metrics: regularMetrics, // Only use regular metrics for chart
              chartType: "line",
            }),
          },
        )

        if (chartResponse.ok) {
          const chartData = await chartResponse.json()

          // Add chart description
          currentPage.drawText(`Chart: ${chartData.metricName} (${chartData.dataPoints} data points)`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: bodyFont,
            color: rgb(0.3, 0.3, 0.3),
          })

          yPosition -= 20

          // Note about chart (since we can't easily embed SVG in pdf-lib)
          currentPage.drawText("📊 Medical data visualization available in digital version", {
            x: 70,
            y: yPosition,
            size: 10,
            font: bodyFont,
            color: rgb(0.5, 0.5, 0.5),
          })

          yPosition -= 30
        }
      } catch (error) {
        console.log("[v0] Could not generate chart for PDF:", error)
      }

      // Medical Metrics Summary Table
      currentPage.drawText("Metrics Summary:", {
        x: 70,
        y: yPosition,
        size: 12,
        font: headerFont,
        color: rgb(0.2, 0.2, 0.2),
      })

      yPosition -= 20

      // Table headers
      currentPage.drawText("Metric", {
        x: 70,
        y: yPosition,
        size: 9,
        font: headerFont,
        color: rgb(0.3, 0.3, 0.3),
      })

      currentPage.drawText("Value & Unit", {
        x: 200,
        y: yPosition,
        size: 9,
        font: headerFont,
        color: rgb(0.3, 0.3, 0.3),
      })

      currentPage.drawText("Interpretation", {
        x: 350,
        y: yPosition,
        size: 9,
        font: headerFont,
        color: rgb(0.3, 0.3, 0.3),
      })

      yPosition -= 15

      // Draw header line
      currentPage.drawLine({
        start: { x: 70, y: yPosition },
        end: { x: width - 50, y: yPosition },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })

      yPosition -= 10

      // Add metrics data (only regular metrics)
      regularMetrics.slice(0, 15).forEach((metric) => {
        // Limit to first 15 metrics to fit on page
        if (yPosition < 100) {
          currentPage = pdfDoc.addPage([612, 792])
          yPosition = height - 60
        }

        // Metric name
        const metricName = sanitizeTextForPDF(
          metric.metric.length > 20 ? metric.metric.substring(0, 17) + "..." : metric.metric,
        )
        currentPage.drawText(metricName, {
          x: 70,
          y: yPosition,
          size: 8,
          font: bodyFont,
          color: rgb(0, 0, 0),
        })

        const valueWithUnit = sanitizeTextForPDF(`${metric.value} ${metric.unit}`)
        currentPage.drawText(valueWithUnit, {
          x: 200,
          y: yPosition,
          size: 8,
          font: bodyFont,
          color: rgb(0, 0, 0),
        })

        // Interpretation with color coding
        const interpretation = sanitizeTextForPDF(metric.interpretation || "Not specified")
        const interpretationColor = interpretation.toLowerCase().includes("normal")
          ? rgb(0, 0.6, 0)
          : interpretation.toLowerCase().includes("high") || interpretation.toLowerCase().includes("elevated")
            ? rgb(0.8, 0, 0)
            : interpretation.toLowerCase().includes("low")
              ? rgb(0.8, 0.6, 0)
              : rgb(0.5, 0.5, 0.5)

        const interpretationText = interpretation.length > 20 ? interpretation.substring(0, 17) + "..." : interpretation
        currentPage.drawText(interpretationText, {
          x: 350,
          y: yPosition,
          size: 8,
          font: bodyFont,
          color: interpretationColor,
        })

        yPosition -= 12
      })

      if (regularMetrics.length > 15) {
        yPosition -= 10
        currentPage.drawText(
          `... and ${regularMetrics.length - 15} more metrics (see digital version for complete data)`,
          {
            x: 70,
            y: yPosition,
            size: 8,
            font: bodyFont,
            color: rgb(0.5, 0.5, 0.5),
          },
        )
      }

      yPosition -= 40 // Extra space before template section
    }
  }

  // Group fields by sections
  const sections = {
    "Patient Information": [] as Array<{ question: string; answer: string }>,
    "Medical History": [] as Array<{ question: string; answer: string }>,
    Allergies: [] as Array<{ question: string; answer: string }>,
    "Other Information": [] as Array<{ question: string; answer: string }>,
  }

  // Categorize fields into sections (excluding medication fields)
  filledTemplate.forEach((item) => {
    const question = item.question.toLowerCase()

    // Skip medication fields since we handle them in the medical metrics section
    if (question.includes("medication") || question.includes("drug")) {
      return
    }

    if (
      question.includes("patient") ||
      question.includes("name") ||
      question.includes("birth") ||
      question.includes("age") ||
      question.includes("gender") ||
      question.includes("sex")
    ) {
      sections["Patient Information"].push(item)
    } else if (question.includes("history") || question.includes("medical")) {
      sections["Medical History"].push(item)
    } else if (question.includes("allerg")) {
      sections["Allergies"].push(item)
    } else {
      sections["Other Information"].push(item)
    }
  })

  // Render each section
  Object.entries(sections).forEach(([sectionName, items]) => {
    if (items.length === 0) return

    // Check if we need a new page
    if (yPosition < 150) {
      currentPage = pdfDoc.addPage([612, 792])
      yPosition = height - 60
    }

    // Section header
    currentPage.drawText(sectionName.toUpperCase(), {
      x: 50,
      y: yPosition,
      size: 14,
      font: headerFont,
      color: rgb(0.2, 0.4, 0.7),
    })

    yPosition -= 25

    // Draw section underline
    currentPage.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: 300, y: yPosition },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    })

    yPosition -= 20

    // Render items in a clean table-like format
    items.forEach((item) => {
      if (yPosition < 80) {
        currentPage = pdfDoc.addPage([612, 792])
        yPosition = height - 60
      }

      // Clean up the question text
      let cleanQuestion = sanitizeTextForPDF(item.question.replace(/^\d+\.\s*/, "").trim())
      if (cleanQuestion.endsWith(":")) {
        cleanQuestion = cleanQuestion.slice(0, -1)
      }

      // Question (left column)
      const questionLines = wrapText(cleanQuestion, 35)
      questionLines.forEach((line, index) => {
        currentPage.drawText(line, {
          x: 70,
          y: yPosition - index * 12,
          size: 10,
          font: bodyFont,
          color: rgb(0.3, 0.3, 0.3),
        })
      })

      // Answer (right column)
      const answer = item.answer && item.answer !== "Not available" ? sanitizeTextForPDF(item.answer) : "Not provided"
      const answerColor = item.answer && item.answer !== "Not available" ? rgb(0, 0, 0) : rgb(0.6, 0.6, 0.6)

      const answerLines = wrapText(answer, 40)
      answerLines.forEach((line, index) => {
        currentPage.drawText(line, {
          x: 320,
          y: yPosition - index * 12,
          size: 10,
          font: item.answer && item.answer !== "Not available" ? bodyFont : bodyFont,
          color: answerColor,
        })
      })

      const maxLines = Math.max(questionLines.length, answerLines.length)
      yPosition -= maxLines * 12 + 15

      // Add subtle separator line
      if (yPosition > 100) {
        currentPage.drawLine({
          start: { x: 70, y: yPosition + 5 },
          end: { x: width - 50, y: yPosition + 5 },
          thickness: 0.5,
          color: rgb(0.9, 0.9, 0.9),
        })
      }
    })

    yPosition -= 20 // Extra space between sections
  })

  // Footer on last page
  const pages = pdfDoc.getPages()
  const lastPage = pages[pages.length - 1]
  lastPage.drawText(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, {
    x: 50,
    y: 30,
    size: 8,
    font: bodyFont,
    color: rgb(0.5, 0.5, 0.5),
  })

  const medications = medicalMetrics?.filter((m) => m.medication) || []
  const regularMetrics = medicalMetrics?.filter((m) => !m.medication) || []
  lastPage.drawText(
    `Fields: ${filledTemplate.length} | Metrics: ${regularMetrics.length} | Medications: ${medications.length}`,
    {
      x: 350,
      y: 30,
      size: 8,
      font: bodyFont,
      color: rgb(0.5, 0.5, 0.5),
    },
  )

  return await pdfDoc.save()
}

export async function POST(request: NextRequest) {
  console.log("[v0] PDF fill API route called")

  try {
    const formData = await request.formData()
    const templateFile = formData.get("template_file") as File
    const filledDataStr = formData.get("filled_data") as string
    const medicalMetricsStr = formData.get("medical_metrics") as string // Added medical metrics parameter

    if (!templateFile || !filledDataStr) {
      return NextResponse.json({ error: "Missing template file or filled data" }, { status: 400 })
    }

    console.log("[v0] Template file:", templateFile.name)
    console.log("[v0] Filled data length:", filledDataStr.length)

    const filledData = JSON.parse(filledDataStr)
    const medicalMetrics = medicalMetricsStr ? JSON.parse(medicalMetricsStr) : []
    console.log("[v0] Parsed filledData type:", Array.isArray(filledData) ? "array" : typeof filledData)
    console.log("[v0] Medical metrics count:", medicalMetrics.length)

    const isTextFile = templateFile.name.toLowerCase().endsWith(".txt")

    if (isTextFile) {
      console.log("[v0] Processing text file template...")

      const filledTemplate = Array.isArray(filledData) ? filledData : filledData.filledTemplate || []

      console.log("[v0] Final filledTemplate length:", filledTemplate.length)
      console.log("[v0] First few items:", filledTemplate.slice(0, 3))

      const pdfBytes = await createSimpleMedicalPDF(filledTemplate, filledData.rawText || "", medicalMetrics)

      console.log("[v0] Created simple medical PDF with metrics, size:", pdfBytes.length)

      return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="medical-report-with-charts.pdf"`,
        },
      })
    } else {
      const templateBytes = await templateFile.arrayBuffer()
      const pdfDoc = await PDFDocument.load(templateBytes)

      console.log("[v0] Loaded template PDF with", pdfDoc.getPageCount(), "pages")

      // Try to fill form fields first
      const form = pdfDoc.getForm()
      const fields = form.getFields()

      console.log("[v0] Found", fields.length, "form fields in template")

      if (fields.length > 0) {
        fields.forEach((field) => {
          const fieldName = field.getName().toLowerCase()
          console.log("[v0] Processing field:", fieldName)

          let valueToFill = ""
          const rawText = filledData.rawText || ""

          // Extract patient information from the medical document
          if (fieldName.includes("name") || fieldName.includes("patient")) {
            const nameMatch = rawText.match(/Paliente:\s*([^\n]+)/i) || rawText.match(/Patient:\s*([^\n]+)/i)
            if (nameMatch) valueToFill = nameMatch[1].trim()
          } else if (fieldName.includes("birth") || fieldName.includes("dob")) {
            const birthMatch = rawText.match(/F\.\s*Nacimiento:\s*([^\n]+)/i) || rawText.match(/Birth:\s*([^\n]+)/i)
            if (birthMatch) valueToFill = birthMatch[1].trim()
          } else if (fieldName.includes("age") || fieldName.includes("edad")) {
            const ageMatch = rawText.match(/Edad:\s*([^\n]+)/i) || rawText.match(/Age:\s*([^\n]+)/i)
            if (ageMatch) valueToFill = ageMatch[1].trim()
          } else if (fieldName.includes("sex") || fieldName.includes("gender")) {
            const sexMatch = rawText.match(/Sexo:\s*([^\n]+)/i) || rawText.match(/Sex:\s*([^\n]+)/i)
            if (sexMatch) valueToFill = sexMatch[1].trim()
          } else if (fieldName.includes("id") || fieldName.includes("identification")) {
            const idMatch = rawText.match(/Identificación:\s*([^\n]+)/i) || rawText.match(/ID:\s*([^\n]+)/i)
            if (idMatch) valueToFill = idMatch[1].trim()
          } else if (fieldName.includes("insurance") || fieldName.includes("aseguradora")) {
            const insuranceMatch = rawText.match(/Aseguradora:\s*([^\n]+)/i) || rawText.match(/Insurance:\s*([^\n]+)/i)
            if (insuranceMatch) valueToFill = insuranceMatch[1].trim()
          }

          // Also check template answers
          Object.entries(filledData).forEach(([question, answer]) => {
            if (typeof question === "string" && typeof answer === "string") {
              const questionLower = question.toLowerCase()
              if (questionLower.includes(fieldName) || fieldName.includes(questionLower.split(" ")[0])) {
                valueToFill = answer
              }
            }
          })

          // Fill the field if we found a value
          if (valueToFill && field.constructor.name === "PDFTextField") {
            try {
              ;(field as any).setText(sanitizeTextForPDF(valueToFill))
              console.log("[v0] Filled field", fieldName, "with:", valueToFill.substring(0, 50))
            } catch (error) {
              console.log("[v0] Could not fill field", fieldName, ":", error)
            }
          }
        })
      } else {
        console.log("[v0] No form fields found, overlaying data on template pages")

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

        // Get the first page to overlay information
        const pages = pdfDoc.getPages()
        const firstPage = pages[0]
        const { width, height } = firstPage.getSize()

        // Extract patient information
        const rawText = filledData.rawText || ""
        const patientInfo = extractPatientInfo(rawText)

        // Define overlay positions (adjust these based on your template layout)
        const overlayPositions = [
          { label: "Patient Name", x: 150, y: height - 100, value: patientInfo["Patient Name"] },
          { label: "Date of Birth", x: 150, y: height - 130, value: patientInfo["Date of Birth"] },
          { label: "Age", x: 400, y: height - 130, value: patientInfo["Age"] },
          { label: "Sex", x: 150, y: height - 160, value: patientInfo["Sex"] },
          { label: "ID", x: 400, y: height - 160, value: patientInfo["ID"] },
          { label: "Insurance", x: 150, y: height - 190, value: patientInfo["Insurance"] },
        ]

        // Overlay patient information on the template
        overlayPositions.forEach(({ x, y, value }) => {
          if (value) {
            const sanitizedValue = sanitizeTextForPDF(value)
            firstPage.drawText(sanitizedValue, {
              x,
              y,
              size: 10,
              font: font,
              color: rgb(0, 0, 0),
            })
            console.log("[v0] Overlaid text at", x, y, ":", sanitizedValue.substring(0, 30))
          }
        })

        // If there are template questions/answers, overlay them on subsequent areas
        let questionY = height - 250
        Object.entries(filledData).forEach(([question, answer]) => {
          if (typeof question === "string" && typeof answer === "string" && question !== "rawText") {
            if (questionY > 50 && answer) {
              // Overlay the answer (skip the question to avoid clutter)
              const answerText = sanitizeTextForPDF(answer.length > 50 ? answer.substring(0, 47) + "..." : answer)
              firstPage.drawText(answerText, {
                x: 50,
                y: questionY,
                size: 9,
                font: font,
                color: rgb(0.2, 0.2, 0.2),
              })
              questionY -= 20
              console.log("[v0] Overlaid answer at y:", questionY + 20)
            }
          }
        })
      }

      const pdfBytes = await pdfDoc.save()
      console.log("[v0] Template PDF filled successfully, size:", pdfBytes.length)

      return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="filled-${templateFile.name}"`,
        },
      })
    }
  } catch (error) {
    console.error("[v0] PDF fill error:", error)
    return NextResponse.json(
      {
        error: "Failed to fill PDF template",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

function extractPatientInfo(rawText: string): Record<string, string> {
  const info: Record<string, string> = {}

  const patterns = [
    { key: "Patient Name", regex: /(?:Paliente|Patient):\s*([^\n]+)/i },
    { key: "Date of Birth", regex: /(?:F\.\s*Nacimiento|Birth|DOB):\s*([^\n]+)/i },
    { key: "Age", regex: /(?:Edad|Age):\s*([^\n]+)/i },
    { key: "Sex", regex: /(?:Sexo|Sex|Gender):\s*([^\n]+)/i },
    { key: "ID", regex: /(?:Identificación|ID|Identification):\s*([^\n]+)/i },
    { key: "Insurance", regex: /(?:Aseguradora|Insurance):\s*([^\n]+)/i },
    { key: "Specialty", regex: /(?:Especialidad|Specialty):\s*([^\n]+)/i },
    { key: "Episode", regex: /Episode\s*([^\n]+)/i },
    { key: "Civil Status", regex: /(?:Estado Civil|Civil Status):\s*([^\n]+)/i },
  ]

  patterns.forEach(({ key, regex }) => {
    const match = rawText.match(regex)
    if (match && match[1]) {
      info[key] = match[1].trim()
    }
  })

  return info
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (!text || text.length <= maxCharsPerLine) {
    return [text || ""]
  }

  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  words.forEach((word) => {
    const testLine = currentLine + (currentLine ? " " : "") + word

    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.length > 0 ? lines : [""]
}
