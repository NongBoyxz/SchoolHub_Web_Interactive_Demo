# SchoolHub Cloudflare v1.6 — โรงเรียนเทพศาลาประชาสรรค์

This codebase deploys to Cloudflare Pages Functions and the existing D1 `DB` binding. Do not commit database exports, real student rosters, access tokens, or user passwords.

## Changes in 1.6

1. Counts for all filtered student search results.
2. Student totals by room in Dashboard, respecting role permissions.
3. Nontechnical end-user Login.
4. Manual entry mode in student and club Excel-import preview/commit flows.
5. Activity-form download derived from the user's supplied original `ตารางเช็คเวลาเรียน 2.69.xlsx`, in blank or populated mode. PDF output, club attendance and assessment are **not yet** supported.

The bundled blank original is `public/templates/SchoolHub_Attendance_2_69_Original.xlsx`; its six worksheets are preserved in generated XLSX. A roster per club/room is fetched from D1 only after authorization. Community attendance is included only where actually recorded. Up to 41 students fit on one worksheet; a multi-page roster downloads as a ZIP of several XLSX files. Dates are not inferred from a hardcoded template; set a start date or use saved community session dates.

## Upgrade

No migration is necessary from v1.5.0; **never rerun the earlier real-data reset importer**. Verify the existing `DB` binding and Back up D1 before deploying. Copy the `update/` directory into the existing Git checkout, run `npm run check && npm test`, then push the testing branch.

See `INSTALL_TH_v1.6.md` for a full Ubuntu walkthrough and checks.
