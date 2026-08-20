-- Deterministic synthetic staging data for local/CI only.
-- Production deployments must never use `supabase db push --include-seed`.

insert into catalog.categories (id, slug, name, status)
values
  ('rideaux', 'rideaux', 'Rideaux', 'active'),
  ('coussins', 'coussins', 'Coussins', 'active')
on conflict (id) do update
set slug = excluded.slug,
    name = excluded.name,
    status = excluded.status,
    updated_at = now();

insert into catalog.products (
  id,
  slug,
  name,
  reference,
  short_description,
  long_description,
  image_alt,
  status,
  category_id,
  is_published,
  is_demo,
  category,
  material,
  opacity_level,
  selling_mode,
  pattern,
  is_large_width,
  is_new,
  is_best_seller,
  is_featured,
  is_thermal,
  recommendation_score,
  product
)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'rideau-lin-naturel',
    'Rideau lin naturel',
    'HBS-RID-LIN-001',
    'Rideau en lin naturel pour une lumière douce.',
    'Une finition intemporelle et une texture naturelle pour les intérieurs HBS HOME.',
    'Rideau en lin naturel HBS HOME',
    'active',
    'rideaux',
    true,
    true,
    'rideaux',
    'lin',
    'semi_occulant',
    'ready_made',
    'uni',
    false,
    true,
    true,
    true,
    true,
    100,
    jsonb_build_object(
      'name', 'Rideau lin naturel',
      'reference', 'HBS-RID-LIN-001',
      'slug', 'rideau-lin-naturel',
      'category', 'rideaux',
      'material', 'lin',
      'opacityLevel', 'semi_occulant',
      'sellingMode', 'ready_made',
      'pattern', 'uni',
      'shortDescription', 'Rideau en lin naturel pour une lumière douce.',
      'longDescription', 'Une finition intemporelle et une texture naturelle pour les intérieurs HBS HOME.',
      'imageAlt', 'Rideau en lin naturel HBS HOME',
      'images', jsonb_build_array(
        jsonb_build_object(
          'id', 'rideau-lin-naturel-front',
          'url', 'https://preview.hbs-home.com/catalog/rideau-lin-naturel.jpg',
          'alt', 'Rideau en lin naturel installé',
          'type', 'front'
        )
      ),
      'colors', jsonb_build_array(
        jsonb_build_object(
          'id', 'naturel',
          'name', 'Naturel',
          'slug', 'naturel',
          'family', 'beige',
          'hex', '#D8C8B4'
        )
      ),
      'variants', jsonb_build_array(
        jsonb_build_object(
          'id', 'rideau-lin-naturel-140x250',
          'sku', 'HBS-RID-LIN-001-140-250',
          'colorId', 'naturel',
          'widthCm', 140,
          'heightCm', 250,
          'curtainHeader', 'pattes_cachees',
          'price', jsonb_build_object('amountMinor', 18900, 'currency', 'TND'),
          'availability', 'in_stock',
          'availableQuantity', 12,
          'imageUrl', 'https://preview.hbs-home.com/catalog/rideau-lin-naturel.jpg',
          'imageIds', jsonb_build_array('rideau-lin-naturel-front'),
          'packQuantity', 1
        )
      ),
      'details', jsonb_build_object(
        'composition', '100% lin',
        'care', jsonb_build_array('Lavage délicat à 30°C'),
        'features', jsonb_build_array('Tissu naturel', 'Confection HBS HOME')
      ),
      'seo', jsonb_build_object(
        'title', 'Rideau lin naturel | HBS HOME',
        'description', 'Rideau en lin naturel HBS HOME, disponible en plusieurs dimensions.'
      ),
      'isThermal', true,
      'isNew', true,
      'isBestSeller', true,
      'isFeatured', true,
      'isDemo', true
    )
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'coussin-boucle-ecru',
    'Coussin bouclé écru',
    'HBS-COU-BOU-002',
    'Coussin texturé écru pour une ambiance chaleureuse.',
    'Un coussin bouclé facile à associer aux collections HBS HOME.',
    'Coussin bouclé écru HBS HOME',
    'active',
    'coussins',
    true,
    true,
    'coussins',
    'boucle',
    null,
    'ready_made',
    'uni',
    false,
    false,
    true,
    false,
    false,
    80,
    jsonb_build_object(
      'name', 'Coussin bouclé écru',
      'reference', 'HBS-COU-BOU-002',
      'slug', 'coussin-boucle-ecru',
      'category', 'coussins',
      'material', 'boucle',
      'sellingMode', 'ready_made',
      'pattern', 'uni',
      'cushionShape', 'carre',
      'removableCover', true,
      'machineWashable', true,
      'shortDescription', 'Coussin texturé écru pour une ambiance chaleureuse.',
      'longDescription', 'Un coussin bouclé facile à associer aux collections HBS HOME.',
      'imageAlt', 'Coussin bouclé écru HBS HOME',
      'images', jsonb_build_array(
        jsonb_build_object(
          'id', 'coussin-boucle-ecru-front',
          'url', 'https://preview.hbs-home.com/catalog/coussin-boucle-ecru.jpg',
          'alt', 'Coussin bouclé écru',
          'type', 'front'
        )
      ),
      'colors', jsonb_build_array(
        jsonb_build_object(
          'id', 'ecru',
          'name', 'Écru',
          'slug', 'ecru',
          'family', 'beige',
          'hex', '#EFE5D6'
        )
      ),
      'variants', jsonb_build_array(
        jsonb_build_object(
          'id', 'coussin-boucle-ecru-45',
          'sku', 'HBS-COU-BOU-002-45',
          'colorId', 'ecru',
          'widthCm', 45,
          'heightCm', 45,
          'sizeLabel', '45 x 45 cm',
          'cushionContent', 'fibres_recyclees',
          'price', jsonb_build_object('amountMinor', 4900, 'currency', 'TND'),
          'compareAtPrice', jsonb_build_object('amountMinor', 5900, 'currency', 'TND'),
          'availability', 'in_stock',
          'availableQuantity', 24,
          'imageUrl', 'https://preview.hbs-home.com/catalog/coussin-boucle-ecru.jpg',
          'imageIds', jsonb_build_array('coussin-boucle-ecru-front'),
          'packQuantity', 1
        )
      ),
      'details', jsonb_build_object(
        'composition', 'Housse 100% polyester bouclé',
        'care', jsonb_build_array('Lavage machine à 30°C'),
        'features', jsonb_build_array('Housse amovible', 'Garnissage recyclé')
      ),
      'seo', jsonb_build_object(
        'title', 'Coussin bouclé écru | HBS HOME',
        'description', 'Coussin bouclé écru texturé pour le salon et la chambre.'
      ),
      'isBestSeller', true,
      'isDemo', true
    )
  )
