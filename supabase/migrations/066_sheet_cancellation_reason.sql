-- Add cancellation reason and optional message to signup_sheets
ALTER TABLE signup_sheets
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT
    CHECK (cancellation_reason IN ('lack_of_interest', 'inclement_weather', 'other')),
  ADD COLUMN IF NOT EXISTS cancellation_message TEXT;
