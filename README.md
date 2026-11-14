# SchoolHub Cloudflare v1.6.2 — โรงเรียนเทพศาลาประชาสรรค์

This codebase deploys to Cloudflare Pages Functions and the existing D1 `DB` binding. Do not commit database exports, real student rosters, access tokens, or user passwords.

## Changes in 1.6.2

- **Super Admin only:** open **บัญชีและสิทธิ์ → ดู/ลบประวัติการลบบัญชี** or go to **ประวัติการแก้ไข** to see all account-removal audit records, 50 per page.
- Permanently delete **one selected `remove_user` audit entry** after supplying a reason (at least 5 characters) and typing `ลบประวัติ` exactly. This affects the active D1 audit table; database backups may still contain older copies.
- A separate minimal `purge_user_removal_history` audit event is retained to identify which record was purged and by whom. Removing an event does **not** delete/deactivate/restore the actual user or delete any other audit records.
- Admin and Teacher roles cannot view or purge this special history via the API. Server checks permissions and records audit atomically.
- No migration required. Back up D1; don't run `apply_real_data.py` or earlier migrations again.

See `INSTALL_TH_v1.6.2.md` for the Ubuntu upgrade steps.

## Changes in 1.6.1

- Super Admin can remove (deactivate) user accounts from **บัญชีและสิทธิ์**, with required reason and exact username confirmation; active sessions and teacher assignments are revoked transactionally.
- Only Super Admin may restore deactivated accounts. On restore all Excel import permissions remain disabled, and homeroom/club assignments must be granted again.
- Self-removal and removal of the final active Super Admin are blocked in both API and UI.
- No hard deletion of `users` rows, so attendance, imports and audit references remain valid. Deactivated usernames remain reserved.
- No schema migration. Back up D1 before deploying v1.6.1; do not rerun real-data import or earlier migrations.

See `INSTALL_TH_v1.6.1.md` for Ubuntu instructions.

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
