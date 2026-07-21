-- PLACEHOLDER FIXTURE DATA — not real GEMS members. member/dependant are
-- transactional data, not reference/rules data, so they are seeded with
-- plain SQL rather than through the ingestion pipeline (see db/seed/README.md).
-- benefit-balance.ts's fixture rows reference these member_ids, so load
-- this file before running the ingestion load-all script.

INSERT INTO member (member_id, option_code, status, join_date, prior_cover_months, dob)
VALUES
  ('M-0001', 'TANZANITE_ONE', 'ACTIVE', '2020-03-01', 60, '1985-06-12'),
  ('M-0002', 'BERYL', 'ACTIVE', '2024-11-01', 6, '1978-01-30')
ON CONFLICT (member_id) DO NOTHING;

INSERT INTO dependant (dependant_code, member_id, dob, join_date)
VALUES
  ('01', 'M-0001', '2010-09-05', '2020-03-01')
ON CONFLICT (member_id, dependant_code) DO NOTHING;
