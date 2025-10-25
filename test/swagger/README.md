# Swagger Specifications

This directory contains downloaded Swagger/OpenAPI specifications used for contract testing.

## Files

- `swagger.json` - Downloaded from `/docs-json` endpoint

## Usage

Download the latest Swagger specification:

```bash
npm run test:swagger
```

The specification is automatically loaded by e2e tests for schema validation.
