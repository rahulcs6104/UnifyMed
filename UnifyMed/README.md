# Medical Document OCR Processor

A Next.js application for processing medical documents using OCR, translation, and AI-powered template filling.

## Setup Instructions

### Environment Variables

You need to set up the following environment variables in your Vercel project:

1. **GOOGLE_APPLICATION_CREDENTIALS_JSON**: Your Google Cloud service account key as a JSON string
   - Copy the entire contents of your Google Cloud service account JSON file
   - Paste it as a single line string in the environment variable
   - Example: `{"type":"service_account","project_id":"your-project",...}`

2. **GEMINI_API_KEY**: Your Google Gemini API key

### Google Cloud Setup

1. Enable the following APIs in your Google Cloud Console:
   - Cloud Vision API (for OCR)
   - Cloud Translation API (for translation)
   - Vertex AI API (for Gemini)

2. Create a service account with the following roles:
   - Cloud Vision API User
   - Cloud Translation API User
   - Vertex AI User

3. Download the service account JSON key file
4. Copy the entire JSON content and paste it as the `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable

## Features

- Upload medical documents (PDF, images)
- OCR text extraction using Google Vision API
- Spanish to English translation
- AI-powered template filling using Gemini
- Clean, responsive web interface
- Real-time processing feedback

## Usage

1. Upload a medical document
2. Optionally upload a template file
3. Click "Process Document" to extract and process the information
4. View results with raw text, translation, and filled template data
