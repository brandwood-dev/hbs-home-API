# Livraison de l'API HBS HOME

## Environnements

| Environnement | URL                                | Hébergement      | Déclenchement                              |
| ------------- | ---------------------------------- | ---------------- | ------------------------------------------ |
| Local         | `http://localhost:3000`            | Bun              | manuel                                     |
| Staging       | `https://api-preview.hbs-home.com` | Render Frankfurt | CI verte sur `main`                        |
| Production    | `https://api.hbs-home.com`         | Render           | approbation manuelle, non créée en phase 0 |

La phase 0 ne crée aucune donnée métier distante. Le projet Supabase HBS HOME sera provisionné après
validation de son coût et avant la phase de schéma métier.

## Flux de livraison

1. La CI contrôle formatage, lint, typage, tests, contrat OpenAPI et build.
2. Une base Supabase locale neuve est démarrée dans GitHub Actions et toutes les migrations sont
   rejouées depuis zéro.
3. L'image Docker est construite, lancée sans privilèges et testée via `/health/ready`.
4. Render déploie seulement une révision dont les checks GitHub sont verts.
5. Le workflow de staging attend que `/api/v1/version` expose exactement le SHA Git validé.

## Configuration et secrets

La configuration non sensible de staging est décrite dans `render.yaml`. Les futurs secrets
(`DATABASE_URL`, clés Supabase serveur, Brevo et observabilité) seront saisis dans Render et jamais
commités. Les clés `service_role` Supabase ne doivent jamais atteindre le navigateur.

L'environnement GitHub `staging` sert de journal d'exécution et d'URL de recette. L'environnement
`production` devra exiger une approbation manuelle avant tout déploiement futur.

## Retour arrière

Render conserve les déploiements : sélectionner la dernière révision verte, la redéployer, puis
exécuter le smoke test avec son SHA. Les migrations destructives sont interdites dans une livraison
applicative ordinaire ; toute évolution incompatible devra suivre une séquence expand/migrate/
contract et un runbook de restauration testé.

Le sous-domaine API est isolé de `hbs-home.com` et de `www`. Aucun rollback API staging ne modifie
l'ancien site public.
