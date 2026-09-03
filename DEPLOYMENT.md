# Livraison de l'API HBS HOME

## Environnements

| Environnement | URL                                | Hébergement      | Déclenchement                              |
| ------------- | ---------------------------------- | ---------------- | ------------------------------------------ |
| Local         | `http://localhost:3000`            | Bun              | manuel                                     |
| Staging       | `https://api-preview.hbs-home.com` | Render Frankfurt | CI verte sur `main`                        |
| Production    | `https://api.hbs-home.com`         | Render           | approbation manuelle, non créée en phase 0 |

La phase 2 ajoute la fondation Auth/RBAC/Storage/audit, sans créer de donnée métier. Le projet
Supabase HBS HOME staging doit être provisionné seulement après validation explicite de son coût.

## Flux de livraison

1. La CI contrôle formatage, lint, typage, tests, contrat OpenAPI et build.
2. Une base Supabase locale neuve est démarrée dans GitHub Actions et toutes les migrations sont
   rejouées depuis zéro.
3. L'image Docker est construite, lancée sans privilèges et testée via `/health/live`. La readiness
   avec base réelle est contrôlée séparément sur le staging.
4. Render déploie seulement une révision dont les checks GitHub sont verts.
5. Le workflow de staging attend que `/api/v1/version` expose exactement le SHA Git validé.

## Configuration et secrets

La configuration non sensible de staging est décrite dans `render.yaml`. Render doit recevoir :

- `DATABASE_URL` : connexion PostgreSQL Supabase du login restreint `hbs_api` ;
- `SUPABASE_URL` : URL publique du projet staging ;
- `SUPABASE_SECRET_KEY` : clé secrète serveur pour les invitations Admin (jamais exposée au navigateur) ;
- `SUPABASE_STORAGE_SECRET_KEY` : clé secrète Supabase serveur (jamais la publishable key), utilisée
  uniquement par l'API pour écrire dans Storage ;
- `SUPABASE_STORAGE_BUCKET` : `catalog-media`.

La migration `20260826181903_phase_10d_category_media_upload.sql` crée le bucket public
`catalog-media`, limite les uploads à 8 MiB et ajoute le lien `image_media_asset_id` aux catégories.
Le décodeur rejette également les images dépassant 25 mégapixels afin de limiter les risques de
décompression excessive.
Elle doit être appliquée avant de démarrer une version de l'API qui utilise cette route.

La clé secrète Supabase utilisée pour inviter un Admin est un secret opérateur ponctuel : elle ne
doit pas être placée dans le frontend et n'est pas nécessaire au processus API courant. Les futures
clés Brevo et d'observabilité suivront la même règle.

Après les migrations, activer le login restreint avec une URL `postgres` opérateur conservée
uniquement le temps de l'opération :

```bash
OPERATOR_DATABASE_URL=... \
HBS_API_DATABASE_PASSWORD=... \
bun run db:provision-api-role
```

Le mot de passe doit être aléatoire et contenir au moins 32 caractères. Construire ensuite
`DATABASE_URL` avec l'utilisateur `hbs_api`. La readiness staging refuse volontairement une
connexion dont le login de session est `postgres`, même si le rôle courant a été abaissé.

Supabase Auth staging doit conserver les inscriptions publiques désactivées, autoriser exactement
`https://preview.hbs-home.com/admin/auth/callback`, imposer des mots de passe forts et activer le MFA
TOTP. Le premier compte est invité après migration avec :

```bash
ADMIN_EMAIL=hhometn@gmail.com \
ADMIN_ROLE=super_admin \
ADMIN_DISPLAY_NAME="HBS HOME Admin" \
ADMIN_REDIRECT_URL=https://preview.hbs-home.com/admin/auth/callback \
SUPABASE_URL=https://PROJECT_REF.supabase.co \
SUPABASE_SECRET_KEY=... \
OPERATOR_DATABASE_URL=... \
bun run admin:invite
```

Ne jamais saisir les valeurs réelles dans un fichier suivi par Git ni dans les logs.

L'environnement GitHub `staging` sert de journal d'exécution et d'URL de recette. L'environnement
`production` devra exiger une approbation manuelle avant tout déploiement futur.

## Retour arrière

Render conserve les déploiements : sélectionner la dernière révision verte, la redéployer, puis
exécuter le smoke test avec son SHA. Les migrations destructives sont interdites dans une livraison
applicative ordinaire ; toute évolution incompatible devra suivre une séquence expand/migrate/
contract et un runbook de restauration testé.

Le sous-domaine API est isolé de `hbs-home.com` et de `www`. Aucun rollback API staging ne modifie
l'ancien site public.
