-- HBS HOME: expose every product characteristic in the Admin attribute registry.
--
-- The product editor still renders category-specific controls for backwards
-- compatibility, but their definitions now live in catalog.attributes as
-- protected system attributes.  This makes the source of truth visible in
-- Admin > Attributs et filtres and lets the public catalogue consume the same
-- options as the editor.

create temporary table hbs_system_attribute_definitions (
  key text primary key,
  name text not null,
  value_type text not null,
  is_filterable boolean not null default false,
  is_required boolean not null default false,
  is_variant_axis boolean not null default false,
  sort_order integer not null,
  category_slugs text[] not null default '{}',
  options jsonb not null default '[]'::jsonb
) on commit drop;

insert into hbs_system_attribute_definitions (
  key,
  name,
  value_type,
  is_filterable,
  is_required,
  sort_order,
  category_slugs,
  options
)
values
  (
    'material', 'Matière', 'select', true, true, 10,
    array['rideaux', 'voilages', 'stores', 'coussins', 'galettes_de_chaise', 'accessoires'],
    '[
      {"value":"coton","label":"Coton","sort_order":1},
      {"value":"boucle","label":"Bouclette","sort_order":2},
      {"value":"fourrure_synthetique","label":"Fausse fourrure","sort_order":3},
      {"value":"mousse","label":"Mousse","sort_order":4},
      {"value":"metal","label":"Métal","sort_order":5},
      {"value":"acier","label":"Acier","sort_order":6},
      {"value":"acier_inoxydable","label":"Acier inoxydable","sort_order":7},
      {"value":"aluminium","label":"Aluminium","sort_order":8},
      {"value":"bois","label":"Bois","sort_order":9},
      {"value":"textile","label":"Textile","sort_order":10},
      {"value":"corde","label":"Corde","sort_order":11},
      {"value":"magnetique","label":"Aimant","sort_order":12},
      {"value":"velours","label":"Velours","sort_order":13},
      {"value":"satin","label":"Satin","sort_order":14},
      {"value":"lin","label":"Lin","sort_order":15},
      {"value":"jacquard","label":"Jacquard","sort_order":16},
      {"value":"polyester","label":"Polyester","sort_order":17},
      {"value":"voile","label":"Voile","sort_order":18},
      {"value":"melange_lin","label":"Mélange lin","sort_order":19},
      {"value":"jacquard_leger","label":"Jacquard léger","sort_order":20},
      {"value":"toile_technique","label":"Toile technique","sort_order":21},
      {"value":"bambou","label":"Bambou","sort_order":22},
      {"value":"bois_massif","label":"Bois massif","sort_order":23},
      {"value":"rotin","label":"Rotin","sort_order":24},
      {"value":"cannage","label":"Cannage","sort_order":25},
      {"value":"metal_laque","label":"Métal laqué","sort_order":26},
      {"value":"verre","label":"Verre","sort_order":27},
      {"value":"marbre","label":"Marbre","sort_order":28},
      {"value":"ceramique","label":"Céramique","sort_order":29},
      {"value":"terre_cuite","label":"Terre cuite","sort_order":30},
      {"value":"cuir_synthetique","label":"Cuir synthétique","sort_order":31},
      {"value":"fibre_naturelle","label":"Fibre naturelle","sort_order":32},
      {"value":"plante_naturelle","label":"Plante naturelle","sort_order":33},
      {"value":"plante_synthetique","label":"Feuillage artificiel","sort_order":34}
    ]'::jsonb
  ),
  (
    'opacity', 'Niveau de lumière', 'select', true, false, 20,
    array['rideaux', 'voilages', 'stores'],
    '[
      {"value":"tamisant_leger","label":"Tamisant léger","sort_order":1},
      {"value":"tamisant","label":"Tamisant","sort_order":2},
      {"value":"obscurcissant","label":"Obscurcissant","sort_order":3},
      {"value":"occultant","label":"Occultant","sort_order":4}
    ]'::jsonb
  ),
  (
    'rooms', 'Pièces recommandées', 'select', true, false, 30,
    array['rideaux', 'voilages', 'stores', 'coussins', 'galettes_de_chaise', 'mobilier_interieur', 'plantes_decoration'],
    '[
      {"value":"salon","label":"Salon","sort_order":1},
      {"value":"chambre","label":"Chambre","sort_order":2},
      {"value":"cuisine","label":"Cuisine","sort_order":3},
      {"value":"bureau","label":"Bureau","sort_order":4},
      {"value":"entree","label":"Entrée","sort_order":5},
      {"value":"salle_a_manger","label":"Salle à manger","sort_order":6},
      {"value":"terrasse","label":"Terrasse","sort_order":7}
    ]'::jsonb
  ),
  ('large_width', 'Grande largeur', 'boolean', false, false, 40, array['rideaux', 'voilages'], '[]'::jsonb),
  ('care', 'Entretien', 'text', false, false, 50, array['rideaux', 'voilages', 'stores', 'mobilier_interieur', 'plantes_decoration'], '[]'::jsonb),
  ('installation', 'Installation', 'text', false, false, 60, array['rideaux', 'voilages', 'stores', 'accessoires'], '[]'::jsonb),
  (
    'blind_type', 'Type de store', 'select', true, false, 70,
    array['stores'],
    '[
      {"value":"enrouleur","label":"Enrouleur","sort_order":1},
      {"value":"jour_nuit","label":"Jour/Nuit","sort_order":2},
      {"value":"bambou","label":"Bambou","sort_order":3},
      {"value":"occultant","label":"Occultant","sort_order":4},
      {"value":"venitien","label":"Vénitien","sort_order":5}
    ]'::jsonb
  ),
  ('mechanism', 'Mécanisme', 'text', false, false, 80, array['stores'], '[]'::jsonb),
  (
    'shape', 'Forme', 'select', true, false, 90,
    array['coussins', 'galettes_de_chaise'],
    '[
      {"value":"carre","label":"Carrée","sort_order":1},
      {"value":"rectangulaire","label":"Rectangulaire","sort_order":2},
      {"value":"ronde","label":"Ronde","sort_order":3},
      {"value":"cylindrique","label":"Cylindrique","sort_order":4}
    ]'::jsonb
  ),
  ('removable_cover', 'Déhoussable', 'boolean', false, false, 100, array['coussins', 'galettes_de_chaise', 'mobilier_interieur'], '[]'::jsonb),
  ('machine_washable', 'Lavable en machine', 'boolean', true, false, 110, array['coussins', 'galettes_de_chaise'], '[]'::jsonb),
  ('filling', 'Contenu / garnissage', 'text', false, false, 120, array['coussins'], '[]'::jsonb),
  ('closure', 'Fermeture', 'text', false, false, 130, array['coussins'], '[]'::jsonb),
  ('fastening', 'Attache', 'text', false, false, 140, array['galettes_de_chaise'], '[]'::jsonb),
  ('thickness_cm', 'Épaisseur (cm)', 'number', false, false, 150, array['galettes_de_chaise'], '[]'::jsonb),
  (
    'accessory_type', 'Type d''accessoire', 'select', true, false, 160,
    array['accessoires'],
    '[
      {"value":"tringle_extensible","label":"Tringle extensible (1,5–3 m)","sort_order":1},
      {"value":"rail","label":"Rail","sort_order":2},
      {"value":"embrasse","label":"Embrasse","sort_order":3},
      {"value":"support","label":"Support","sort_order":4},
      {"value":"embout","label":"Embout","sort_order":5},
      {"value":"petite_piece","label":"Petite pièce","sort_order":6}
    ]'::jsonb
  ),
  ('compatibilities', 'Compatibilités', 'text', false, false, 170, array['accessoires'], '[]'::jsonb),
  ('finish', 'Finition', 'text', false, false, 180, array['accessoires'], '[]'::jsonb),
  ('min_length_cm', 'Longueur minimale (cm)', 'number', false, false, 190, array['accessoires'], '[]'::jsonb),
  ('max_length_cm', 'Longueur maximale (cm)', 'number', false, false, 200, array['accessoires'], '[]'::jsonb),
  ('diameter_mm', 'Diamètre (mm)', 'number', false, false, 210, array['accessoires'], '[]'::jsonb),
  (
    'furniture_type', 'Type de mobilier', 'select', true, true, 220,
    array['mobilier_interieur'],
    '[
      {"value":"canape","label":"Canapé","sort_order":1},
      {"value":"fauteuil","label":"Fauteuil","sort_order":2},
      {"value":"meridienne","label":"Méridienne","sort_order":3},
      {"value":"chaise","label":"Chaise","sort_order":4},
      {"value":"table","label":"Table","sort_order":5},
      {"value":"pouf","label":"Pouf","sort_order":6},
      {"value":"banc","label":"Banc","sort_order":7},
      {"value":"rangement","label":"Rangement","sort_order":8},
      {"value":"tete_de_lit","label":"Tête de lit","sort_order":9}
    ]'::jsonb
  ),
  ('upholstery', 'Revêtement', 'text', false, false, 230, array['mobilier_interieur'], '[]'::jsonb),
  ('frame_material', 'Matière de structure', 'text', false, false, 240, array['mobilier_interieur'], '[]'::jsonb),
  ('leg_material', 'Matière des pieds', 'text', false, false, 250, array['mobilier_interieur'], '[]'::jsonb),
  ('features', 'Fonctionnalités', 'text', false, false, 260, array['mobilier_interieur'], '[]'::jsonb),
  ('seat_comfort', 'Confort d''assise', 'text', false, false, 270, array['mobilier_interieur'], '[]'::jsonb),
  ('number_of_seats', 'Nombre de places', 'number', false, false, 280, array['mobilier_interieur'], '[]'::jsonb),
  (
    'assembly_level', 'Montage', 'select', false, false, 290,
    array['mobilier_interieur'],
    '[
      {"value":"aucun","label":"Aucun montage","sort_order":1},
      {"value":"simple","label":"Montage simple","sort_order":2},
      {"value":"complet","label":"Montage complet","sort_order":3}
    ]'::jsonb
  ),
  ('assembly_time', 'Temps de montage (min)', 'number', false, false, 300, array['mobilier_interieur'], '[]'::jsonb),
  (
    'shipping_profile', 'Profil de livraison', 'select', true, false, 310,
    array['mobilier_interieur', 'plantes_decoration'],
    '[
      {"value":"standard","label":"Standard","sort_order":1},
      {"value":"volumineux","label":"Volumineux","sort_order":2},
      {"value":"sur_devis","label":"Livraison sur devis","sort_order":3}
    ]'::jsonb
  ),
  ('free_shipping_eligible', 'Éligible livraison offerte', 'boolean', false, false, 320, array['mobilier_interieur'], '[]'::jsonb),
  ('width_cm', 'Largeur (cm)', 'dimension', false, false, 330, array['mobilier_interieur'], '[]'::jsonb),
  ('depth_cm', 'Profondeur (cm)', 'dimension', false, false, 340, array['mobilier_interieur'], '[]'::jsonb),
  ('height_cm', 'Hauteur totale (cm)', 'dimension', false, false, 350, array['mobilier_interieur'], '[]'::jsonb),
  ('seat_width_cm', 'Largeur d''assise (cm)', 'dimension', false, false, 360, array['mobilier_interieur'], '[]'::jsonb),
  ('seat_depth_cm', 'Profondeur d''assise (cm)', 'dimension', false, false, 370, array['mobilier_interieur'], '[]'::jsonb),
  ('seat_height_cm', 'Hauteur d''assise (cm)', 'dimension', false, false, 380, array['mobilier_interieur'], '[]'::jsonb),
  ('back_height_cm', 'Hauteur du dossier (cm)', 'dimension', false, false, 390, array['mobilier_interieur'], '[]'::jsonb),
  ('armrest_height_cm', 'Hauteur des accoudoirs (cm)', 'dimension', false, false, 400, array['mobilier_interieur'], '[]'::jsonb),
  ('weight_kg', 'Poids (kg)', 'number', false, false, 410, array['mobilier_interieur'], '[]'::jsonb),
  ('max_load_kg', 'Charge maximale (kg)', 'number', false, false, 420, array['mobilier_interieur'], '[]'::jsonb),
  ('storage_volume_l', 'Volume de rangement (L)', 'number', false, false, 430, array['mobilier_interieur'], '[]'::jsonb),
  ('package_count', 'Nombre de colis', 'number', false, false, 440, array['mobilier_interieur'], '[]'::jsonb),
  (
    'plant_nature', 'Nature', 'select', true, true, 450,
    array['plantes_decoration'],
    '[
      {"value":"artificielle","label":"Artificielle","sort_order":1},
      {"value":"naturelle","label":"Naturelle","sort_order":2},
      {"value":"stabilisee","label":"Stabilisée","sort_order":3}
    ]'::jsonb
  ),
  ('plant_type', 'Type de plante', 'text', true, false, 460, array['plantes_decoration'], '[]'::jsonb),
  (
    'plant_size', 'Taille', 'select', true, false, 470,
    array['plantes_decoration'],
    '[
      {"value":"petite","label":"Petite","sort_order":1},
      {"value":"moyenne","label":"Moyenne","sort_order":2},
      {"value":"grande","label":"Grande","sort_order":3}
    ]'::jsonb
  ),
  ('common_name', 'Nom commun', 'text', false, false, 480, array['plantes_decoration'], '[]'::jsonb),
  ('botanical_name', 'Nom botanique', 'text', false, false, 490, array['plantes_decoration'], '[]'::jsonb),
  ('plant_family', 'Famille botanique', 'text', false, false, 500, array['plantes_decoration'], '[]'::jsonb),
  ('origin', 'Origine', 'text', false, false, 510, array['plantes_decoration'], '[]'::jsonb),
  ('light_need', 'Exposition', 'text', true, false, 520, array['plantes_decoration'], '[]'::jsonb),
  ('watering', 'Arrosage', 'text', false, false, 530, array['plantes_decoration'], '[]'::jsonb),
  ('pet_safe', 'Sans risque pour les animaux', 'boolean', true, false, 540, array['plantes_decoration'], '[]'::jsonb),
  ('toxicity_note', 'Description de toxicité', 'text', false, false, 550, array['plantes_decoration'], '[]'::jsonb),
  ('flowering', 'Floraison', 'boolean', false, false, 560, array['plantes_decoration'], '[]'::jsonb),
  ('trailing', 'Retombante', 'boolean', false, false, 570, array['plantes_decoration'], '[]'::jsonb),
  ('pot_included', 'Pot inclus', 'boolean', false, false, 580, array['plantes_decoration'], '[]'::jsonb),
  ('indoor_use', 'Usage intérieur', 'boolean', true, false, 590, array['plantes_decoration'], '[]'::jsonb),
  ('preservation', 'Conditions de conservation', 'text', false, false, 600, array['plantes_decoration'], '[]'::jsonb),
  ('fragile', 'Fragile', 'boolean', false, false, 610, array['plantes_decoration'], '[]'::jsonb)
