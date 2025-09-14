import { type NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

async function initializeGeminiClient() {
  console.log("[v0] Initializing Gemini client...")

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required")
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    console.log("[v0] Gemini client initialized successfully")
    return model
  } catch (error) {
    console.error("[v0] Failed to initialize Gemini client:", error)
    throw new Error(`Gemini initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

async function extractTextWithGemini(file: File, model: any): Promise<string> {
  console.log("[v0] Extracting text using Gemini Vision...")

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64Data = buffer.toString("base64")
    const mimeType = file.type || "application/pdf"

    console.log("[v0] File processed, size:", buffer.length, "bytes, type:", mimeType)

    const prompt = `Extract all text from this medical document. If it's in Spanish, keep it in Spanish. Return only the extracted text without any additional commentary or formatting.`

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    }

    console.log("[v0] Sending request to Gemini Vision API...")
    const result = await model.generateContent([prompt, imagePart])
    const response = await result.response
    const text = response.text()

    console.log("[v0] Gemini Vision API response received, length:", text.length)
    return text
  } catch (error) {
    console.error("[v0] Gemini Vision API error:", error)
    throw new Error(`Text extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

async function readTextFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return buffer.toString("utf-8")
}

function cleanOcrText(text: string): string {
  let cleanedText = text.replace(/tanlanguage/g, "Paciente")
  cleanedText = cleanedText.replace(/Gem/g, "Paciente")

  // Extract DOB pattern
  const dobMatch = cleanedText.match(/(\d{2}\.\d{2}\.\d{4})/)
  if (dobMatch) {
    cleanedText += `\n[EXTRACTED DOB: ${dobMatch[1]}]`
  }

  return cleanedText
}

async function translateText(text: string, model: any): Promise<string> {
  if (!text.trim()) return ""

  try {
    console.log("[v0] Sending translation request to Gemini...")
    const prompt = `Translate the following Spanish medical text to English. Keep medical terminology accurate and maintain the original structure:

${text}

Provide only the translation without any additional commentary.`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const translatedText = response.text()

    console.log("[v0] Translation completed successfully")
    return translatedText
  } catch (error) {
    console.error("[v0] Translation error:", error)
    throw new Error(`Translation failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

function extractQuestionsFromTemplate(templateText: string, isTextFile = false): string[] {
  const questions: string[] = []
  const lines = templateText.split("\n")

  if (isTextFile) {
    // For text files, each line is a field/question
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith("#") && !trimmedLine.startsWith("//")) {
        questions.push(trimmedLine)
      }
    }
  } else {
    // For image/PDF templates, look for lines ending with ':'
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine.endsWith(":")) {
        questions.push(trimmedLine)
      }
    }
  }

  return questions
}

