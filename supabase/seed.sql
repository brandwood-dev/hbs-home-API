-- Deterministic synthetic staging data for local/CI only.
-- Production deployments must never use `supabase db push --include-seed`.

insert into catalog.products (
  id,
  slug,
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
    product = excluded.product,
    updated_at = now();
