# Cloudflare DNS Setup for OmniNudge

This guide explains how to configure your omninudge.com domain on Cloudflare for deployment.

---

## Step-by-Step DNS Configuration

### 1. Log in to Cloudflare

Visit: https://dash.cloudflare.com/

### 2. Select Your Domain

Click on **"omninudge.com"** from your domains list.

### 3. Navigate to DNS Settings

Click **"DNS"** in the left sidebar.

---

## DNS Records to Add

You need to add **2 DNS records** that point to your VPS server.

### Record 1: Root Domain (@)

Click **"Add record"** and enter:

```
Type: A
Name: @
Content: YOUR_SERVER_IP
Proxy status: DNS only (gray cloud)
TTL: Auto
```

**Example:**
- Type: `A`
- Name: `@`
- Content: `159.89.123.45` (your actual server IP)
- Proxy status: Click the orange cloud to make it **gray**
- TTL: `Auto`

Click **"Save"**

### Record 2: WWW Subdomain

Click **"Add record"** again and enter:

```
Type: A
Name: www
Content: YOUR_SERVER_IP
Proxy status: DNS only (gray cloud)
TTL: Auto
```

**Example:**
- Type: `A`
- Name: `www`
- Content: `159.89.123.45` (same IP as above)
- Proxy status: Click the orange cloud to make it **gray**
- TTL: `Auto`

Click **"Save"**

---

## Important: Gray Cloud vs Orange Cloud

### Initial Setup: Use GRAY Cloud (DNS Only)

**Why gray cloud?**
- ✅ Required for Let's Encrypt SSL certificate setup
- ✅ Simpler initial configuration
- ✅ Direct connection to your server
- ✅ WebSockets work without extra config

**The cloud icon should look like this:**
```
[☁️] <- Gray/transparent cloud = DNS only
```

**NOT like this:**
```
[🟠] <- Orange cloud = Proxied (save this for later)
```

### After SSL Setup: Orange Cloud (Optional)

Once your site is working with HTTPS, you can optionally enable Cloudflare's proxy:

**Benefits:**
- 🛡️ DDoS protection
- 🌍 Global CDN (faster worldwide)
- 🔒 Web Application Firewall
- 👁️ Hides your real server IP

**To enable:**
1. Click each **gray cloud** icon → turns **orange**
2. Go to **SSL/TLS** settings → Set to **"Full (strict)"**
3. Configure WebSockets (see "Advanced Configuration" below)

---

## Verify DNS Configuration

### Check DNS Propagation

Wait **2-10 minutes** after adding records, then test:

**Method 1: Ping**
```bash
# On your Mac:
ping omninudge.com

# Should show your server IP
PING omninudge.com (159.89.123.45): 56 data bytes
```

**Method 2: NSLookup**
```bash
nslookup omninudge.com

# Should show:
Server:   1.1.1.1
Address:  1.1.1.1#53

Non-authoritative answer:
Name: omninudge.com
Address: 159.89.123.45
```

**Method 3: Online Tool**
- Visit: https://dnschecker.org/
- Enter: `omninudge.com`
- Should show your server IP globally

---

## SSL/TLS Settings (Important!)

### For Gray Cloud (DNS Only) - Initial Setup

1. Go to **SSL/TLS** in left sidebar
2. Set encryption mode to: **"Off"** or **"Flexible"** temporarily
3. After running Let's Encrypt on your server, change to: **"Full (strict)"**

### For Orange Cloud (Proxied) - After SSL Working

1. Go to **SSL/TLS** in left sidebar
2. Set encryption mode to: **"Full (strict)"**
3. Go to **SSL/TLS** → **Edge Certificates**
4. Enable:
   - ✅ Always Use HTTPS
   - ✅ Automatic HTTPS Rewrites
   - ✅ Minimum TLS Version: 1.2

---

## Advanced Configuration (Orange Cloud Only)

If you enable Cloudflare proxy (orange cloud), configure these settings:

### 1. Firewall Rules (Optional)

**Recommended rules:**

Create firewall rule to block bots:

1. Go to **Security** → **WAF**
2. Click **"Create rule"**
3. Rule name: `Block Bad Bots`
4. Expression:
   ```
   (cf.bot_management.score lt 30)
   ```
5. Action: **Block**

### 2. Speed Settings

1. Go to **Speed** → **Optimization**
2. Enable:
   - ✅ Auto Minify (JavaScript, CSS, HTML)
   - ✅ Brotli compression
   - ✅ Rocket Loader (test this - may break React)

### 3. Caching Rules

