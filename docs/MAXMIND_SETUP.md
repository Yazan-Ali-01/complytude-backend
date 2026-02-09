# MaxMind GeoIP Setup Guide

This guide explains how to set up MaxMind GeoLite2 for IP geolocation in session management.

## Overview

The session management system uses MaxMind GeoLite2 to capture geographic location (city, country) for each user session. This is **optional** - if not configured, sessions will be created with `geoLocation: null`.

## Why MaxMind GeoLite2?

- **Free tier available:** GeoLite2-City database is free with a MaxMind account
- **Local lookups:** Database is stored locally (~70MB), lookups are extremely fast (~1μs)
- **No API calls:** No network latency, no rate limits, works offline
- **High accuracy:** City-level geolocation for most IP addresses
- **Weekly updates:** MaxMind updates the database weekly

## Setup Steps

### 1. Create MaxMind Account

1. Go to https://www.maxmind.com/en/geolite2/signup
2. Fill in the signup form (name, email, etc.)
3. Verify your email address
4. Log in to your MaxMind account

### 2. Generate License Key

1. Navigate to **Account** → **Manage License Keys**
2. Click **Generate New License Key**
3. Enter a description (e.g., "Complytude API - Development")
4. Select **No** for "Will this key be used for GeoIP Update?"
5. Click **Confirm**
6. **Important:** Copy the license key immediately - it won't be shown again!
7. Save the license key in your password manager or secure note

### 3. Download GeoLite2-City Database

#### Option A: Manual Download (Recommended for Development)

1. Go to https://www.maxmind.com/en/accounts/current/geoip/downloads
2. Find **GeoLite2 City** in the list
3. Click **Download GZIP** (GeoLite2-City.mmdb.gz)
4. Extract the `.gz` file to get `GeoLite2-City.mmdb`
5. Create a `data/` directory in the project root:
   ```bash
   mkdir -p data
   ```
6. Move the database file:
   ```bash
   mv ~/Downloads/GeoLite2-City.mmdb ./data/
   ```

#### Option B: Automatic Updates with `geoipupdate` (Recommended for Production)

**Install geoipupdate:**

**macOS:**
```bash
brew install geoipupdate
```

**Ubuntu/Debian:**
```bash
sudo add-apt-repository ppa:maxmind/ppa
sudo apt update
sudo apt install geoipupdate
```

**Windows:**
Download from https://github.com/maxmind/geoipupdate/releases

**Configure geoipupdate:**

Create `/usr/local/etc/GeoIP.conf` (or `C:\ProgramData\MaxMind\GeoIPUpdate\GeoIP.conf` on Windows):

```conf
AccountID YOUR_ACCOUNT_ID
LicenseKey YOUR_LICENSE_KEY
EditionIDs GeoLite2-City
DatabaseDirectory /path/to/complytude/data
```

Replace:
- `YOUR_ACCOUNT_ID`: Your MaxMind account ID (find in Account Settings)
- `YOUR_LICENSE_KEY`: The license key you generated
- `/path/to/complytude/data`: Absolute path to your project's data directory

**Run initial download:**
```bash
geoipupdate
```

**Set up automatic weekly updates (Linux/macOS):**

Add to crontab:
```bash
crontab -e
```

Add this line (runs every Wednesday at 3 AM):
```cron
0 3 * * 3 /usr/local/bin/geoipupdate
```

### 4. Configure Environment Variables

Update your `.env` file:

```env
# MaxMind GeoIP
MAXMIND_LICENSE_KEY=your_license_key_here
MAXMIND_DB_PATH=./data/GeoLite2-City.mmdb
```

**Important:**
- Use **relative path** (`./data/GeoLite2-City.mmdb`) for the database path
- Never commit your license key to version control
- The `.gitignore` already excludes `data/*.mmdb` files

### 5. Verify Setup

Start the API server:
```bash
pnpm dev
```

Check logs for:
```
[GeoLocationService] MaxMind GeoIP initialized successfully. Database path: ./data/GeoLite2-City.mmdb
```

If you see this error:
```
[GeoLocationService] MaxMind GeoIP database not found at ./data/GeoLite2-City.mmdb
```

Double-check:
1. The database file exists: `ls -lh ./data/GeoLite2-City.mmdb`
2. The path in `.env` matches the actual file location
3. The file has read permissions

## Testing Geolocation

