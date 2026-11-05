import { useEffect, useState } from 'react';
import api from '../api';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatNumber = (value) => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2
}).format(value || 0);

const formatMoney = (value) => new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(value || 0);

const FuelUsageDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [month, setMonth] = useState(currentMonth);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [validationDetails, setValidationDetails] = useState([]);

  const loadSummary = async (selectedMonth = month) => {
    const response = await api.get('/fuel-usage/summary', { params: { month: selectedMonth } });
    setSummary(response.data);
  };

  useEffect(() => {
    let active = true;

    api.get('/fuel-usage/summary', { params: { month } })
      .then(response => {
        if (active) {
          setSummary(response.data);
        }
      })
      .catch(err => {
        if (active) {
          setError(err.response?.data?.error || 'Failed to load fuel usage data');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [month]);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Choose an .xlsx file first');
      return;
    }

    setUploading(true);
    setError('');
    setNotice('');
    setValidationDetails([]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', month);

    try {
      const response = await api.post('/fuel-usage/upload', formData);
      setNotice(response.data.message);
      setFile(null);
      event.target.reset();
      const importedMonth = response.data.batch?.reportMonth || month;
      if (importedMonth !== month) {
        setMonth(importedMonth);
      }
      try {
        await loadSummary(importedMonth);
      } catch (err) {
        setError(err.response?.data?.error || 'The import succeeded, but the dashboard could not be refreshed');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload Excel file');
      setValidationDetails(err.response?.data?.details || []);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-white border border-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-24 bg-white border border-slate-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const totals = summary?.totals || {};

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Fuel Usage</h2>
          <p className="text-sm text-slate-500 mt-1">Review imported fuel reports for any month.</p>
        </div>
        <label className="text-sm font-medium text-slate-600">
          Report month
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setLoading(true);
              setError('');
              setNotice('');
            }}
            className="input mt-1"
          />
        </label>
      </div>

      <section className="card">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-slate-900">Import monthly workbook</h3>
          <p className="text-sm text-slate-500 mt-1">
            Upload one .xlsx workbook containing both reports. The workbook&apos;s report period is used when available;
            otherwise, the selected month is used. Imports are appended.
          </p>
        </div>

        <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError('');
              setNotice('');
              setValidationDetails([]);
            }}
            className="input bg-white"
            aria-label="Select monthly Excel workbook"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Upload workbook'}
          </button>
        </form>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">Required workbook sheets</p>
            <p className="text-xs text-slate-500 mt-1">
              Fuel type sheet: <strong>Fuel, Liters, Amount</strong>. Vehicle sheet:
              <strong> User_Name, Vehicle, TRNX_Lit_Val, TRNX_Rs_Value, Card_Quota</strong>.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Vehicle rows are imported even if a vehicle number is not in Vehicle Management; those rows show
              &quot;Unassigned&quot; for division. Division is fetched from the vehicle record when matched. The
              workbook&apos;s Other_Detail column is ignored. Maximum file size: 10 MB.
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 overflow-x-auto">
            <p className="text-sm font-semibold text-slate-800 mb-2">Workbook example</p>
            <div className="grid grid-cols-1 gap-3 text-xs">
              <div>
                <p className="font-medium text-slate-600 mb-1">Fuel type sheet</p>
                <p className="font-mono text-slate-700">Fuel | Liters | Amount</p>
              </div>
              <div>
                <p className="font-medium text-slate-600 mb-1">Vehicle usage sheet</p>
                <p className="font-mono text-slate-700">User_Name | Vehicle | TRNX_Lit_Val | TRNX_Rs_Value | Card_Quota | Other_Detail</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            <p>{error}</p>
            {validationDetails.length > 0 && (
              <ul className="list-disc pl-5 mt-2 space-y-1">
                {validationDetails.map(detail => <li key={detail}>{detail}</li>)}
              </ul>
            )}
          </div>
        )}
        {notice && <p className="mt-4 text-sm font-medium text-emerald-700" role="status">{notice}</p>}
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-2xl font-bold text-brand-700">{formatNumber(totals.totalUsage)} L</p>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Fuel-type total liters</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-slate-900">{formatMoney(totals.totalAmount)}</p>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Fuel-type total amount</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-emerald-700">{totals.vehicles || 0}</p>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Vehicles reporting</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-indigo-700">{totals.fuelTypes || 0}</p>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">Fuel products</p>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Fuel usage by type</h3>
          <p className="text-xs text-slate-500 mt-1">Totals from the Fuel, Liters, Amount sheet for {month}.</p>
        </div>
        {!summary?.fuelTypeTotals?.length ? (
          <div className="text-center py-10 text-sm text-slate-500">No fuel-type report has been imported for {month}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Fuel</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Liters</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.fuelTypeTotals.map(item => (
                  <tr key={item.fuelType}>
                    <td className="py-3 text-sm font-semibold text-slate-900">{item.fuelType}</td>
                    <td className="py-3 text-right font-mono text-sm text-slate-900">{formatNumber(item.liters)}</td>
                    <td className="py-3 text-right font-mono text-sm text-slate-900">{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Fuel usage per vehicle</h3>
          <p className="text-xs text-slate-500 mt-1">
            {summary?.perVehicle?.length || 0} rows for {month}. Division comes from Vehicle Management.
          </p>
        </div>
        {!summary?.perVehicle?.length ? (
          <div className="text-center py-10 text-sm text-slate-500">No vehicle usage report has been imported for {month}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">User_Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Vehicle</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">TRNX_Lit_Val</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">TRNX_Rs_Value</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Card_Quota</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pl-4">Division</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.perVehicle.map(row => (
                  <tr key={row._id} className="hover:bg-slate-50">
                    <td className="py-3 text-sm text-slate-700">{row.userName || '—'}</td>
                    <td className="py-3 font-mono text-sm font-semibold text-slate-900">{row.vehicleNumber}</td>
                    <td className="py-3 text-right font-mono text-sm text-slate-900">{formatNumber(row.liters)}</td>
                    <td className="py-3 text-right font-mono text-sm text-slate-900">{formatMoney(row.amount)}</td>
                    <td className="py-3 text-right font-mono text-sm text-slate-700">{row.cardQuota == null ? '—' : formatNumber(row.cardQuota)}</td>
                    <td className="py-3 pl-4 text-right text-sm text-slate-600">{row.division}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Imports for {month}</h3>
        {!summary?.recentImports?.length ? (
          <p className="text-sm text-slate-500">No workbooks imported for this month.</p>
        ) : (
          <div className="space-y-3">
            {summary.recentImports.map(batch => (
              <div key={batch._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">{batch.fileName}</p>
                  <p className="text-xs text-slate-500">Imported by {batch.importedBy?.name || 'Admin'}</p>
                </div>
                <p className="text-xs text-slate-500">{batch.rowCount} rows · {new Date(batch.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default FuelUsageDashboard;
