# HTTPS

HTTPS-specific guidance is currently documented in Chinese-first form and is mirrored here as a shorter operational checklist.

When to read this page: you need TLS for LAN, enterprise, or remote HTTP access.

Related pages:

- [Deployment](./deployment.md)
- [Troubleshooting](./troubleshooting.md)
- [Chinese HTTPS Guide](../../zh/getting-started/https.md)

## Checklist

1. Generate a certificate and key
2. Configure the plugin with certificate and key paths
3. Switch client URLs to `https://...`
4. Trust the certificate on the client machine if self-signed

## Notes

- Self-signed certificates are acceptable for local or LAN use
- Keep bearer token auth enabled even when TLS is enabled
- If a client rejects the certificate, verify trust-store configuration before debugging MCP behavior
