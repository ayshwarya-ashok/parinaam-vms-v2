# Runbook — Adding an administrator

There is deliberately no self-service admin signup. An existing operator runs:

```sh
docker compose exec -T db psql -U parinaam -d parinaam_vms -c "
INSERT INTO users (email, password_hash, role, email_verified_at)
VALUES ('new.admin@parinaam.org',
        crypt('CHANGE_ME_NOW', gen_salt('bf', 12)),
        'admin', now());"
```

Then the new admin logs in and their bcrypt hash is upgraded to argon2id
automatically on that first successful login. Have them change the password
immediately. Verify with `GET /auth/me` and an entry check in `/audit-logs`.

To revoke: `UPDATE users SET is_active = false WHERE email = '...'` — their
refresh tokens die on next rotation and the access token within 15 minutes.