on conflict (id) do update
set slug = excluded.slug,
    is_published = excluded.is_published,
    name = excluded.name,
    reference = excluded.reference,
    short_description = excluded.short_description,
    long_description = excluded.long_description,
    image_alt = excluded.image_alt,
    status = excluded.status,
    category_id = excluded.category_id,
    product = excluded.product,
    updated_at = now();

insert into catalog.product_categories (product_id, category_id, is_primary)
values
  ('00000000-0000-4000-8000-000000000001', 'rideaux', true),
  ('00000000-0000-4000-8000-000000000002', 'coussins', true)
on conflict (product_id, category_id) do update
set is_primary = excluded.is_primary;

insert into catalog.product_variants (
  id,
  product_id,
  sku,
  price_amount_minor,
  compare_at_price_amount_minor,
  status,
  options,
  payload,
  is_default,
  sort_order
)
values
  (
    'rideau-lin-naturel-140x250',
    '00000000-0000-4000-8000-000000000001',
    'HBS-RID-LIN-001-140-250',
    18900,
    null,
    'active',
    jsonb_build_object('colorId', 'naturel', 'widthCm', 140, 'heightCm', 250),
    (select variants.variant
     from catalog.products product_row
     cross join lateral jsonb_array_elements(product_row.product -> 'variants') as variants(variant)
     where product_row.id = '00000000-0000-4000-8000-000000000001'
     limit 1),
    true,
    0
  ),
  (
    'coussin-boucle-ecru-45',
    '00000000-0000-4000-8000-000000000002',
    'HBS-COU-BOU-002-45',
    4900,
    5900,
    'active',
    jsonb_build_object('colorId', 'ecru', 'widthCm', 45, 'heightCm', 45),
    (select variants.variant
     from catalog.products product_row
     cross join lateral jsonb_array_elements(product_row.product -> 'variants') as variants(variant)
     where product_row.id = '00000000-0000-4000-8000-000000000002'
     limit 1),
    true,
    0
  )
on conflict (id) do update
set product_id = excluded.product_id,
    sku = excluded.sku,
    price_amount_minor = excluded.price_amount_minor,
    compare_at_price_amount_minor = excluded.compare_at_price_amount_minor,
    status = excluded.status,
    options = excluded.options,
    payload = excluded.payload,
    is_default = excluded.is_default,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into catalog.product_media (
  id,
  product_id,
  storage_path,
  public_url,
  alt,
  media_type,
  status,
  is_primary,
  sort_order
)
values
  (
    'rideau-lin-naturel-front',
    '00000000-0000-4000-8000-000000000001',
    'https://preview.hbs-home.com/catalog/rideau-lin-naturel.jpg',
    'https://preview.hbs-home.com/catalog/rideau-lin-naturel.jpg',
    'Rideau en lin naturel installé',
    'front',
    'active',
    true,
    0
  ),
  (
    'coussin-boucle-ecru-front',
    '00000000-0000-4000-8000-000000000002',
    'https://preview.hbs-home.com/catalog/coussin-boucle-ecru.jpg',
    'https://preview.hbs-home.com/catalog/coussin-boucle-ecru.jpg',
    'Coussin bouclé écru',
    'front',
    'active',
    true,
    0
  )
on conflict (id) do update
set product_id = excluded.product_id,
    storage_path = excluded.storage_path,
    public_url = excluded.public_url,
    alt = excluded.alt,
    media_type = excluded.media_type,
    status = excluded.status,
    is_primary = excluded.is_primary,
    sort_order = excluded.sort_order,
    updated_at = now();
