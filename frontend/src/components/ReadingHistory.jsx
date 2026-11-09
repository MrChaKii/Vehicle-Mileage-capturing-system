import { useState, useEffect } from 'react';
import api from '../api';

const ReadingHistory = ({ vehicleId }) => {
  const [readings, setReadings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [readingsRes, statsRes] = await Promise.all([
        api.get(`/readings/${vehicleId}`),
        api.get(`/readings/stats/${vehicleId}`).catch(() => ({ data: null }))
      ]);
      setReadings(readingsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadInitialData = async () => {
      try {
        const [readingsRes, statsRes] = await Promise.all([
          api.get(`/readings/${vehicleId}`),
          api.get(`/readings/stats/${vehicleId}`).catch(() => ({ data: null }))
        ]);

        if (!isActive) {
          return;
        }

        setReadings(readingsRes.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error('Failed to fetch history', err);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isActive = false;
    };
  }, [vehicleId]);

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && stats.totalReadings > 1 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-brand-700">{stats.totalDistance?.toLocaleString()}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Total km</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.averageDaily}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Daily Avg</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-700">{stats.totalReadings}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Readings</p>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Reading History</h3>
          <button onClick={fetchData} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ↻ Refresh
          </button>
        </div>

        {readings.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">No readings yet</p>
            <p className="text-slate-400 text-sm mt-1">Capture your first odometer photo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Date</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Mileage</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">OCR</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3">
                      <p className="text-sm font-medium text-slate-900">
                        {new Date(r.readingDate).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(r.readingDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-sm font-mono font-semibold text-slate-900">
                        {r.extractedMileage.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">km</span>
                    </td>
                    <td className="py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        r.ocrConfidence > 0.8 ? 'bg-emerald-100 text-emerald-800' :
                        r.ocrConfidence > 0.5 ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {(r.ocrConfidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      {r.isCorrected ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edited
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Auto
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReadingHistory;
