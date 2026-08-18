from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import PIL.Image
# Pillow 10+ removed ANTIALIAS — restore as alias for LANCZOS so EasyOCR works
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.LANCZOS
import easyocr
import numpy as np
from PIL import Image
import io
import re
import logging

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Meter OCR Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize reader once (loads model into RAM)
reader = easyocr.Reader(['en'], gpu=False)

def parse_odometer(texts: list) -> dict:
    """
    Extracts likely odometer readings from OCR text blocks.
    Odometers typically show 4-7 digits.
    """
    all_text = " ".join(texts)
    candidates = []
    
    # Strategy 1: Look for 4-7 digit sequences (allowing commas/spaces)
    combined = all_text.replace(",", "").replace(" ", "")
    matches = re.finditer(r'\d{4,7}', combined)
    for m in matches:
        candidates.append({
            "value": int(m.group()),
            "source": "combined_text",
            "context": all_text[max(0, m.start()-5):m.end()+5]
        })
    
    # Strategy 2: Check individual text blocks with confidence scores
    # (This is passed in from the endpoint below)
    
    return {
        "raw_text": all_text,
        "candidates": candidates
    }

@app.post("/extract")
async def extract_meter(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Convert to numpy array for EasyOCR
        np_image = np.array(image)
        
        # Run OCR: returns [(bbox, text, confidence), ...]
        results = reader.readtext(np_image)
        
        texts = []
        detailed = []
        for bbox, text, conf in results:
            texts.append(text)
            detailed.append({
                "text": text,
                "confidence": round(float(conf), 3)
            })
        
        parsed = parse_odometer(texts)
        
        # Add confidence-weighted candidates from individual blocks
        for item in detailed:
            nums = re.findall(r'\d{4,7}', item["text"].replace(",", ""))
            for num in nums:
                parsed["candidates"].append({
                    "value": int(num),
                    "confidence": item["confidence"],
                    "source": "text_block",
                    "context": item["text"]
                })
        
        # Pick best candidate: highest confidence, or largest number if no confidence
        best = None
        if parsed["candidates"]:
            # Sort by confidence descending
            sorted_cands = sorted(
                [c for c in parsed["candidates"] if "confidence" in c],
                key=lambda x: x.get("confidence", 0),
                reverse=True
            )
            if sorted_cands:
                best = sorted_cands[0]
            else:
                best = max(parsed["candidates"], key=lambda x: x["value"])
        
        return {
            "success": True,
            "raw_text": parsed["raw_text"],
            "detailed_blocks": detailed,
            "candidates": parsed["candidates"],
            "best_guess": best,
            "block_count": len(results)
        }
        
    except Exception as e:
        logging.error(f"OCR failed: {str(e)}")
        raise HTTPException(500, f"OCR processing failed: {str(e)}")

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)