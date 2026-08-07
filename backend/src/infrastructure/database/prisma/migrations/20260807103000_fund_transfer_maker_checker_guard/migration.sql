CREATE OR REPLACE FUNCTION enforce_fund_transfer_maker_checker()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.confirmed_by_user_id IS NOT NULL
     AND NEW.confirmed_by_user_id = NEW.created_by_user_id THEN
    RAISE EXCEPTION 'Fund transfer maker cannot confirm their own transfer'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fund_transfer_maker_checker
BEFORE INSERT OR UPDATE OF created_by_user_id, confirmed_by_user_id ON fund_transfers
FOR EACH ROW EXECUTE FUNCTION enforce_fund_transfer_maker_checker();
