-- When the buyer broker agreement was actually signed — separate from the
-- checkbox and the expiration date, so a lead sitting on an old signed date
-- with no progress can be sorted to the top and followed up on before they
-- drift to another agent.
alter table leads add column if not exists buyer_broker_signed_date date;
