# provisioning/ — reusable verification-box machinery

Generic, parameterized Terraform + cloud-init for standing up a disposable VM to
**reproduce a dependency/install issue in a controlled environment** (e.g. a clean
amd64 Linux box when the dev's machine is arm64). This is the provisioning capability
tesser's run/sandbox tier will use; it is **not** tied to any one issue.

## How it's used

This directory is a **template**. A verification does **not** run Terraform here —
it **vendors a copy** of `terraform/` into its own cache bundle and runs it there, so
each verification's environment is **deterministically recreatable** and frozen against
changes to this template:

```
~/.gstack/projects/verocorp-tesser/verifications/<id>/
  terraform/        # a copied (vendored) snapshot of this module + pinned terraform.tfvars
  repro.sh          # how the issue was reproduced (the config/repro layer)
  result.md         # the finding
```

## Provision-only boundary (honored — do not cross)

Following the `restate-test` convention ("What Terraform Does NOT Manage"):

- **Terraform provisions infrastructure only** — the instance, disk, network, firewall,
  SSH-key wiring, and a *base* cloud-init (docker + git).
- **It does NOT do app config or the repro.** No `remote-exec`/`local-exec` build steps.
  The actual clone/build/run of the issue lives in the bundle's `repro.sh`, run over SSH —
  the equivalent of restate-test's `deploy-*.sh` layer.

## State

**Local state, by design.** These are disposable boxes; no remote GCS backend. The
`terraform.tfstate` in a bundle's `terraform/` dir is the load-bearing teardown record —
don't lose it before `terraform destroy`, or the box is orphaned (and billing continues).
State + tfvars are `.gitignore`d; the provider lock is committed in a bundle for determinism.

## Auth & teardown

- Auth: Application Default Credentials (`gcloud auth application-default login`). The
  provider block carries only `project`/`region` — no key in the repo.
- Teardown: `terraform destroy` in the bundle's `terraform/`. No auto-stop; destroy when done.

## amd64 guarantee

`machine_type` defaults to `n2-standard-4` (Intel/x86_64) and `image` to
`ubuntu-os-cloud/ubuntu-2204-lts` (amd64). To guarantee x86_64, avoid any `t2a-*`
machine type or `-arm64` image family.