on conflict (key) do update
set name = excluded.name,
    value_type = excluded.value_type,
    is_filterable = excluded.is_filterable,
    is_required = excluded.is_required,
    is_variant_axis = excluded.is_variant_axis,
    sort_order = excluded.sort_order;

-- Mark the definitions as system-owned without changing their existing ids.
update catalog.attributes as attribute
set name = definition.name,
    value_type = definition.value_type,
    is_filterable = definition.is_filterable,
    is_required = definition.is_required,
    is_variant_axis = definition.is_variant_axis,
    sort_order = definition.sort_order,
    is_system = true,
    status = 'active',
    updated_at = now()
from hbs_system_attribute_definitions as definition
where attribute.key = definition.key;

insert into catalog.attributes (
  id,
  key,
  name,
  value_type,
  is_filterable,
  is_required,
  status,
  is_variant_axis,
  sort_order,
  is_system
)
select
  'system-' || definition.key,
  definition.key,
  definition.name,
  definition.value_type,
  definition.is_filterable,
  definition.is_required,
  'active',
  definition.is_variant_axis,
  definition.sort_order,
  true
from hbs_system_attribute_definitions as definition
where not exists (
  select 1
  from catalog.attributes as existing
  where existing.key = definition.key
);

insert into catalog.attribute_options (
  id,
  attribute_id,
  value,
  label,
  sort_order,
  is_active
)
select
  'system-' || definition.key || '-' || option.value,
  attribute.id,
  option.value,
  option.label,
  coalesce(option.sort_order, 0),
  true
