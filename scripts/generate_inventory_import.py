from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path


NUMBERED_TITLE = re.compile(r"^\s*\d+\.\s+(.*?)\s*$")


def repair_mojibake(value: str) -> str:
    value = value.strip()
    for _ in range(2):
        try:
            candidate = value.encode("cp1252").decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            break
        bad_before = sum(value.count(marker) for marker in ("Ã", "Â", "â", "à´", "àµ"))
        bad_after = sum(candidate.count(marker) for marker in ("Ã", "Â", "â", "à´", "àµ"))
        scripts_before = sum(0x0900 <= ord(char) <= 0x0D7F for char in value)
        scripts_after = sum(0x0900 <= ord(char) <= 0x0D7F for char in candidate)
        if bad_after < bad_before or scripts_after > scripts_before:
            value = candidate
        else:
            break
    return unicodedata.normalize("NFC", value).strip()


def canonical_key(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def contains_script(value: str, start: int, end: int) -> bool:
    return any(start <= ord(char) <= end for char in value)


def detect_language(title: str) -> str:
    if contains_script(title, 0x0D00, 0x0D7F):
        return "Malayalam"
    if contains_script(title, 0x0B80, 0x0BFF):
        return "Tamil"
    if contains_script(title, 0x0C00, 0x0C7F):
        return "Telugu"
    if contains_script(title, 0x0C80, 0x0CFF):
        return "Kannada"
    if contains_script(title, 0x0900, 0x097F):
        return "Hindi"
    lowered = title.casefold()
    for marker, language in (
        ("tamil", "Tamil"),
        ("hindi", "Hindi"),
        ("english", "English"),
        ("kannada", "Kannada"),
        ("telugu", "Telugu"),
    ):
        if marker in lowered:
            return language
    return "Malayalam"


def sql_text(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def load_titles(source: Path) -> list[str]:
    titles = []
    seen = set()
    for line in source.read_text(encoding="utf-8").splitlines():
        match = NUMBERED_TITLE.match(line)
        if not match:
            continue
        title = repair_mojibake(match.group(1))
        if not title:
            continue
        key = canonical_key(title)
        if key in seen:
            continue
        seen.add(key)
        titles.append(title)
    return titles


def generate(source: Path, destination: Path) -> None:
    titles = load_titles(source)
    declared_match = re.search(r"\*\*Total Songs:\*\*\s*(\d+)", source.read_text(encoding="utf-8"))
    declared = int(declared_match.group(1)) if declared_match else None
    if declared is not None and len(titles) != declared:
        raise ValueError(f"Expected {declared} unique titles, parsed {len(titles)}")

    rows = []
    language_counts: dict[str, int] = {}
    for index, title in enumerate(titles, start=1):
        language = detect_language(title)
        language_counts[language] = language_counts.get(language, 0) + 1
        has_malayalam = contains_script(title, 0x0D00, 0x0D7F)
        english_title = None if has_malayalam else title
        malayalam_title = title if has_malayalam else None
        rows.append(
            "  ("
            + ", ".join(
                (
                    str(index),
                    sql_text(title),
                    sql_text(english_title),
                    sql_text(malayalam_title),
                    sql_text(language),
                )
            )
            + ")"
        )

    language_summary = ", ".join(f"{name}={count}" for name, count in sorted(language_counts.items()))
    sql = f"""-- Generated from {source.name}.
-- Source rows: {len(titles)}. Detected languages: {language_summary}.
-- Safe to rerun: an existing active track with the same normalized title is skipped.

begin;

do $$
begin
  if to_regclass('public.inventory_tracks') is null then
    raise exception 'AK OCP schema is missing. Run supabase/schema.sql first.';
  end if;
end
$$;

create temporary table akocp_inventory_import (
  source_index integer primary key,
  track_name text not null,
  english_title text,
  malayalam_title text,
  language text not null
) on commit drop;

insert into akocp_inventory_import (source_index, track_name, english_title, malayalam_title, language)
values
{',\n'.join(rows)};

create temporary table akocp_inventory_inserted on commit drop as
with inserted as (
  insert into public.inventory_tracks (
    track_name,
    english_title,
    malayalam_title,
    language,
    tags
  )
  select
    source.track_name,
    source.english_title,
    source.malayalam_title,
    source.language,
    array['karaoke', 'bulk-import', 'final-song-list']::text[]
  from akocp_inventory_import source
  where not exists (
    select 1
    from public.inventory_tracks existing
    where existing.deleted_at is null
      and lower(regexp_replace(trim(existing.track_name), '\\s+', ' ', 'g')) =
          lower(regexp_replace(trim(source.track_name), '\\s+', ' ', 'g'))
  )
  order by source.source_index
  returning track_name
)
select track_name from inserted;

select
  (select count(*) from akocp_inventory_import) as source_rows,
  (select count(*) from akocp_inventory_inserted) as inserted_rows,
  (select count(*) from akocp_inventory_import) -
    (select count(*) from akocp_inventory_inserted) as skipped_existing_rows,
  (select count(*) from public.inventory_tracks where deleted_at is null) as active_inventory_total;

commit;
"""
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(sql, encoding="utf-8", newline="\n")
    print(f"Generated {destination} with {len(titles)} unique tracks ({language_summary}).")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: generate_inventory_import.py SOURCE.md DESTINATION.sql")
    generate(Path(sys.argv[1]), Path(sys.argv[2]))