async function fillTemplateDynamic(
  questions: string[],
  translatedText: string,
  model: any,
): Promise<{ question: string; answer: string }[]> {
  try {
    const prompt = `You are a medical assistant. You have the following patient record:

---PATIENT RECORD START---
${translatedText}
---PATIENT RECORD END---

Please answer the following questions based on the patient record. If the information is not available in the record, respond with "Not available" or leave blank.

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Please provide answers in this exact format:
1. [Answer for question 1]
2. [Answer for question 2]
3. [Answer for question 3]
...and so on.

If no information is available for a question, write "Not available".`

    console.log("[v0] Sending prompt to Gemini for field filling...")
    const result = await model.generateContent(prompt)
    const response = await result.response
    const responseText = response.text()

    console.log("[v0] Gemini response length:", responseText.length)
    console.log("[v0] Gemini response preview:", responseText.substring(0, 300))

    const filledAnswers: { question: string; answer: string }[] = []
    const lines = responseText.split("\n").filter((line) => line.trim())

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]
      let answer = ""

      // Look for numbered answer format: "1. Answer", "2. Answer", etc.
      const numberPattern = new RegExp(`^${i + 1}\\.\\s*(.*)`, "i")

      for (const line of lines) {
        const match = line.match(numberPattern)
        if (match) {
          answer = match[1].trim()
          // Don't include "Not available" as an answer
          if (
            answer.toLowerCase().includes("not available") ||
            answer.toLowerCase().includes("no information") ||
            answer.toLowerCase().includes("blank")
          ) {
            answer = ""
          }
          break
        }
      }

      filledAnswers.push({
        question: question,
        answer: answer,
      })
    }

    const filledCount = filledAnswers.filter((item) => item.answer.trim() !== "").length
    console.log("[v0] Successfully parsed", filledCount, "filled answers out of", questions.length, "questions")

    return filledAnswers
  } catch (error) {
    console.error("[v0] Template filling error:", error)
    throw new Error(`Template filling failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

async function translateDrugName(drugName: string): Promise<string> {
  try {
    console.log("[v0] Translating drug name:", drugName)

    const response = await fetch("/api/translate-drug", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ drugName }),
    })

    if (!response.ok) {
      console.log("[v0] Drug translation failed, using original name:", drugName)
      return drugName // Return original name if translation fails
    }

    const result = await response.json()
    const englishName = result.properties?.name || drugName

    console.log("[v0] Drug translated from", drugName, "to", englishName)
    return englishName
  } catch (error) {
    console.error("[v0] Drug translation error:", error)
    return drugName // Return original name if error occurs
  }
}

async function extractMedicalMetrics(
  translatedText: string,
  model: any,
): Promise<
  { metric: string; value: number; unit: string; date?: string; interpretation?: string; medication?: string }[]
> {
  try {
    const prompt = `You are a medical data analyst. Extract all numerical medical measurements AND medications from the following patient record.

---PATIENT RECORD START---
${translatedText}
---PATIENT RECORD END---

Please identify and extract:

1. ALL numerical medical values such as:
- Blood pressure (systolic/diastolic)
- Blood glucose/sugar levels
- Heart rate/pulse
- Temperature
- Weight/BMI
- Cholesterol levels
- Blood test results (hemoglobin, white blood cells, etc.)
- Any other numerical medical measurements

2. ALL medications/drugs mentioned in the document

For each measurement found, provide the response in this EXACT JSON format:
[
  {
    "metric": "Blood Glucose",
    "value": 120,
    "unit": "mg/dL",
    "date": "2024-01-15",
    "interpretation": "Normal range"
  },
  {
    "metric": "Medication",
    "value": 0,
    "unit": "medication",
    "date": "2024-01-15",
    "interpretation": "Metformin 500mg",
    "medication": "Metformin"
  }
]

IMPORTANT: 
- Return ONLY the JSON array, no other text
- If no values found, return empty array: []
- For medications, use value: 0, unit: "medication", and put the medication name in the "medication" field
- Use standard medical units (mg/dL, mmHg, bpm, °F, °C, kg, etc.)
- Provide medical interpretation when possible (Normal, High, Low, etc.)
- Extract dates if available in the document`

    console.log("[v0] Extracting medical metrics and medications with Gemini...")
    const result = await model.generateContent(prompt)
    const response = await result.response
    const responseText = response.text().trim()

    console.log("[v0] Medical metrics response:", responseText.substring(0, 200))

    try {
      // Clean the response to ensure it's valid JSON
      let cleanedResponse = responseText
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/, "").replace(/\n?```$/, "")
      }
      if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.replace(/```\n?/, "").replace(/\n?```$/, "")
      }

      const metrics = JSON.parse(cleanedResponse)
      console.log("[v0] Successfully extracted", metrics.length, "medical metrics and medications")

      const processedMetrics = []
      for (const metric of Array.isArray(metrics) ? metrics : []) {
        if (metric.medication) {
          // This is a medication, translate it to English
          const englishMedicationName = await translateDrugName(metric.medication)
          processedMetrics.push({
            ...metric,
            medication: englishMedicationName,
            interpretation:
              `${englishMedicationName} ${metric.interpretation?.replace(metric.medication, "") || ""}`.trim(),
          })
        } else {
          // Regular medical metric, keep as is
          processedMetrics.push(metric)
        }
      }

      return processedMetrics
    } catch (parseError) {
      console.error("[v0] Failed to parse medical metrics JSON:", parseError)
      console.error("[v0] Raw response:", responseText)
      return []
    }
  } catch (error) {
    console.error("[v0] Medical metrics extraction error:", error)
    return []
  }
}

interface ProcessingResult {
  rawText: string
  translatedText: string
  filledTemplate: Array<{ question: string; answer: string }>
  medicalMetrics: Array<{
    metric: string
    value: number
    unit: string
    date?: string
    interpretation?: string
    medication?: string
  }>
}

