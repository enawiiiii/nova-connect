# Backup and restore runbook

The buyer must own and test the backup process before production data is
accepted. A backup that has never been restored is not a verified backup.

## Scope

Back up all of the following:

- Supabase PostgreSQL schema and data;
- `avatars` and `message-media` storage buckets;
- Render environment-variable names and non-secret configuration;
- provider configuration records for Google, mail, TURN, VAPID, DNS, and
  monitoring;
- the exact source release, SBOM, checksum file, and migration list.

Secrets must be exported through each provider's secure recovery process. Do
not place secret values in the source archive or a shared document.

## Database backup

Use a buyer-controlled machine with the Supabase CLI and a direct database
connection string:

```bash
supabase db dump --db-url "$DATABASE_URL" --file backup/schema.sql
supabase db dump --db-url "$DATABASE_URL" --data-only --use-copy --file backup/data.sql
```

Encrypt the backup at rest, store it outside the production provider, and
record its SHA-256 checksum, creation time, environment, and retention date.

## Restore rehearsal

1. Create an empty buyer-owned staging project.
2. Restore the schema, then the data, using the provider-supported PostgreSQL
   restore process.
3. Restore both storage buckets without making private objects public.
4. Set new staging secrets; never reuse production signing secrets.
5. deploy the matching source release and run every migration that follows the
   backup version.
6. Verify login, one friendship, one chat with media, call history, reports,
   account export, and deletion.
7. Record duration, errors, row counts, storage object counts, and the person
   who approved the rehearsal.

## Schedule and retention

Enable provider point-in-time recovery where available. At minimum, retain
daily encrypted backups for 7 days and a monthly backup according to the
buyer's legal retention policy. Restrict restore access and audit every
download.

## Transfer day

Take a final backup immediately before the agreed cutover, stop writes if a
data migration is included, verify checksums, transfer through encrypted
buyer-controlled storage, rotate every credential, and record written
acceptance before deleting any seller-held copy.
