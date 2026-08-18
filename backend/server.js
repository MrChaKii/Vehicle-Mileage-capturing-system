require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-mileage')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/readings', require('./routes/readings'));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    ocrService: process.env.OCR_SERVICE_URL || 'http://localhost:8000',
    imageStorage: 'disabled (memory-only)'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));