export async function POST(request: NextRequest) {
  console.log("[v0] API route called")

  try {
    console.log("[v0] Parsing form data...")
    const formData = await request.formData()

    const medicalFiles: File[] = []
    let fileIndex = 0

    // Get all medical files (medical_file_0, medical_file_1, etc.)
    while (true) {
      const file = formData.get(`medical_file_${fileIndex}`) as File | null
      if (!file) break
      medicalFiles.push(file)
      fileIndex++
    }

    const templateFile = formData.get("template_file") as File | null

    console.log(
      "[v0] Medical files:",
      medicalFiles.map((f) => f.name),
    )
    console.log("[v0] Template file:", templateFile?.name)

    if (medicalFiles.length === 0) {
      console.log("[v0] No medical files provided")
      return NextResponse.json({ error: "At least one medical file is required" }, { status: 400 })
    }

    console.log("[v0] Initializing Gemini client...")
    const model = await initializeGeminiClient()

    const documentResults: ProcessingResult[] = []

    for (let i = 0; i < medicalFiles.length; i++) {
      const medicalFile = medicalFiles[i]
      console.log(`[v0] Processing document ${i + 1}/${medicalFiles.length}: ${medicalFile.name}`)

      console.log(`[v0] Extracting text from ${medicalFile.name}...`)
      let rawText = await extractTextWithGemini(medicalFile, model)
      rawText = cleanOcrText(rawText)

      console.log(`[v0] Raw text length for ${medicalFile.name}:`, rawText.length)

      if (!rawText.trim()) {
        console.log(`[v0] No text extracted from ${medicalFile.name}`)
        // Continue with other documents instead of failing completely
        documentResults.push({
          filename: medicalFile.name,
          result: {
            rawText: "",
            translatedText: "",
            filledTemplate: [],
            medicalMetrics: [], // Added empty medical metrics for failed documents
          },
        })
        continue
      }

      console.log(`[v0] Translating text for ${medicalFile.name}...`)
      const translatedText = await translateText(rawText, model)
      console.log(`[v0] Translation completed for ${medicalFile.name}, length:`, translatedText.length)

      console.log(`[v0] Extracting medical metrics for ${medicalFile.name}...`)
      const medicalMetrics = await extractMedicalMetrics(translatedText, model)
      console.log(`[v0] Extracted ${medicalMetrics.length} medical metrics for ${medicalFile.name}`)

      let filledTemplate: { question: string; answer: string }[] = []
      if (templateFile) {
        console.log(`[v0] Processing template for ${medicalFile.name}...`)

        const isTextFile = templateFile.name.toLowerCase().endsWith(".txt")
        let templateText: string

        if (isTextFile) {
          console.log("[v0] Reading text file template...")
          templateText = await readTextFile(templateFile)
        } else {
          console.log("[v0] Extracting text from template...")
          templateText = await extractTextWithGemini(templateFile, model)
        }

        console.log("[v0] Template text length:", templateText.length)
        const questions = extractQuestionsFromTemplate(templateText, isTextFile)
        console.log("[v0] Extracted questions:", questions.length, "questions")

        if (questions.length > 0) {
          console.log(`[v0] Filling template with AI for ${medicalFile.name}...`)
          filledTemplate = await fillTemplateDynamic(questions, translatedText, model)
          const filledCount = filledTemplate.filter((item) => item.answer.trim() !== "").length
          console.log(
            `[v0] Template filled for ${medicalFile.name} with`,
            filledCount,
            "answers out of",
            questions.length,
            "total fields",
          )
        }
      }

      documentResults.push({
        filename: medicalFile.name,
        result: {
          rawText,
          translatedText,
          filledTemplate,
          medicalMetrics, // Added medical metrics to result
        },
      })
    }

    const allMedicalMetrics: Array<{
      metric: string
      value: number
      unit: string
      date?: string
      interpretation?: string
      medication?: string
    }> = []

    for (const doc of documentResults) {
      for (const metric of doc.result.medicalMetrics) {
        allMedicalMetrics.push({
          ...metric,
        })
      }
    }

    console.log("[v0] Combined", allMedicalMetrics.length, "medical metrics from all documents")

    // Existing combined template logic
    let combinedTemplate: { question: string; answer: string }[] = []

    if (templateFile && documentResults.length > 0) {
      console.log("[v0] Combining template results from all documents...")

      // Get the template structure from the first document that has results
      const firstDocWithTemplate = documentResults.find((doc) => doc.result.filledTemplate.length > 0)

      if (firstDocWithTemplate) {
        // Initialize combined template with questions from first document
        combinedTemplate = firstDocWithTemplate.result.filledTemplate.map((item) => ({
          question: item.question,
          answer: "",
        }))

        // Combine answers from all documents
        for (const templateItem of combinedTemplate) {
          const answers: string[] = []

          for (const doc of documentResults) {
            const matchingItem = doc.result.filledTemplate.find((item) => item.question === templateItem.question)

            if (matchingItem && matchingItem.answer.trim()) {
              answers.push(matchingItem.answer)
            }
          }

          templateItem.answer = answers.length > 0 ? answers[0] : "Not available"
        }

        const combinedFilledCount = combinedTemplate.filter(
          (item) => item.answer && !item.answer.includes("Not available"),
        ).length

        console.log(
          "[v0] Combined template created with",
          combinedFilledCount,
          "filled fields from",
          documentResults.length,
          "documents",
        )
      }
    }

    const result = {
      documents: documentResults,
      combinedTemplate,
      medicalMetrics: allMedicalMetrics, // Added combined medical metrics
    }

    console.log("[v0] Processing completed successfully for", medicalFiles.length, "documents")
    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error processing medical documents:", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error("[v0] Error details:", { message: errorMessage, stack: errorStack })

    return NextResponse.json(
      {
        error: "Failed to process documents",
        details: errorMessage,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === "development" && { stack: errorStack }),
      },
      { status: 500 },
    )
  }
}
