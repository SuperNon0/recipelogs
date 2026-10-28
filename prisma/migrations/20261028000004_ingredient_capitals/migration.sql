-- Ingrédients : toujours une majuscule au début, et la même écriture partout.
--
-- Une ligne d'ingrédient de recette garde le texte tapé ; la fiche de la base
-- d'ingrédients n'est retrouvée que par le nom sans casse. « purée de
-- framboise » et « Purée de framboise » pointaient donc vers la même fiche,
-- mais s'affichaient chacun comme tapé.

-- 1. Doublons de la base qui ne diffèrent que par la casse : on garde la fiche
--    déjà en majuscule (sinon la plus ancienne), comme une fusion des Réglages.
CREATE TEMP TABLE base_merge AS
SELECT id, keep_id FROM (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY lower(name)
           ORDER BY (left(name, 1) = upper(left(name, 1))) DESC, id
         ) AS keep_id
  FROM "ingredients_base"
) g
WHERE id <> keep_id;

-- L'historique des prix suit le prix gardé : celui des doublons seulement si
-- la fiche gardée n'avait pas de prix (sinon il part avec le doublon supprimé).
UPDATE "ingredient_prices" p SET "base_id" = m.keep_id
FROM base_merge m JOIN "ingredients_base" k ON k.id = m.keep_id
WHERE p."base_id" = m.id AND k."price" IS NULL;

-- La fiche gardée reprend ce qui lui manquait : poids d'une pièce, prix, et
-- tous les allergènes (un allergène perdu fausserait la déclaration).
UPDATE "ingredients_base" k SET
  "piece_g" = COALESCE(k."piece_g", s."piece_g"),
  "category" = COALESCE(k."category", s."category"),
  "price" = COALESCE(k."price", s."price"),
  "price_unit" = CASE WHEN k."price" IS NULL THEN s."price_unit" ELSE k."price_unit" END,
  "allergens" = ARRAY(SELECT DISTINCT a FROM unnest(k."allergens" || s."allergens") a ORDER BY a)
FROM (
  SELECT m.keep_id,
         (array_agg(b."piece_g") FILTER (WHERE b."piece_g" IS NOT NULL))[1] AS "piece_g",
         (array_agg(b."category") FILTER (WHERE b."category" IS NOT NULL))[1] AS "category",
         (array_agg(b."price" ORDER BY b.id) FILTER (WHERE b."price" IS NOT NULL))[1] AS "price",
         (array_agg(b."price_unit" ORDER BY b.id) FILTER (WHERE b."price" IS NOT NULL))[1] AS "price_unit",
         ARRAY(SELECT DISTINCT unnest(array_agg(a.x) FILTER (WHERE a.x IS NOT NULL))) AS "allergens"
  FROM base_merge m
  JOIN "ingredients_base" b ON b.id = m.id
  LEFT JOIN LATERAL unnest(b."allergens") AS a(x) ON true
  GROUP BY m.keep_id
) s
WHERE k.id = s.keep_id;

UPDATE "ingredients" i SET "ingredient_base_id" = m.keep_id
FROM base_merge m
WHERE i."ingredient_base_id" = m.id;

DELETE FROM "ingredients_base" WHERE id IN (SELECT id FROM base_merge);
DROP TABLE base_merge;

-- 2. Fonction commune : première lettre en majuscule, le reste tel quel.
CREATE OR REPLACE FUNCTION capitalize_first(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN s IS NULL OR s = '' THEN s ELSE upper(left(s, 1)) || substr(s, 2) END
$$;

-- 3. La base d'ingrédients passe en majuscule.
UPDATE "ingredients_base" SET "name" = capitalize_first("name")
WHERE "name" <> capitalize_first("name");

-- 4. Les lignes de recette prennent l'écriture exacte de leur fiche (même
--    casse, mêmes accents que la base) ; les autres passent en majuscule.
UPDATE "ingredients" i SET "name" = b."name"
FROM "ingredients_base" b
WHERE i."ingredient_base_id" = b.id AND i."name" IS DISTINCT FROM b."name";

UPDATE "ingredients" i SET "name" = b."name"
FROM "ingredients_base" b
WHERE i."ingredient_base_id" IS NULL AND lower(i."name") = lower(b."name") AND i."name" <> b."name";

UPDATE "ingredients" SET "name" = capitalize_first("name")
WHERE "name" <> capitalize_first("name");

-- 5. À l'avenir : majuscule posée par la base elle-même, quel que soit le
--    chemin (formulaire, import, Claude…).
CREATE OR REPLACE FUNCTION capitalize_name_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."name" := capitalize_first(NEW."name");
  RETURN NEW;
END
$$;

CREATE TRIGGER ingredients_base_capitalize
BEFORE INSERT OR UPDATE OF "name" ON "ingredients_base"
FOR EACH ROW EXECUTE FUNCTION capitalize_name_trigger();

CREATE TRIGGER ingredients_capitalize
BEFORE INSERT OR UPDATE OF "name" ON "ingredients"
FOR EACH ROW EXECUTE FUNCTION capitalize_name_trigger();
