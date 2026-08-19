-- A fourth Home Page section, "Loans" — Allison wants it as its own
-- category (not a folder inside General) so multiple loan-related folders
-- don't get lost among unrelated general docs.

alter table resources drop constraint if exists resources_category_check;
alter table resources add constraint resources_category_check
  check (category in ('agents','transactions','general','loans'));

alter table resource_folders drop constraint if exists resource_folders_category_check;
alter table resource_folders add constraint resource_folders_category_check
  check (category in ('agents','transactions','general','loans'));
