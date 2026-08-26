-- Chat no longer touches OmniCredits.
--
-- This ledger existed to link a delivered reply to the credit reservation that
-- paid for it, and the only profile that ever reserved was ultra_fast, retired
-- in 195. A subscription buys message volume and features; credits pay for
-- image and video, where the cost actually is.
--
-- Any chat hold still sitting in 'reserved' is left alone rather than captured.
-- The retention worker refunds an unlinked hold after fifteen minutes, which is
-- the right answer for a reservation whose reply was never billed.
DROP INDEX IF EXISTS idx_omnichat_chat_billing_deliveries_message;
DROP TABLE IF EXISTS omnichat_chat_billing_deliveries;
