from flask import Flask, render_template, request
from io import BytesIO
from pdf2image import convert_from_bytes
from PIL import Image, ImageEnhance, ImageFilter
import re
import os

import google.genai as genai
from deep_translator import GoogleTranslator
from google.cloud import vision

# ===== CONFIG =====
app = Flask(__name__)

# Set path to your JSON key file
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/Users/rahul/Desktop/hophacks/gen-lang-client-0067531096-ad6d27019cf6.json"

# Google Vision client
vision_client = vision.ImageAnnotatorClient()

# Gemini client
genai_client = genai.Client(api_key="AIzaSyDkfcr9DlCAUZCpqxYe0tUj5FzeJHlSF2U")

# ===== FUNCTIONS =====
def clean_ocr_text(text):
    """Fix common OCR mistakes and normalize DOBs."""
    text = text.replace("tanlanguage", "Paciente")
    text = text.replace("Gem", "Paciente")
    dob_match = re.search(r'(\d{2}\.\d{2}\.\d{4})', text)
    if dob_match:
        text += f"\n[EXTRACTED DOB: {dob_match.group(1)}]"
    return text

def preprocess_image(image):
    """Optional preprocessing for OCR accuracy."""
    image = image.convert('L')  # grayscale
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2)
    image = image.filter(ImageFilter.MedianFilter())
    return image

def extract_text(file):
    """
    Extract text from PDF or image using Google Vision OCR.
    Handles PDFs and image files (PNG, JPG, JPEG).
    """
    text = ""
    filename = file.filename.lower()

    # PDFs
    if filename.endswith(".pdf"):
        file.seek(0)
        pdf_bytes = BytesIO(file.read())
        images = convert_from_bytes(pdf_bytes.read())
    else:
        # Image files
        img = Image.open(file)
        images = [img]

    for i, img in enumerate(images):
        img = preprocess_image(img)
        img_bytes = BytesIO()
        img.save(img_bytes, format='PNG')
        content = img_bytes.getvalue()

        vision_image = vision.Image(content=content)
        response = vision_client.text_detection(
            image=vision_image,
            image_context={'language_hints': ['es']}  # Spanish hints
        )
        ocr_text = response.full_text_annotation.text
        print(f"\n===== PAGE {i+1} (Vision OCR) =====\n")
        print(ocr_text)
        text += ocr_text + "\n"

    return text

def translate_text(text):
    """Translate text to English using GoogleTranslator."""
    if not text:
        return ""
    return GoogleTranslator(source='auto', target='en').translate(text)

def safe_generate_content(prompt, retries=3, delay=5):
    for attempt in range(retries):
        try:
            response = genai_client.models.generate_content(
                model="gemini-1.5-flash",  # <-- I recommend switching to this lighter model
                contents=prompt,
            )
            return response
        except Exception as e:
            print(f"Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
    raise RuntimeError("Gemini API failed after retries")


# --- Dynamic Template Handling ---
def extract_questions_from_template(template_text):
    """
    Detect fields/questions in the uploaded template.
    Lines ending with ':' are treated as fields.
    """
    questions = []
    for line in template_text.splitlines():
        line = line.strip()
        if line.endswith(":"):
            questions.append(line)
    return questions

def fill_template_dynamic(questions, translated_text):
    """
    Fill template dynamically: search for answers in patient_text.
    Leaves blank if answer not found.
    """
    prompt = f"""
You are a medical assistant. You have the following patient record:

---PATIENT RECORD START---
{translated_text}
---PATIENT RECORD END---

Answer the following questions. If the information is not available, leave it blank.

Questions:
{chr(10).join(questions)}

Provide the answers in this exact format:
Question: Answer
"""
    response = safe_generate_content(prompt)
    # Convert Gemini output to dictionary
    filled = {}
    for line in response.text.splitlines():
        if ":" in line:
            q, a = line.split(":", 1)
            filled[q.strip()] = a.strip()
    return filled

# ===== ROUTES =====
@app.route("/", methods=["GET", "POST"])
def index():
    raw_text = ""
    translated_text = ""
    filled_template = {}

    if request.method == "POST":
        patient_file = request.files.get("medical_file")
        template_file = request.files.get("template_file")

        # 1️⃣ Extract raw text from patient record
        if patient_file:
            raw_text = extract_text(patient_file)
            raw_text = clean_ocr_text(raw_text)
            print("\n===== RAW TEXT =====\n", raw_text)
            translated_text = translate_text(raw_text)
            print("\n===== TRANSLATED TEXT =====\n", translated_text)

        # 2️⃣ Extract template questions from template file
        if template_file:
            template_text = extract_text(template_file)
            questions = extract_questions_from_template(template_text)
            print("\n===== TEMPLATE QUESTIONS =====\n", questions)

            # 3️⃣ Fill template dynamically based on patient text
            filled_template = fill_template_dynamic(questions, translated_text)
            print("\n===== FILLED TEMPLATE =====\n", filled_template)

    return render_template(
        "index.html",
        raw_text=raw_text,
        translated_text=translated_text,
        filled_template=filled_template
    )


# ===== RUN APP =====
if __name__ == "__main__":
    app.run(debug=True)
