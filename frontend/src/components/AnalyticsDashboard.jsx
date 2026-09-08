import { useEffect, useMemo, useState } from 'react';
import api from '../api';

const formatNumber = (value) => Math.round(value || 0).toLocaleString();

const formatKm = (value) => `${formatNumber(value)} km`;

const formatPercent = (value) => `${Math.round((value || 0) * 100)}%`;

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatUsageDate = (value) => {
  if (!value) {
    return '-';
  }

  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short'
  });
};

const KpiCard = ({ label, value, subtext, tone = 'brand', icon }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100'
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-slate-950 mt-2">{value}</p>
          {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tones[tone]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const BarChart = ({ data }) => {
  const maxDistance = Math.max(...data.map(item => item.distance), 1);

  return (
    <div className="h-72">
      <svg viewBox="0 0 640 260" className="w-full h-full" role="img" aria-label="Monthly mileage trend">
        {[0, 1, 2, 3].map(index => {
          const y = 26 + index * 54;
          return (
            <g key={y}>
              <line x1="28" y1={y} x2="612" y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
            </g>
          );
        })}

        {data.map((item, index) => {
          const width = 52;
          const gap = 42;
          const x = 54 + index * (width + gap);
          const height = Math.max((item.distance / maxDistance) * 158, item.distance > 0 ? 8 : 0);
          const y = 194 - height;

          return (
            <g key={item.key}>
              <rect x={x} y={y} width={width} height={height} rx="8" fill="#2563eb" opacity="0.92" />
              <rect x={x} y={y} width={width} height="10" rx="8" fill="#60a5fa" opacity="0.7" />
              <text x={x + width / 2} y="224" textAnchor="middle" fontSize="12" fill="#64748b" fontWeight="600">
                {item.label.split(' ')[0]}
              </text>
              <text x={x + width / 2} y="242" textAnchor="middle" fontSize="11" fill="#94a3b8">
                {formatNumber(item.distance)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const UtilizationBar = ({ value, max }) => {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 7 : 0) : 0;

  return (
    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden min-w-28">
      <div className="h-full bg-brand-600 rounded-full" style={{ width: `${width}%` }} />
    </div>
  );
};

const EmptyState = ({ title, text }) => (
  <div className="text-center py-14">
    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 mx-auto mb-3 flex items-center justify-center">
      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M11 3v18m8-14v10M5 9v6" />
      </svg>
    </div>
    <p className="font-semibold text-slate-700">{title}</p>
    <p className="text-sm text-slate-500 mt-1">{text}</p>
  </div>
);

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/admin/analytics');
      setAnalytics(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadInitialData = async () => {
      try {
        const res = await api.get('/admin/analytics');

        if (isActive) {
          setAnalytics(res.data);
        }
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load analytics');
        }
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
  }, []);

  const maxVehicleDistance = useMemo(() => {
    const rows = analytics?.vehicleUsage || [];
    return Math.max(...rows.map(vehicle => vehicle.totalDistance), 1);
  }, [analytics]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-32 bg-white border border-slate-200 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 h-96 bg-white border border-slate-200 rounded-xl" />
          <div className="h-96 bg-white border border-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchAnalytics} className="btn-primary mt-4">Retry</button>
      </div>
    );
  }

  const kpis = analytics?.kpis || {};
  const monthlyTrend = analytics?.monthlyTrend || [];
  const vehicleUsage = analytics?.vehicleUsage || [];
  const operatorUsage = analytics?.operatorUsage || [];
  const driverVehicleUsage = analytics?.driverVehicleUsage || [];
  const topVehicles = vehicleUsage.slice(0, 8);
  const topOperators = operatorUsage.slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin</p>
          <h2 className="text-2xl font-bold text-slate-950 mt-0.5">Fleet Analytics</h2>
          <p className="text-sm text-slate-500 mt-1">
            Executive mileage insights across vehicles, drivers, usage, and OCR quality.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-slate-400">
            Updated {analytics?.generatedAt ? new Date(analytics.generatedAt).toLocaleString() : '-'}
          </p>
          <button onClick={fetchAnalytics} className="btn-secondary self-start sm:self-auto">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 15A8 8 0 1118.364 8.636" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Distance"
          value={formatKm(kpis.totalDistance)}
          subtext={`${formatKm(kpis.monthDistance)} this month`}
          tone="brand"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 7-8" />
            </svg>
          }
        />
        <KpiCard
          label="Fleet Availability"
          value={`${formatNumber(kpis.activeVehicles)} active`}
          subtext={`${formatNumber(kpis.totalVehicles)} total vehicles`}
          tone="emerald"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
            </svg>
          }
        />
        <KpiCard
          label="Readings"
          value={formatNumber(kpis.totalReadings)}
          subtext={`${formatPercent(kpis.correctionRate)} manually corrected`}
          tone="amber"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
          }
        />
        <KpiCard
          label="OCR Quality"
          value={formatPercent(kpis.averageConfidence)}
          subtext={`${formatNumber(kpis.suspiciousReadings)} suspicious reading changes`}
          tone={kpis.suspiciousReadings > 0 ? 'rose' : 'slate'}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Monthly Mileage Trend</h3>
              <p className="text-sm text-slate-500 mt-1">Mileage added by confirmed odometer movement over the last 6 months.</p>
            </div>
            <span className="inline-flex self-start rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Last 6 months
            </span>
          </div>
          {monthlyTrend.some(month => month.distance > 0) ? (
            <BarChart data={monthlyTrend} />
          ) : (
            <EmptyState title="No trend yet" text="More than one reading per vehicle is needed to calculate mileage movement." />
          )}
        </section>

        <section className="bg-slate-950 rounded-xl shadow-sm p-6 text-white">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-lg font-semibold">Fleet Snapshot</h3>
              <p className="text-sm text-slate-400 mt-1">Operational status for management review.</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3v18m8-14v10M5 9v6" />
              </svg>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-300">Active vehicles</span>
                <span className="font-semibold">{formatNumber(kpis.activeVehicles)} / {formatNumber(kpis.totalVehicles)}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${kpis.totalVehicles ? (kpis.activeVehicles / kpis.totalVehicles) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-2xl font-bold">{formatNumber(kpis.totalUsers)}</p>
                <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Users</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-2xl font-bold">{formatNumber(kpis.totalDrivers)}</p>
                <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Drivers</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-2xl font-bold">{formatNumber(kpis.unassignedVehicles)}</p>
                <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Unassigned</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-2xl font-bold">{formatKm(kpis.monthDistance)}</p>
                <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">Month km</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Vehicle Usage Analytics</h3>
              <p className="text-sm text-slate-500 mt-1">Highest utilization vehicles based on odometer distance.</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{vehicleUsage.length} vehicles</span>
          </div>

          {topVehicles.length === 0 ? (
            <EmptyState title="No vehicles found" text="Create vehicles and capture readings to see usage analytics." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usage</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total km</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">This month</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last reading</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topVehicles.map(vehicle => (
                    <tr key={vehicle.vehicleNumber} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-mono text-sm font-bold text-slate-950">{vehicle.vehicleNumber}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {[vehicle.make, vehicle.name, vehicle.model].filter(Boolean).join(' ') || 'Vehicle details unavailable'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <UtilizationBar value={vehicle.totalDistance} max={maxVehicleDistance} />
                        <p className="text-xs text-slate-400 mt-1">{vehicle.readingCount} readings</p>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-slate-900">{formatKm(vehicle.totalDistance)}</td>
                      <td className="px-4 py-4 text-right font-mono text-sm text-slate-600">{formatKm(vehicle.monthDistance)}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{formatDate(vehicle.lastReadingDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-950">Driver/User Analytics</h3>
            <p className="text-sm text-slate-500 mt-1">Mileage contribution by submitted readings.</p>
          </div>

          {topOperators.length === 0 ? (
            <EmptyState title="No operators yet" text="Captured readings will appear here by driver or user." />
          ) : (
            <div className="divide-y divide-slate-100">
              {topOperators.map((operator, index) => (
                <div key={operator.key} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950 truncate">{operator.name}</p>
                          <p className="text-xs text-slate-500 capitalize">{operator.role}</p>
                        </div>
                      </div>
                    </div>
                    <p className="font-mono text-sm font-bold text-brand-700 whitespace-nowrap">{formatKm(operator.totalDistance)}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {operator.vehicles.slice(0, 4).map(vehicle => (
                      <span key={vehicle} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-mono font-semibold text-slate-600">
                        {vehicle}
                      </span>
                    ))}
                    {operator.vehicles.length > 4 && (
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                        +{operator.vehicles.length - 4}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>{operator.readingCount} readings</span>
                    <span>{formatDate(operator.lastReadingDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Driver &amp; Vehicle Usage</h3>
            <p className="text-sm text-slate-500 mt-1">Daily, weekly, and monthly mileage by user and vehicle.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">{driverVehicleUsage.length} user-vehicle records</span>
        </div>

        {driverVehicleUsage.length === 0 ? (
          <EmptyState title="No daily usage yet" text="Consecutive daily readings for the same user and vehicle are required." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User / Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Latest Daily Usage</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">This Week</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">This Month</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Daily Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {driverVehicleUsage.map(usage => (
                  <tr key={usage.key} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-950">{usage.name}</p>
                      <p className="text-xs text-slate-500 mt-1 capitalize">
                        {usage.employeeId || usage.username || usage.role}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-mono text-sm font-semibold text-slate-900">{usage.vehicleNumber}</td>
                    <td className="px-4 py-4">
                      <p className="font-mono text-sm font-semibold text-brand-700">{formatKm(usage.latestDailyUsage?.distance)}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatUsageDate(usage.latestDailyUsage?.date)}: {formatNumber(usage.latestDailyUsage?.startMileage)} to {formatNumber(usage.latestDailyUsage?.endMileage)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-slate-900">{formatKm(usage.weekDistance)}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-slate-900">{formatKm(usage.monthDistance)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-sm">
                        {usage.dailyUsage.map(day => (
                          <span key={day.date} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            <span className="font-semibold">{formatUsageDate(day.date)}</span> {formatKm(day.distance)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AnalyticsDashboard;