1. Go to **Caching** → **Configuration**
2. Browser Cache TTL: **4 hours**
3. **Create Page Rule:**
   - URL: `omninudge.com/uploads/*`
   - Setting: Cache Level = **Cache Everything**
   - Edge Cache TTL: **1 month**

### 4. WebSocket Support

Cloudflare supports WebSockets automatically, but you need to configure your Nginx to handle Cloudflare IPs:

**On your server:**

```bash
nano /etc/nginx/sites-available/omninudge
```

**Add this at the top of the server block:**

```nginx
# Cloudflare real IP
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2c0f:f248::/32;
set_real_ip_from 2a06:98c0::/29;
real_ip_header CF-Connecting-IP;
```

**Reload Nginx:**
```bash
nginx -t
systemctl reload nginx
```

---

## Troubleshooting

### DNS Not Resolving

**Problem:** `ping omninudge.com` shows wrong IP or doesn't resolve

**Solution:**
1. Check DNS records in Cloudflare dashboard
2. Verify cloud status is **gray** (for initial setup)
3. Wait 10 more minutes (DNS cache)
4. Flush your local DNS: `sudo dscacheutil -flushcache` (Mac)

### SSL Certificate Error

**Problem:** "Certificate not trusted" or "NET::ERR_CERT_AUTHORITY_INVALID"

**Solution:**
1. If using **gray cloud**: Run Let's Encrypt on server first
2. If using **orange cloud**: Set SSL/TLS mode to "Full (strict)"
3. Check certificate: https://www.sslshopper.com/ssl-checker.html

### "Too Many Redirects"

**Problem:** Browser shows "ERR_TOO_MANY_REDIRECTS"

**Solution:**
1. Cloudflare SSL/TLS mode is wrong
2. If using **Let's Encrypt**, set Cloudflare to "Full (strict)"
3. Check Nginx config has HTTPS redirect only once

### WebSocket Connection Failed

**Problem:** Real-time features not working (messages, notifications)

**Solution with gray cloud:**
- Should work automatically

**Solution with orange cloud:**
1. Add Cloudflare IP ranges to Nginx (see above)
2. Ensure WebSocket route `/ws/` is configured in Nginx
3. Check browser console for specific WebSocket errors

---

## Recommended Configuration Timeline

### Day 1: Initial Deploy (Gray Cloud)
- ✅ Add DNS records with **gray cloud**
- ✅ Deploy application
- ✅ Set up Let's Encrypt SSL
- ✅ Test everything works

### Week 1-2: Monitor Performance
- Monitor traffic
- Check for any attacks or issues
- Ensure backups working

### Month 1+: Enable Proxy (Orange Cloud)
- Switch to **orange cloud** when ready
- Configure Cloudflare features
- Test all functionality still works
- Monitor for any issues

---

## Summary Checklist

**Initial Setup (Gray Cloud):**
- [ ] Add A record: `@` → `YOUR_SERVER_IP` (gray cloud)
- [ ] Add A record: `www` → `YOUR_SERVER_IP` (gray cloud)
- [ ] SSL/TLS mode: Off or Flexible (temporarily)
- [ ] Wait 5-10 minutes for DNS propagation
- [ ] Verify: `ping omninudge.com` shows server IP
- [ ] Deploy application
- [ ] Install Let's Encrypt SSL on server
- [ ] Change SSL/TLS mode to "Full (strict)"
- [ ] Test: Visit https://omninudge.com (green padlock)

**Later: Enable Proxy (Orange Cloud):**
- [ ] Switch both A records to orange cloud
- [ ] SSL/TLS mode: Full (strict)
- [ ] Enable Always Use HTTPS
- [ ] Configure Nginx with Cloudflare IPs
- [ ] Test WebSocket connections
- [ ] Configure caching rules
- [ ] Enable security features

---

## Support Resources

- **Cloudflare Docs:** https://developers.cloudflare.com/
- **DNS Propagation Checker:** https://dnschecker.org/
- **SSL Checker:** https://www.sslshopper.com/ssl-checker.html
- **Cloudflare Community:** https://community.cloudflare.com/

---

## Quick Reference

**Your DNS Records:**
```
A     @     YOUR_SERVER_IP    DNS only (gray)
A     www   YOUR_SERVER_IP    DNS only (gray)
```

**SSL/TLS Mode:**
- Initial setup: Off or Flexible
- After Let's Encrypt: Full (strict)

**Recommended Start:** Gray cloud (DNS only) for simplicity and compatibility with Let's Encrypt.

**Enable Orange Cloud:** After everything works perfectly, when you want extra protection and CDN.
