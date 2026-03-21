-- Migration for AXiM Satellite Protocol

-- Create table for storing registered Satellite Apps
CREATE TABLE IF NOT EXISTS satellite_apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id VARCHAR(255) UNIQUE NOT NULL,
  secret_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for storing pulses (telemetry/events) from Satellite Apps
CREATE TABLE IF NOT EXISTS satellite_pulses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  satellite_app_id VARCHAR(255) REFERENCES satellite_apps(app_id) ON DELETE CASCADE,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB DEFAULT '{}',
  telemetry JSONB DEFAULT '{}',
  user_id VARCHAR(255), -- Optional external user ID provided by satellite app
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on app_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_satellite_pulses_app_id ON satellite_pulses(satellite_app_id);
CREATE INDEX IF NOT EXISTS idx_satellite_pulses_event_type ON satellite_pulses(event_type);

-- Create index on created_at for time-series queries
CREATE INDEX IF NOT EXISTS idx_satellite_pulses_created_at ON satellite_pulses(created_at);
