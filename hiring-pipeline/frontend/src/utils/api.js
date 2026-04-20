import axios from 'axios';

// Dev token (admin, 1-year expiry, signed with dev-secret-for-trial)
const DEV_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NzMzNzcyOTYsImV4cCI6MTgwNDkxMzI5Nn0.Rkpqbg_5MYfDFWZ7AtWsqsJIIFYbYUahjSUhNGNBLwg';

function getToken() {
  try {
    return localStorage.getItem('token') || DEV_TOKEN;
  } catch {
    // localStorage blocked (iframe/sandbox) — use dev token
    return DEV_TOKEN;
  }
}

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3002/api',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
