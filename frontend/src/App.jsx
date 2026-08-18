import React, { useState } from 'react';
import MeterCapture from './components/MeterCapture';
import ReadingHistory from './components/ReadingHistory';

function App() {
  const [vehicleId, setVehicleId] = useState('');
  const [activeVehicle, setActiveVehicle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStart = (e) => {
    e.preventDefault();
    const trimmed = vehicleId.trim().toUpperCase();
    if (trimmed) {
      setIsSubmitting(true);
      setTimeout(() => {
        setActiveVehicle(trimmed);
        setIsSubmitting(false);
      }, 300);
    }
  };

  const handleReset = () => {
    setActiveVehicle('');
    setVehicleId('');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Fleet Mileage</h1>
              <p className="text-xs text-slate-500">OCR-powered odometer tracking</p>
            </div>
          </div>
          
          {activeVehicle && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
                <span className="text-xs text-slate-500 font-medium">Vehicle</span>
                <span className="text-sm font-bold text-slate-900 font-mono">{activeVehicle}</span>
              </div>
              <button onClick={handleReset} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
                Change
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {!activeVehicle ? (
          <div className="max-w-md mx-auto mt-16">
            <div className="card text-center">
              <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome</h2>
              <p className="text-slate-500 mb-8">Enter your vehicle ID to start recording mileage</p>
              
              <form onSubmit={handleStart} className="space-y-4">
                <div>
                  <label className="block text-left text-sm font-medium text-slate-700 mb-1.5">
                    Vehicle ID
                  </label>
                  <input
                    type="text"
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    placeholder="e.g., VH-2024-001"
                    className="input text-center text-lg font-mono tracking-wider uppercase"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!vehicleId.trim() || isSubmitting}
                  className="btn-primary w-full py-3 text-base"
                >
                  {isSubmitting ? 'Loading...' : 'Start Recording →'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Capture */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                <h2 className="text-lg font-semibold text-slate-900">New Reading</h2>
              </div>
              <MeterCapture vehicleId={activeVehicle} userId="user_001" />
            </div>

            {/* Right: History */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">History & Stats</h2>
              <ReadingHistory vehicleId={activeVehicle} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-center text-sm text-slate-400">
          Images are processed in-memory and never stored · Powered by EasyOCR
        </div>
      </footer>
    </div>
  );
}

export default App;