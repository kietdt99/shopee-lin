# One-time legacy import

The original workbook stays local and must never be committed. The import process reads it once, normalizes date cells as `dd/mm/yyyy`, and produces SQL for Supabase.

The importer includes every monthly sheet, including `05.2026`, and `Góp S25U`. It reports a reconciliation summary and exits on any mismatch from 2,999,619 VND Shopee debt and 18,000,000 VND S25U outstanding. The generated SQL belongs in ignored `supabase/local/` because it contains personal order history.

```powershell
python scripts/import_legacy.py "bé Lin thiếu nợ.xlsx" > supabase/local/import_legacy.sql
```

Review the generated SQL and summary before running it in Supabase SQL Editor. New records are entered through the app after release. Do not publish the workbook or generated SQL in the public repository.
