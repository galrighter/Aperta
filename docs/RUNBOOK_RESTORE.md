# שחזור — עמוד אחד

> נכתב ביום רגוע (15.8.2026), כי במילואים לא כותבים runbooks.
> מקור: `docs/FULL_AUDIT_2026-08.md`, פרק 7, המלצה 6.

**הכלל היחיד לפני הכול: לא לגעת במסד הקיים עד שיש עותק שלו.** גם מסד מושחת
הוא ראיה, ורוב "השחזורים" שנגמרים רע הם שחזור על גבי משהו שעוד היה ניתן להצלה.

## 1. מה קרה? (2 דקות)

| סימן | כנראה | לאן |
|---|---|---|
| האתר עולה, אבל כל פעולה מחזירה 503 עם `schema_outdated` | מיגרציה לא רצה | §5 |
| טבלה ריקה / שורות חסרות | מחיקה בטעות | §3 |
| הפרויקט ב-Supabase לא קיים / paused | הפרויקט עצמו | §4 |
| הכול איטי אבל עובד | לא תקלת נתונים | לא לשחזר |

## 2. איפה הגיבוי

**ראשי — השרת ב-Hetzner**, ‏`/var/backups/aperta/`, יומי, 90 יום אחורה:

```bash
ssh <user>@<hetzner-host> 'ls -lh /var/backups/aperta | tail'
scp <user>@<hetzner-host>:/var/backups/aperta/aperta-db-YYYY-MM-DD.sql.gz.gpg .
```

**משני** — ‏Actions → **Backup database** → הריצה האחרונה שהצליחה → artifact
‏`db-backup-<run_id>`. שבוע בלבד, ורק כשהקובץ מוצפן: הריפו ציבורי, ו-artifact
בריפו ציבורי ניתן להורדה בידי כל בעל חשבון GitHub.

```bash
# פענוח
gpg --batch --passphrase "$BACKUP_PASSPHRASE" -o dump.sql.gz -d aperta-db-YYYY-MM-DD.sql.gz.gpg
gunzip -c dump.sql.gz | head -50      # לוודא שזה מה שנראה
```

**מה יש בו:** כל הסכימה `public` — ‏designs, ‏design_versions (כולל ה-SVG
לחיתוך), ‏orders, ‏profiles, ‏generation_runs, ‏shares.
**מה אין בו:** קבצי Storage (סימוני PNG ותמונות שיתוף — משניים, נוצרים מחדש),
ו-`auth.users` של Supabase. הפרופילים נקשרים לפי מייל, ולכן כניסה מחדש של
לקוחה מחזירה לה את העיצובים.

## 3. שחזור טבלה אחת (הנפוץ)

```bash
# 1. עותק של המצב הנוכחי, לפני הכול
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner > before-restore.sql

# 2. הטבלה מהגיבוי בלבד, לסכימה זמנית
gunzip -c dump.sql.gz | sed 's/public\./restore./g' > restore.sql
psql "$SUPABASE_DB_URL" -c 'create schema if not exists restore;'
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f restore.sql

# 3. להשוות, ורק אז להעביר
psql "$SUPABASE_DB_URL" -c 'select count(*) from restore.orders, public.orders;'
psql "$SUPABASE_DB_URL" -c 'insert into public.orders select * from restore.orders
                            on conflict (id) do nothing;'

# 4. ניקוי
psql "$SUPABASE_DB_URL" -c 'drop schema restore cascade;'
```

## 4. שחזור מלא לפרויקט חדש

1. פרויקט חדש ב-Supabase → להעתיק את ה-**Session pooler** URL (‏IPv4; החיבור
   הישיר הוא IPv6-only ו-runners נכשלים עליו).
2. `gunzip -c dump.sql.gz | psql "$NEW_DB_URL" -v ON_ERROR_STOP=1`
   (‏ה-dump נוצר עם `--clean --if-exists`, ולכן הוא מוחק ובונה מחדש.)
3. `psql "$NEW_DB_URL" -c "notify pgrst, 'reload schema';"`
4. ‏Secrets לעדכן: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` — ב-GitHub וב-Cloudflare Workers.
5. להריץ **Apply Supabase migrations** ידנית — מיגרציה שנוספה אחרי הגיבוי לא
   נמצאת בו.
6. לוודא: כניסה לאתר, ‏`/admin/orders` מציג הזמנות, ייצוא קובץ חיתוך של הזמנה
   אחת מסתיים.

## 5. מסד שחסרה בו מיגרציה

‏Actions → **Apply Supabase migrations** (‏workflow_dispatch). הקבצים
אידמפוטנטיים, והרצה חוזרת שלהם בטוחה. אם ה-workflow לא זמין — להריץ את
`supabase/migrations/*.sql` לפי הסדר ב-SQL Editor.

## 6. אחרי כל שחזור

- להריץ **Canary generation** ידנית — הוא בודק את הצינור המלא מקצה לקצה.
- לבדוק שההזמנה האחרונה מציגה קובץ חיתוך (‏`/admin/orders/<id>` → קבצים).
- לרשום בדוח מה קרה: כל תקלה הופכת לחיישן.
