-- ============================================================================
-- Database Migration Script for DemandForecast API
-- ============================================================================

-- Add full_name column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';


-- This script adds necessary columns to the forecasts table to support:
-- 1. Individual model metrics (Prophet, LSTM) for comparison endpoint
-- 2. Prophet decomposition components for components endpoint
-- 3. Alpha coefficient (already exists, but included for completeness)
-- ============================================================================

-- Add columns for individual model metrics (stored as JSONB)
ALTER TABLE forecasts 
ADD COLUMN IF NOT EXISTS prophet_metrics JSONB,
ADD COLUMN IF NOT EXISTS lstm_metrics JSONB;

-- Add column for Prophet decomposition components (stored as JSONB)
ALTER TABLE forecasts 
ADD COLUMN IF NOT EXISTS prophet_components JSONB;

-- Add comment to document the structure
COMMENT ON COLUMN forecasts.prophet_metrics IS 'Prophet model metrics: {"mae": float, "rmse": float, "mape": float, "r2": float}';
COMMENT ON COLUMN forecasts.lstm_metrics IS 'LSTM model metrics: {"mae": float, "rmse": float, "mape": float, "r2": float}';
COMMENT ON COLUMN forecasts.prophet_components IS 'Prophet decomposition: {"dates": [str], "trend": [float], "weekly": [float], "yearly": [float], "holidays": [float]}';

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'forecasts'
  AND column_name IN ('prophet_metrics', 'lstm_metrics', 'prophet_components', 'alpha')
ORDER BY column_name;

-- ============================================================================
-- Expected Output:
-- column_name         | data_type | is_nullable
-- --------------------+-----------+-------------
-- alpha               | numeric   | YES
-- lstm_metrics        | jsonb     | YES
-- prophet_components  | jsonb     | YES
-- prophet_metrics     | jsonb     | YES
-- ============================================================================
