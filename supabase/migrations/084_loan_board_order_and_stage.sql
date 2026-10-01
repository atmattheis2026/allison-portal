-- Hand-arranged order on the Loan Clients page (Allison, 2026-10-01).
--
-- Separate from board_position (080), which is her order on the Clients
-- page: the two boards have different columns, so one shared number would
-- let arranging one page reshuffle the other. Smaller = higher; null = not
-- placed yet, shown at the top of its column. Private to her team.

alter table leads add column if not exists loan_board_position double precision;

-- The label beside each name on Loan Clients: 'active' (loan in progress)
-- or 'shopping' (still looking). Null shows a default from the column
-- (In contract = Active, Nurture = Shopping); Refi plan always shows Closed.
alter table leads add column if not exists loan_stage text
  check (loan_stage in ('active', 'shopping'));
