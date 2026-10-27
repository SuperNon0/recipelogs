-- Recherche : « œ » et « æ » s'écrivent « oe » et « ae » dans le nom replié, pour que « oeufs » trouve « Œufs ».
UPDATE "recipes" SET "name_normalized" = replace(replace(lower("name_normalized"), 'œ', 'oe'), 'æ', 'ae') WHERE "name_normalized" ~* '[œæ]';
