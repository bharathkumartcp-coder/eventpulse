import axios from 'axios';

// Base API URL — defaults to live Render backend in production
const API_URL = 'https://eventpulse-1ltw.onrender.com';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ep_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global error handler — redirect to login on 401 only if not already on login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ep_token');
      localStorage.removeItem('ep_user');
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  register: (data)  => api.post('/api/auth/register', data),
  login:    (data)  => api.post('/api/auth/login', data),
  me:       ()      => api.get('/api/auth/me'),
};

// ── Events ────────────────────────────────────────────────
export const eventsAPI = {
  list:   ()           => api.get('/api/events'),
  get:    (id)         => api.get(`/api/events/${id}`),
  create: (data)       => api.post('/api/events', data),
  update: (id, data)   => api.put(`/api/events/${id}`, data),
  delete: (id)         => api.delete(`/api/events/${id}`),
};

// ── Attendees ─────────────────────────────────────────────
export const attendeesAPI = {
  list:   (eventId, params) => api.get(`/api/events/${eventId}/attendees`, { params }),
  add:    (eventId, data)   => api.post(`/api/events/${eventId}/attendees`, data),
  import: (eventId, file)   => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/api/events/${eventId}/attendees/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getQR:    (eventId, attendeeId) =>
    `${API_URL}/api/events/${eventId}/attendees/${attendeeId}/qr`,
  getQRJson:(eventId, attendeeId) =>
    api.get(`/api/events/${eventId}/attendees/${attendeeId}/qr?format=json`),
  export:   (eventId) =>
    `${API_URL}/api/events/${eventId}/attendees/export`,
};

// ── Check-In ──────────────────────────────────────────────
export const checkInAPI = {
  scan: (eventId, data) => api.post(`/api/events/${eventId}/check-in`, data),
};

// ── Analytics / Dashboard ─────────────────────────────────
export const analyticsAPI = {
  dashboard:    (eventId) => api.get(`/api/events/${eventId}/dashboard`),
  analytics:    (eventId) => api.get(`/api/events/${eventId}/analytics`),
  checkins:     (eventId, params) => api.get(`/api/events/${eventId}/checkins`, { params }),
  invalidScans: (eventId, params) => api.get(`/api/events/${eventId}/invalid-scans`, { params }),
};

export default api;
