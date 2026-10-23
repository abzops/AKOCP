-- Add searchable romanized aliases to the verified Malayalam-script title.
-- Preserve the original title, language, commercial history, and any English title.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
update public.inventory_tracks
set english_title=coalesce(nullif(trim(english_title),''),'Manmatha Rasa'),
    tags=array(select distinct alias from unnest(coalesce(tags,'{}'::text[]) ||
      array['manmatha rasa','manmadha rasa','manmatharasa','manmadha raasa','മന്മഥ രാസ','മൻമത റാസ']) as alias)
where id='07ea6c07-c0b3-44e1-834d-7e70b335b2f7'
  and track_name='മൻമത റാസ' and deleted_at is null;
commit;
