"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MedicalCharts } from "@/components/medical-charts"
import { FileText, Upload, Zap, Download, CheckCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface ProcessingResult {
  rawText: string
  translatedText: string
  filledTemplate: Array<{ question: string; answer: string }>
  medicalMetrics: Array<{ metric: string; value: number; unit: string; date?: string; interpretation?: string }> // Added medical metrics
}

interface MultipleDocumentResult {
  documents: Array<{
    filename: string
    result: ProcessingResult
  }>
  combinedTemplate: Array<{ question: string; answer: string }>
  medicalMetrics: Array<{
    metric: string
    value: number
    unit: string
    date?: string
    interpretation?: string
    source: string
  }> // Added combined medical metrics
}

export default function MedicalDocumentProcessor() {
  const [medicalFiles, setMedicalFiles] = useState<File[]>([])
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<MultipleDocumentResult | null>(null)
  const { toast } = useToast()

  const handleMedicalFilesUpload = (files: FileList | null) => {
    if (!files) return

    const fileArray = Array.from(files)
    console.log(
      "[v0] Multiple files uploaded:",
      fileArray.map((f) => f.name),
    )
    setMedicalFiles(fileArray)
  }

  const handleFileUpload = (file: File, type: "template") => {
    console.log("[v0] File uploaded:", file.name, "Type:", type)
    setTemplateFile(file)
  }

  const removeMedicalFile = (index: number) => {
    const updatedFiles = medicalFiles.filter((_, i) => i !== index)
    setMedicalFiles(updatedFiles)
  }

  const processDocuments = async () => {
    console.log("[v0] Process button clicked")
    console.log(
      "[v0] Medical files:",
      medicalFiles.map((f) => f.name),
    )
    console.log("[v0] Template file:", templateFile?.name)

    if (medicalFiles.length === 0) {
      console.error("Please upload at least one medical document.")
      toast({
        title: "No Documents",
        description: "Please upload at least one medical document.",
        variant: "destructive",
      })
      return
    }

    setProcessing(true)
    console.log("[v0] Starting processing...")

    try {
      const formData = new FormData()

      medicalFiles.forEach((file, index) => {
        formData.append(`medical_file_${index}`, file)
      })

      if (templateFile) {
        formData.append("template_file", templateFile)
      }

      console.log("[v0] Sending request to API...")
      const response = await fetch("/api/process-medical-document", {
        method: "POST",
        body: formData,
      })

      console.log("[v0] API response status:", response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.log("[v0] API error:", errorData)
        throw new Error(errorData.details || "Processing failed")
      }

      const data = await response.json()
      console.log("[v0] API response data:", data)
      setResult(data)

      setTimeout(() => {
        const resultsSection = document.querySelector("[data-results-section]")
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 500)

      console.log(`${medicalFiles.length} document(s) processed successfully!`)
    } catch (error) {
      console.error("[v0] Processing error:", error)
      console.error(`Failed to process documents: ${error instanceof Error ? error.message : "Unknown error"}`)
      toast({
        title: "Processing Failed",
        description: `Failed to process documents: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      })
    } finally {
      setProcessing(false)
      console.log("[v0] Processing completed")
    }
  }

  const downloadResults = () => {
    if (!result) return

    let content = `MEDICAL DOCUMENT PROCESSING RESULTS\n===================================\n\n`

    result.documents.forEach((doc, index) => {
      content += `DOCUMENT ${index + 1}: ${doc.filename}\n`
      content += `${"=".repeat(50)}\n\n`
      content += `RAW EXTRACTED TEXT:\n${doc.result.rawText}\n\n`
      content += `TRANSLATED TEXT (English):\n${doc.result.translatedText}\n\n`
      content += `FILLED TEMPLATE:\n${doc.result.filledTemplate.map(({ question, answer }) => `${question}: ${answer}`).join("\n")}\n\n`
      content += `MEDICAL METRICS:\n${doc.result.medicalMetrics.map(({ metric, value, unit, date, interpretation }) => `${metric}: ${value} ${unit} (${date ? date : "No date"}) - ${interpretation ? interpretation : "No interpretation"}`).join("\n")}\n\n`
      content += `${"=".repeat(50)}\n\n`
    })

    if (result.combinedTemplate.length > 0) {
      content += `COMBINED TEMPLATE RESULTS:\n`
      content += `${"=".repeat(50)}\n`
      content += result.combinedTemplate.map(({ question, answer }) => `${question}: ${answer}`).join("\n")
    }

    if (result.medicalMetrics.length > 0) {
      content += `\nCOMBINED MEDICAL METRICS:\n`
      content += `${"=".repeat(50)}\n`
      content += result.medicalMetrics
        .map(
          ({ metric, value, unit, date, interpretation, source }) =>
            `${metric}: ${value} ${unit} (${date ? date : "No date"}) - ${interpretation ? interpretation : "No interpretation"} (Source: ${source})`,
        )
        .join("\n")
    }

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "medical-documents-results.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadFilledPDF = async () => {
    if (!result || !templateFile || result.combinedTemplate.length === 0) {
      console.error("No template file or processing results available.")
      toast({
        title: "No Data Available",
        description: "No template file or processing results available.",
        variant: "destructive",
      })
      return
    }

    try {
      const formData = new FormData()
      formData.append("template_file", templateFile)
      formData.append("filled_data", JSON.stringify(result.combinedTemplate))
      if (result.medicalMetrics && result.medicalMetrics.length > 0) {
        formData.append("medical_metrics", JSON.stringify(result.medicalMetrics))
      }

      console.log("[v0] Requesting filled PDF with medical charts...")
      const response = await fetch("/api/fill-pdf-template", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to generate filled PDF")
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "medical-report-with-charts.pdf"
      a.click()
      URL.revokeObjectURL(url)

      console.log("Medical report with charts downloaded successfully!")
    } catch (error) {
      console.error("[v0] PDF download error:", error)
      console.error(`Failed to download filled PDF: ${error instanceof Error ? error.message : "Unknown error"}`)
      toast({
        title: "Download Failed",
        description: `Failed to download filled PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
        <div className="text-center space-y-8 py-16">
          <div className="space-y-4">
            <h1 className="text-6xl md:text-7xl font-heading font-bold text-white tracking-tight">UnifyMed</h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Advanced medical document processing with AI-powered OCR and universal language translation
            </p>
          </div>
          <div className="w-24 h-1 bg-gradient-to-r from-primary to-accent mx-auto rounded-full"></div>
        </div>

        {processing && (
          <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="relative">
              <div className="w-80 h-96 bg-card border-2 border-primary/30 rounded-xl relative overflow-hidden shadow-2xl">
                <div
                  className="absolute left-0 right-0 h-2 bg-gradient-to-r from-transparent via-yellow-400 to-transparent shadow-lg"
                  style={{
                    animation: "scanningBar 2s ease-in-out infinite alternate",
                  }}
                ></div>
                <div className="absolute inset-6 border border-primary/20 rounded-lg">
                  <div className="space-y-3 p-6">
                    <div className="h-2 bg-primary/20 rounded animate-pulse"></div>
                    <div className="h-2 bg-primary/20 rounded animate-pulse delay-100"></div>
                    <div className="h-2 bg-primary/20 rounded animate-pulse delay-200"></div>
                    <div className="h-2 bg-primary/20 rounded animate-pulse delay-300"></div>
                  </div>
                </div>
              </div>
              <p className="text-center text-foreground text-xl font-heading font-semibold mt-8">
                Processing Documents...
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="card-professional">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border">
              <CardTitle className="flex items-center gap-3 text-2xl font-heading">
                <FileText className="h-6 w-6 text-primary" />
                Medical Documents
              </CardTitle>
              <CardDescription className="text-muted-foreground text-base">
                Upload multiple PDFs or images of medical documents for processing
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="space-y-6">
                <Label htmlFor="medical-files" className="text-foreground font-medium text-base">
                  Select Medical Documents
                </Label>
                <div className="relative">
                  <Input
                    id="medical-files"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    multiple
                    onChange={(e) => handleMedicalFilesUpload(e.target.files)}
                    className="h-14 text-base cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                </div>
                {medicalFiles.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-primary flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Selected files ({medicalFiles.length}):
                    </p>
                    {medicalFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-muted/50 p-4 rounded-lg border border-border hover:bg-muted/70 transition-all duration-200"
                      >
                        <span className="text-base text-foreground flex items-center gap-3">
                          <CheckCircle className="h-4 w-4 text-primary" />
                          {file.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMedicalFile(index)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0 rounded-full"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="card-professional">
            <CardHeader className="bg-gradient-to-r from-accent/10 to-primary/10 border-b border-border">
              <CardTitle className="flex items-center gap-3 text-2xl font-heading">
                <Upload className="h-6 w-6 text-accent" />
                Template (Optional)
              </CardTitle>
              <CardDescription className="text-muted-foreground text-base">
                Upload a template to automatically structure the extracted data
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="space-y-6">
                <Label htmlFor="template-file" className="text-foreground font-medium text-base">
                  Select Template
                </Label>
                <div className="relative">
                  <Input
                    id="template-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file, "template")
                    }}
                    className="h-14 text-base cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-accent file:text-accent-foreground hover:file:bg-accent/90"
                  />
                </div>
                {templateFile && (
                  <p className="text-base text-accent font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {templateFile.name} selected
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center py-8">
          <Button
            onClick={processDocuments}
            disabled={medicalFiles.length === 0 || processing}
            size="lg"
            className="px-12 py-6 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground font-heading font-semibold text-lg shadow-xl btn-professional rounded-xl"
          >
            {processing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-3" />
                Processing {medicalFiles.length} document(s)...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5 mr-3" />
                Process {medicalFiles.length} Document(s)
              </>
            )}
          </Button>
        </div>

        {result && (
          <div className="space-y-12" data-results-section>
            <div className="flex items-center justify-between">
              <h2 className="section-header">Processing Results ({result.documents.length} documents)</h2>
              <div className="flex gap-4">
                {templateFile && result.combinedTemplate.length > 0 && (
                  <Button
                    onClick={downloadFilledPDF}
                    className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground shadow-lg btn-professional font-medium px-6 py-3"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Combined PDF
                  </Button>
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-8">
                {result.medicalMetrics && result.medicalMetrics.length > 0 && (
                  <div>
                    <h3 className="section-header">Medical Data Visualization</h3>
                    <MedicalCharts metrics={result.medicalMetrics} />
                  </div>
                )}
              </div>

              <div className="space-y-8">
                {result.combinedTemplate.length > 0 && (
                  <Card className="card-professional">
                    <CardHeader className="bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border">
                      <CardTitle className="section-header mb-0">Combined Template Results</CardTitle>
                      <CardDescription className="text-muted-foreground text-base">
                        Merged data from all processed documents
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-8">
                      <div className="space-y-6">
                        {result.combinedTemplate.map(({ question, answer }, index) => (
                          <div
                            key={index}
                            className="border-l-4 border-primary pl-6 py-4 hover:bg-muted/30 transition-all duration-200 rounded-r-lg"
                          >
                            <p className="font-medium text-foreground text-base mb-2">{question}</p>
                            <p className="text-muted-foreground leading-relaxed text-sm">
                              {answer || "No information found"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes scanningBar {
          0% { top: 0; }
          100% { top: calc(100% - 8px); }
        }
      `}</style>
    </div>
  )
}
