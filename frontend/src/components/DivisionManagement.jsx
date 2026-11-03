import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';

const emptyForm = {
  name: '',
  code: ''
};

const DivisionManagement = () => {
  const [divisions, setDivisions] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingDivision, setDeletingDivision] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchDivisions = async (searchValue = search) => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/divisions', {
        params: searchValue ? { search: searchValue } : {}
      });
      setDivisions(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load divisions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadDivisions = async () => {
      try {
        const res = await api.get('/divisions');

        if (isActive) {
          setDivisions(res.data);
        }
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load divisions');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadDivisions();

    return () => {
      isActive = false;
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const openCreateModal = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setError('');
    setIsModalOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (editingId) {
        await api.put(`/divisions/${editingId}`, formData);
        setSuccess('Division updated successfully');
      } else {
        await api.post('/divisions', formData);
        setSuccess('Division created successfully');
      }

      closeModal();
      await fetchDivisions();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save division');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (division) => {
    setEditingId(division._id);
    setFormData({
      name: division.name || '',
      code: division.code || ''
    });
    setSuccess('');
    setError('');
    setIsModalOpen(true);
  };

  const handleDelete = async (division) => {
    setError('');
    setSuccess('');
    setDeletingDivision(division);
  };

  const confirmDelete = async () => {
    if (!deletingDivision) return;

    try {
      await api.delete(`/divisions/${deletingDivision._id}`);
      setDeletingDivision(null);
      setSuccess('Division deleted successfully');
      await fetchDivisions();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete division');
      setDeletingDivision(null);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDivisions(search.trim());
  };

  return (    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Division Management</h2>
          <p className="text-sm text-slate-500 mt-1">Create and manage company divisions.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={openCreateModal} className="btn-primary self-start sm:self-auto">
            Create Division
          </button>
          <button onClick={() => fetchDivisions()} className="btn-secondary self-start sm:self-auto">
            Refresh
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      {!isModalOpen && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Divisions</h3>
            <p className="text-xs text-slate-500 mt-1">{divisions.length} records</p>
          </div>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full sm:w-64"
              placeholder="Search divisions"
            />
            <button type="submit" className="btn-secondary">Search</button>
          </form>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading divisions...</p>
        ) : divisions.length === 0 ? (
          <p className="text-sm text-slate-500">No divisions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3">Name</th>
                  <th className="py-3">Code</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((division) => (
                  <tr key={division._id} className="border-b border-slate-100">
                    <td className="py-3 font-medium text-slate-900">{division.name}</td>
                    <td className="py-3 text-slate-700">{division.code || '-'}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEdit(division)} className="btn-secondary px-3 py-1.5 text-xs">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(division)} className="btn-danger px-3 py-1.5 text-xs">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && createPortal((
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md"
          role="presentation"
        >
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Update Division' : 'Create Division'}
              </h3>
              <button onClick={closeModal} className="btn-secondary px-3 py-1.5 text-sm" type="button">
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Division Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="input"
                  placeholder="Engineering"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Division Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleChange('code', e.target.value)}
                  className="input uppercase"
                  placeholder="ENG"
                />
              </div>


              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingId ? 'Update Division' : 'Create Division'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {deletingDivision && createPortal((
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900">Delete division?</h3>
            <p className="text-sm text-slate-500 mt-2">This will permanently remove {deletingDivision.name} from division records.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeletingDivision(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={confirmDelete} className="btn-danger">Delete Division</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default DivisionManagement;

