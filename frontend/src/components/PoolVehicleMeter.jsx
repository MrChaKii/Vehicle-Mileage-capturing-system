import { useState, useEffect } from 'react';
import api from '../api';

const normalizeName = (name) => (name || '').trim().toLowerCase();

// The vehicle's latest hire (oldest row first), if it belongs to this person
const getLatestHireRows = (readings, driverName) => {
  const [latest, previous] = readings.filter(reading => reading.meterType);

  if (!latest || normalizeName(latest.driverName) !== normalizeName(driverName)) {
    return [];
  }

  return latest.meterType === 'in' && previous?.meterType === 'out' ? [previous, latest] : [latest];
};

const PoolVehicleMeter = ({ vehicleId, driverName, refreshKey }) => {
  const [readings, setReadings] = useState([]);
  const [initialRefreshKey] = useState(refreshKey);
  const [loadedRefreshKey, setLoadedRefreshKey] = useState(refreshKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    api.get(`/readings/${vehicleId}`)
      .then(res => {
        if (isActive) {
          setReadings(res.data);
          setLoadedRefreshKey(refreshKey);
          setError('');
        }
      })
      .catch(() => {
        if (isActive) {
          setError('Failed to load pool car meter');
        }
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [vehicleId, refreshKey]);

  // A returned hire only stays visible during the visit its IN reading was saved in
  const latestHireRows = getLatestHireRows(readings, driverName);
  const isReturned = latestHireRows.at(-1)?.meterType === 'in';
  const rows = isReturned && loadedRefreshKey === initialRefreshKey ? [] : latestHireRows;

  if (loading || (!error && rows.length === 0)) {
    return null;
  }

  return (
    <div className="card overflow-hidden mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Pool Vehicle Meter</h3>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Meter</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Time</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Mileage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((reading) => (
                <tr key={reading._id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 text-sm font-semibold text-slate-900">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      reading.meterType === 'out' ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {reading.meterType.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3">
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(reading.readingDate).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(reading.readingDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </td>
                  <td className="py-3 text-right">
                    <span className="text-sm font-mono font-semibold text-slate-900">
                      {reading.extractedMileage.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">km</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PoolVehicleMeter;
