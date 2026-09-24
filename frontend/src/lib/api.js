import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("am_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiErr(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Une erreur est survenue.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((d) => (d && typeof d.msg === "string" ? d.msg : JSON.stringify(d))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export async function downloadFile(path, filename, params) {
  const res = await api.get(path, { params, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
  return `${BACKEND_URL}${res.data.url}`;
}

export default api;
