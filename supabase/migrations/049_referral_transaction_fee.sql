-- Same referral box as Met eXp Cap / EPIC split / notes — internal only.
alter table leads add column if not exists referral_transaction_fee boolean not null default false;
alter table leads add column if not exists referral_transaction_fee_amount numeric(10,2);
