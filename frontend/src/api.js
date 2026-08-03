// Cliente API sencillo con token JWT en localStorage
const TOKEN_KEY = 'rh_token';
const ROL_KEY = 'rh_rol';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROL_KEY); };
export const getRol = () => localStorage.getItem(ROL_KEY);
export const setRol = (r) => localStorage.setItem(ROL_KEY, r || '');

async function req(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    location.reload();
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error');
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
  // Descarga con token (Excel/PDF)
  download: (u) => {
    const token = getToken();
    fetch(`/api${u}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = u.split('/').pop().split('?')[0];
        a.click();
      });
  },
};
