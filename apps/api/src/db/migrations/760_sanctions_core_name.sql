-- Sanctions screening compared whole names by trigram similarity, so shared
-- legal-form words dominated the score: "Aleka Holdings Ltd" scored 0.59
-- against "RG HOLDINGS LTD" (flag threshold 0.45) purely on "HOLDINGS LTD",
-- and "Moovit Mobility Limited" 0.43 against "LIMITED LIABILITY COMPANY …".
-- Every "<name> Holdings Ltd" customer landed in the review queue, which
-- trains reviewers to clear flags without reading them.
--
-- sanctions_core_name() keeps only the distinctive part of a name: lower-
-- cased, legal-form and filler words removed, whitespace collapsed. Screening
-- compares core names, so real designations still score 1.00 ("Rosneft Oil
-- Company" vs "OAO ROSNEFT OIL COMPANY", "Mahan Air" vs "MAHAN AIR CO.").
CREATE OR REPLACE FUNCTION sanctions_core_name(name text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(lower(coalesce(name, '')),
      '\m(ltd|limited|liability|holdings?|co|company|companies|inc|incorporated|llc|llp|plc|group|trading|international|intl|corp|corporation|the|and|of|sa|s\.a|gmbh|bv|ag|enterprises?|services?|industries|global|ooo|zao|oao|pjsc|jsc|fze|fzco|pvt|private)\M\.?',
      ' ', 'g'),
    '\s+', ' ', 'g'))
$$;
