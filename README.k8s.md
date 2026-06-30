# WalletDigital sur Kubernetes — guide d'apprentissage

Ce guide explique comment faire tourner **tout le système WalletDigital** (3 microservices + Postgres + Redpanda) dans un cluster Kubernetes local, et **ce que chaque étape apprend**. Il a été conçu comme un parcours pédagogique : objectif = apprendre Kubernetes sur un projet réaliste, pas préparer une mise en production.

> Aucun code applicatif n'a été modifié pour Kubernetes. Le projet était déjà « cloud-native » dans sa configuration (tout par variables d'environnement, endpoint `/health`, arrêt gracieux SIGTERM). K8s n'a fait qu'orchestrer l'existant.

---

## Prérequis

- **Docker Desktop** (fournit le moteur de conteneurs ET le moteur du cluster kind)
- **kubectl** (livré avec Docker Desktop)
- **kind** — Kubernetes-in-Docker : `winget install Kubernetes.kind`

Vérifier : `docker info`, `kubectl version --client`, `kind version`.

---

## Vue d'ensemble

```
                       ┌─────────────── cluster kind (walletdigital) ───────────────┐
                       │                                                            │
   kubectl port-forward│   merchant-service   wallet-service   transaction-service  │
   (depuis l'hote) ────┼──▶  (Deployment)       (Deployment)      (Deployment)      │
                       │        :3002              :3003              :3004          │
                       │          │                  │                  │           │
                       │          └──────────┬───────┴──────────────────┘           │
                       │                     ▼                                       │
                       │         postgres (StatefulSet, 3 bases)                     │
                       │         redpanda (StatefulSet, Kafka API)                   │
                       └────────────────────────────────────────────────────────────┘
```

Tout est **intra-cluster** : les services se joignent par leurs noms DNS (`postgres:5432`,
`redpanda:9092`, `merchant-service:3002`...). Fini le `localhost:5433` du dev local.

---

## Arborescence des manifests

```
k8s/
├── base/                          # définitions complètes (declaratives)
│   ├── postgres/                  # StatefulSet + Service + PVC + Secret + ConfigMap (init 3 bases)
│   ├── redpanda/                  # StatefulSet + Service (broker Kafka)
│   ├── merchant-service/          # ConfigMap + Secret + migrate-Job + Deployment + Service
│   ├── wallet-service/            # idem
│   ├── transaction-service/       # idem
│   └── kustomization.yaml         # agrège les 5 composants
└── overlays/
    ├── dev/                       # la base + label env=dev (environnement local)
    └── scaled/                    # dev + transaction-service à 3 replicas (démo scaling)
```

Chaque service a aussi un **Dockerfile multi-stage** (`services/*/Dockerfile`) avec 3 cibles :
`build` (compile le monorepo), `runtime` (image finale minimale), `migrate` (image dédiée
aux migrations Prisma).

---

## Parcours pas à pas

### 0. Créer le cluster

```bash
kind create cluster --name walletdigital
kubectl get nodes        # doit afficher 1 nœud Ready
```

> **Astuce** : si après un redémarrage de Docker Desktop `kubectl` répond
> « connection refused », le port de l'API a changé. Corriger le kubeconfig avec :
> `kind export kubeconfig --name walletdigital` (inutile de recréer le cluster).

**Appris** : un cluster kind = un conteneur Docker qui fait tourner un control-plane K8s.

### 1. Construire les images

Les services dépendent de packages partagés (`workspace:*`), donc **le contexte de build
est la racine du monorepo** (le `.` final), pas le dossier du service.

```bash
# Pour chaque service : image runtime + image migrate
docker build -f services/transaction-service/Dockerfile --target runtime -t walletdigital/transaction-service:dev .
docker build -f services/transaction-service/Dockerfile --target migrate -t walletdigital/transaction-service-migrate:dev .
# idem pour merchant-service et wallet-service
```

**Appris** :

- Build multi-stage : un gros stage de compilation, une petite image finale.
- Le client Prisma est généré au build (`prisma generate`) puis recopié à côté du code
  compilé (`dist/generated`) car `tsc` ne copie pas les `.js` générés.
- Une image **migrate** séparée embarque le CLI Prisma + les migrations ; le runtime reste minimal.

### 2. Charger les images dans kind

kind a son propre stockage d'images, distinct du daemon Docker local :

```bash
kind load docker-image walletdigital/transaction-service:dev --name walletdigital
# ... répéter pour chaque image (6 au total)
```

> C'est pour cela que les Deployments utilisent `imagePullPolicy: Never` : on force
> l'usage de l'image locale, sans tenter de la tirer d'un registre distant.

### 3. Tout déployer (un seul apply)

```bash
kubectl apply -k k8s/overlays/dev
```

Kustomize assemble la base + l'overlay et applique les 21 ressources d'un coup.

```bash
kubectl get pods                       # tout doit passer en Running
kubectl get jobs                       # les *-migrate doivent finir en Complete
```

**Appris** :

