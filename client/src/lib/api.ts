import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('clinic_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear session and bounce to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('clinic_token');
      localStorage.removeItem('clinic_user');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Extract a human-friendly message from an axios error
export function errMsg(e: any): string {
  const data = e?.response?.data;
  if (data?.details?.length) {
    return data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
  }
  return data?.error || e?.message || 'Something went wrong';
}

// Build an absolute URL for a stored file (opens in new tab with auth via query is not needed since
// file route requires auth header; we fetch as blob instead — see helpers below).
export async function openFile(path: string, download = false) {
  const url = path.startsWith('http') ? path : `/api${path}`;
  const res = await api.get(url.replace('/api', ''), { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  if (download) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = '';
    a.click();
  } else {
    window.open(blobUrl, '_blank');
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
