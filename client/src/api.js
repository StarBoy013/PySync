import axios from "axios";

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:5000`;

export const api = axios.create({ baseURL: `${SERVER_URL}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pysync_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