- **StatefulSet** (Postgres, Redpanda) : état + identité stable + volume persistant (PVC).
- **Deployment** (services) : process stateless, interchangeables, scalables.
- **Job** (migrations) : tâche ponctuelle qui s'exécute jusqu'à réussir, puis s'arrête.
- **ConfigMap / Secret** : config non sensible / sensible, injectées en variables d'env.
- **Service ClusterIP** : adresse interne stable + répartition de charge entre replicas.
- **Probes** `/health` : readiness (reçoit du trafic ?) et liveness (faut-il redémarrer ?).

### 4. Tester de bout en bout

```bash
# Ouvrir 3 tunnels depuis l'hôte (un par terminal, ou en arrière-plan)
kubectl port-forward svc/merchant-service 3002:3002
kubectl port-forward svc/wallet-service 3003:3003
kubectl port-forward svc/transaction-service 3004:3004
```

```bash
# 1. Créer deux merchants
ALICE=$(curl -s -X POST localhost:3002/merchants -H 'Content-Type: application/json' -d '{"name":"Alice","type":"employee"}')
ACME=$(curl -s -X POST localhost:3002/merchants  -H 'Content-Type: application/json' -d '{"name":"Acme","type":"company"}')
# (récupérer les merchantId dans la réponse)

# 2. La cascade Kafka crée automatiquement un wallet par merchant (~1s)
curl -s localhost:3003/wallets/by-merchant/<merchantId_alice>

# 3. Approvisionner le wallet d'Alice (pas d'endpoint de top-up — limitation connue)
kubectl exec postgres-0 -- psql -U walletdigital -d wallet      -c "UPDATE wallets SET balance=1000.00 WHERE id='<aliceWallet>';"
kubectl exec postgres-0 -- psql -U walletdigital -d transaction -c "UPDATE wallets SET balance=1000.00 WHERE id='<aliceWallet>';"

# 4. Charge : Alice -> Acme, 100 USD (10000 cents). Idempotency-Key obligatoire.
curl -s -X POST localhost:3004/charges \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"merchantId":"<acmeId>","fromWalletId":"<aliceWallet>","toWalletId":"<acmeWallet>","amount":"10000","currency":"USD"}'
```

Vérifier le résultat (grand livre en partie double, 2 écritures) :

```bash
kubectl exec postgres-0 -- psql -U walletdigital -d transaction \
  -c "SELECT type, debit, credit, balance_after FROM ledger_entries WHERE transaction_id='<tx>';"
```

**Appris** : les 3 services communiquent **uniquement** via Kafka (Redpanda) à l'intérieur
du cluster ; aucune modification du code n'a été nécessaire.

### 5. (Bonus) Scaling horizontal

```bash
kubectl apply -k k8s/overlays/scaled
kubectl get pods -l app=transaction-service     # -> 3 pods
```

Le `transaction-service` passe à 3 replicas. Le code le supporte (verrous pessimistes
`SELECT FOR UPDATE` ordonnés, idempotence à double vérification, outbox
`FOR UPDATE SKIP LOCKED`), donc plusieurs replicas traitent des charges en parallèle sans
corrompre le grand livre. Le Service ClusterIP répartit les requêtes entre eux.

Revenir à 1 replica : `kubectl apply -k k8s/overlays/dev`.

---

## Commandes d'observation utiles

```bash
kubectl get all                              # tout le cluster d'un coup
kubectl get pods -l app=transaction-service  # filtrer par étiquette
kubectl logs -l app=transaction-service -f   # logs en direct
kubectl describe pod <nom>                    # détail + events (debug)
kubectl exec -it postgres-0 -- psql -U walletdigital -d transaction   # SQL dans la base
```

---

## Pièges rencontrés (et ce qu'ils enseignent)

| Symptôme                                                | Cause                                                           | Leçon                                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `kubectl` : connection refused                          | Port de l'API kind changé après reboot                          | `kind export kubeconfig`                                                                          |
| Pod `CrashLoopBackOff` (Redpanda)                       | Mauvais entrypoint (`redpanda` au lieu de `rpk redpanda start`) | `kubectl logs --previous` pour voir la vraie erreur ; `command:` remplace l'entrypoint de l'image |
| `ERR_MODULE_NOT_FOUND .../generated/prisma`             | Client Prisma absent de `dist/`                                 | `tsc` ne copie pas les `.js` générés — les recopier                                               |
| `relation "outbox_events" does not exist` (transitoire) | Service démarré avant la fin du Job de migration                | Une amélioration serait un `initContainer` qui attend la migration                                |

---

## Nettoyage

```bash
kubectl delete -k k8s/overlays/dev      # supprime les ressources, garde le cluster
kind delete cluster --name walletdigital # supprime tout le cluster
```

---

## Hors périmètre (volontairement)

Ingress / TLS, déploiement cloud (EKS/GKE/AKS), Helm, autoscaling (HPA), gestion avancée
des secrets (Sealed/External Secrets), CI/CD. Mongo / Redis / Mailhog ne sont pas inclus
(inutilisés dans le code applicatif). Ce guide reste focalisé sur les objets Kubernetes
fondamentaux.
