'use client';

import axios from 'axios';
import { getBackendUrl } from './backend-url';

const api = axios.create({
  baseURL: getBackendUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
