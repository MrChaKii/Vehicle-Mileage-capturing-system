const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const Reading = require('../models/Reading');

// CRITICAL: Store file in memory only, never on disk
const upload = multer({ storage: multer.memoryStorage() });

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8000';

// POST /api/readings/extract — Analyze image, return data, DON'T save yet
router.post('/extract', upload.single('meterImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Forward image buffer to Python EasyOCR service
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const ocrResponse = await axios.post(`${OCR_SERVICE_URL}/extract`, form, {
      headers: form.getHeaders(),
      timeout: 30000  // OCR can be slow on first run
    });

    const ocrData = ocrResponse.data;

    if (!ocrData.success || !ocrData.best_guess) {
      return res.status(422).json({
        error: 'Could not detect odometer reading',
        rawText: ocrData.raw_text,
        suggestion: 'Ensure the odometer is centered, well-lit, and glare-free'
      });
    }

    // Return extracted data for user verification — NOT saved yet
    res.json({
      success: true,
      extracted: {
        mileage: ocrData.best_guess.value,
        confidence: ocrData.best_guess.confidence,
        rawText: ocrData.raw_text,
        allCandidates: ocrData.candidates
      }
    });

  } catch (error) {
    console.error('OCR forwarding error:', error.message);
    res.status(500).json({ 
      error: 'OCR service unavailable',
      detail: error.message 
    });
  }
});

// POST /api/readings — Save after user confirms/corrects
router.post('/', async (req, res) => {
  try {
    const { vehicleId, mileage, rawText, confidence, isCorrected, originalMileage, location, submittedBy } = req.body;

    if (!vehicleId || mileage === undefined) {
      return res.status(400).json({ error: 'vehicleId and mileage are required' });
    }

    // Optional: Validate against last reading to prevent rollback
    const lastReading = await Reading.findOne({ vehicleId }).sort({ readingDate: -1 });
    if (lastReading && mileage < lastReading.extractedMileage) {
      return res.status(400).json({
        error: 'Mileage is less than last recorded reading',
        lastReading: lastReading.extractedMileage,
        hint: 'Odometer cannot decrease. Check for misread digits.'
      });
    }

    const reading = new Reading({
      vehicleId: vehicleId.toUpperCase().trim(),
      extractedMileage: mileage,
      rawOcrText: rawText || '',
      ocrConfidence: confidence || 0,
      isCorrected: isCorrected || false,
      originalMileage: originalMileage || null,
      location,
      submittedBy
    });

    await reading.save();

    res.status(201).json({
      success: true,
      reading: {
        id: reading._id,
        vehicleId: reading.vehicleId,
        mileage: reading.extractedMileage,
        date: reading.readingDate
      }
    });

  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save reading' });
  }
});

// GET /api/readings/stats/:vehicleId — Aggregated stats (must be BEFORE /:vehicleId)
router.get('/stats/:vehicleId', async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId.toUpperCase();

    const readings = await Reading.find({ vehicleId })
      .sort({ readingDate: 1 })
      .select('extractedMileage readingDate');

    if (readings.length === 0) {
      return res.json({ totalReadings: 0, totalDistance: 0, averageDaily: 0 });
    }

    const totalReadings = readings.length;
    const first = readings[0];
    const last = readings[readings.length - 1];
    const totalDistance = last.extractedMileage - first.extractedMileage;

    // Days between first and last reading (minimum 1 to avoid division by zero)
    const daysDiff = Math.max(
      1,
      Math.round((new Date(last.readingDate) - new Date(first.readingDate)) / (1000 * 60 * 60 * 24))
    );
    const averageDaily = totalReadings > 1 ? Math.round(totalDistance / daysDiff) : 0;

    res.json({ totalReadings, totalDistance: Math.max(0, totalDistance), averageDaily });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/readings/:vehicleId — History
router.get('/:vehicleId', async (req, res) => {
  try {
    const readings = await Reading.find({ 
      vehicleId: req.params.vehicleId.toUpperCase() 
    })
    .sort({ readingDate: -1 })
    .limit(100)
    .select('-__v');  // Exclude version key
    
    res.json(readings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;