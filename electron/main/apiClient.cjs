const axios = require('axios');

const apixClient = axios.create({
  baseURL: process.env.APIX_DRIVE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.APIX_DRIVE_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

const aximClient = axios.create({
  baseURL: process.env.AXIM_CORE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.AXIM_CORE_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

const onyxClient = axios.create({
  baseURL: process.env.ONYX_AI_URL,
  headers: {
    'Authorization': `Bearer ${process.env.ONYX_AI_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

module.exports = { apixClient, aximClient, onyxClient };
