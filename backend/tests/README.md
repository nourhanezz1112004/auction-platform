# Integration Test Notes

Integration tests require `docker compose up postgres redis` running on the host before running `pnpm test`.

We use a separate `.env.test` file to ensure the tests connect to the services exposed to the host machine (e.g. `localhost:5432`) rather than attempting to resolve Docker-internal hostnames.