### Test Login with Geo Lookup

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Check server logs for:
```
[AuthService] User test@example.com logged in successfully (session: abc-123, device: desktop, Chrome, location: New York, United States)
```

### Test with Public IP (not localhost)

Localhost IPs (127.0.0.1, ::1) are skipped for geo lookup. To test with a real IP:

1. Deploy to a staging server with a public IP
2. OR use a proxy that forwards the real IP in `X-Forwarded-For` header

## Graceful Failure Handling

If MaxMind is not configured or fails to initialize:

- **Sessions still work** - created with `geoLocation: null`
- **Warning logged** on startup (not an error)
- **No impact** on authentication flow

This is intentional - geolocation is a nice-to-have feature, not critical for security.

## File Structure

```
complytude/
├── data/
│   └── GeoLite2-City.mmdb       # MaxMind database (git-ignored)
├── apps/api/
│   ├── .env                     # Contains MAXMIND_LICENSE_KEY
│   └── .env.example             # Template with setup instructions
└── docs/
    └── MAXMIND_SETUP.md         # This file
```

## Troubleshooting

### Error: "MaxMind GeoIP database not found"

**Solution:**
1. Verify the database file exists:
   ```bash
   ls -lh ./data/GeoLite2-City.mmdb
   ```
2. Check the path in `.env` matches the actual location
3. Ensure the file is readable:
   ```bash
   chmod 644 ./data/GeoLite2-City.mmdb
   ```

### Error: "Failed to initialize MaxMind GeoIP"

**Possible causes:**
- Corrupted database file → Re-download from MaxMind
- Wrong file format → Ensure you downloaded `.mmdb` not `.csv`
- Insufficient permissions → Check file and directory permissions

**Solution:**
```bash
# Re-download the database
rm ./data/GeoLite2-City.mmdb
# Download again from MaxMind portal
```

### Geo lookup always returns null

**Possible causes:**
1. **Localhost IP:** Geo lookup is skipped for 127.0.0.1, ::1, and private IPs
2. **IP not in database:** Some IPs don't have geolocation data
3. **Database outdated:** Update to the latest GeoLite2-City.mmdb

**Check logs:**
```
[GeoLocationService] Geolocation lookup failed for IP 127.0.0.1: ...
```

This is expected for localhost. Test with a public IP to see real geo data.

## Database Updates

MaxMind updates GeoLite2 **weekly** (every Tuesday).

### Update Schedule

- **Development:** Manual updates every 1-3 months is usually sufficient
- **Production:** Automated weekly updates using `geoipupdate` cron job

### Manual Update

1. Download latest database from MaxMind portal
2. Replace `./data/GeoLite2-City.mmdb` with the new file
3. Restart the API server (or wait for next deploy)

No database migration needed - the service reads the file on startup.

## Privacy & GDPR Compliance

**What data is stored:**
- IP address (in Redis session)
- Country and city name (in Redis session)
- Stored for maximum 14 days (session TTL)

**GDPR notes:**
- IP geolocation is considered legitimate interest for security & fraud prevention
- Ensure your privacy policy mentions:
  - "We collect IP address and approximate location for security purposes"
  - "Session data is retained for 14 days"
- Users can request deletion of their session data (via force-logout endpoints)

**Recommendation:**
- Document this in your privacy policy
- No additional consent required for security logging (GDPR Article 6(1)(f))

## Cost

**GeoLite2 (Free tier):**
- Database downloads: **Free**
- Lookups: **Free** (unlimited, local)
- Updates: **Free** (weekly)

**GeoIP2 Precision (Paid tier):**
- If you need higher accuracy, consider upgrading to GeoIP2 Precision
- Pricing: https://www.maxmind.com/en/geoip2-precision-services

For most applications, GeoLite2 is sufficient.

## References

- [MaxMind GeoLite2 Free Geolocation Data](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data)
- [GeoIP Update Documentation](https://github.com/maxmind/geoipupdate)
- [@maxmind/geoip2-node Documentation](https://www.npmjs.com/package/@maxmind/geoip2-node)
- [MaxMind Account Dashboard](https://www.maxmind.com/en/account)

## Support

If you encounter issues not covered in this guide:

1. Check MaxMind's [support forum](https://support.maxmind.com/)
2. Review the [@maxmind/geoip2-node GitHub issues](https://github.com/maxmind/GeoIP2-node/issues)
3. Contact the development team

---

**Last Updated:** 2026-02-09  
**Author:** Complytude Development Team