from hbs_system_attribute_definitions as definition
join catalog.attributes as attribute on attribute.key = definition.key
cross join lateral jsonb_to_recordset(definition.options)
  as option(value text, label text, sort_order integer)
where jsonb_array_length(definition.options) > 0
on conflict (attribute_id, value) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true;

-- Keep the legacy product material column and the normalized attribute registry
-- in sync before material becomes a required system attribute at publication.
insert into catalog.product_attributes (product_id, attribute_id, value)
select product_row.id,
       material_attribute.id,
       to_jsonb(product_row.material)
from catalog.products as product_row
join catalog.attributes as material_attribute
  on material_attribute.key = 'material'
 and material_attribute.is_system
where nullif(btrim(product_row.material), '') is not null
on conflict (product_id, attribute_id) do update
set value = excluded.value,
    updated_at = now();

insert into catalog.category_attributes (category_id, attribute_id, is_required, sort_order)
select
  category.id,
  attribute.id,
  definition.is_required,
  definition.sort_order
from hbs_system_attribute_definitions as definition
join catalog.attributes as attribute on attribute.key = definition.key
cross join unnest(definition.category_slugs) as category_slug(slug)
join catalog.categories as category on category.slug = category_slug.slug
on conflict (category_id, attribute_id) do update
set is_required = excluded.is_required,
    sort_order = excluded.sort_order;

-- Keep the system boundary intact even if a future code path writes directly
-- through the database role instead of the Admin repository.
create or replace function catalog.prevent_system_attribute_mutation()
returns trigger
language plpgsql
security invoker
set search_path = catalog, pg_catalog
as $$
begin
  if old.is_system and (
    new.key <> old.key
    or new.value_type <> old.value_type
    or not new.is_system
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'System attribute key, type and ownership are immutable.';
  end if;
  if not old.is_system and new.is_system then
    raise exception using
      errcode = 'check_violation',
      message = 'A regular attribute cannot be promoted to a system attribute.';
  end if;
  return new;
end;
$$;

revoke all on function catalog.prevent_system_attribute_mutation() from public;

drop trigger if exists catalog_attributes_system_guard on catalog.attributes;
create trigger catalog_attributes_system_guard
before update on catalog.attributes
for each row execute function catalog.prevent_system_attribute_mutation();
