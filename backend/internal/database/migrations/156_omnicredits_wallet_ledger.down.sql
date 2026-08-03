DROP TRIGGER IF EXISTS omnicredits_ledger_no_delete ON omnicredits_ledger;
DROP TRIGGER IF EXISTS omnicredits_ledger_no_update ON omnicredits_ledger;
DROP FUNCTION IF EXISTS prevent_omnicredits_ledger_mutation();
DROP TABLE IF EXISTS omnicredits_ledger;
DROP TABLE IF EXISTS omnicredits_wallets;
