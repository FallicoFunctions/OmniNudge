# SMTP Quick Start - 5 Minute Setup

**Goal:** Get email sending working in 5 minutes

**Choose Your Provider:** Pick based on your needs

---

## Provider Comparison

| Provider | Best For | Free Tier | Setup Time | Complexity |
|----------|----------|-----------|------------|------------|
| **Gmail** | Development, Testing | 500/day | 2 min | Easy |
| **SendGrid** | Production, Scale | 100/day | 3 min | Easy |
| **Mailgun** | Production, Reliability | 5k/month (3mo) | 5 min | Medium |
| **AWS SES** | Production, High Volume | 62k/month | 10 min | Hard |

---

## Option 1: Gmail (Fastest - Development)

**When to use:** Local development, testing, prototyping

**Pros:**
- Instant setup (2 minutes)
- No signup required (use your existing Gmail)
- Free 500 emails/day

**Cons:**
- Daily send limits
- Not recommended for production
- Requires 2FA and app password

### Setup Steps

1. **Enable 2-Factor Authentication**
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate App Password**
   - Visit https://myaccount.google.com/apppasswords
   - App: "OmniNudge"
   - Device: "Server"
   - Copy the 16-character password (remove spaces)

3. **Configure backend/.env**
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your_16_char_app_password  # No spaces
   SMTP_FROM_ADDRESS=your-email@gmail.com
   SMTP_FROM_NAME=OmniNudge
   ```

4. **Test**
   ```bash
   ./scripts/verify_smtp.sh your-email@gmail.com
   ```

**Done!** ✅ Emails will send through your Gmail account.

---

## Option 2: SendGrid (Recommended - Production)

**When to use:** Production applications, need reliability

**Pros:**
- 100 emails/day free forever
- Scalable (paid plans up to millions/day)
- Excellent deliverability
- Email analytics dashboard

**Cons:**
- Requires account signup
- Free tier has SendGrid branding

### Setup Steps

1. **Create Account**
   - Go to https://sendgrid.com/pricing/
   - Click "Free" plan
   - Sign up (email + password)

2. **Create API Key**
   - Dashboard → Settings → API Keys
   - Click "Create API Key"
   - Name: "OmniNudge Production"
   - Permission: "Mail Send" (Full Access)
   - Copy key (starts with `SG.`)

3. **Configure backend/.env**
   ```bash
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey                    # Literal string "apikey"
   SMTP_PASSWORD=SG.your_api_key_here  # Your actual API key
   SMTP_FROM_ADDRESS=noreply@omninudge.com
   SMTP_FROM_NAME=OmniNudge
   ```

4. **Verify Sender** (Required)
   - SendGrid → Settings → Sender Authentication
   - Verify email: noreply@omninudge.com
   - Check email and click verification link

5. **Test**
   ```bash
   ./scripts/verify_smtp.sh your-email@example.com
   ```

**Done!** ✅ Production-ready email sending.

---

## Option 3: Mailgun (Production - Higher Free Tier)

**When to use:** Production, need more free emails

**Pros:**
- 5,000 emails/month free (for 3 months)
- Excellent API
- Detailed analytics

**Cons:**
- Requires credit card
- Free tier is trial (not forever)

### Setup Steps

1. **Create Account**
   - Go to https://www.mailgun.com/
   - Sign up (requires credit card, won't charge)

2. **Get Credentials**
   - Dashboard → Sending → Domains
   - Select sandbox domain OR add your own
   - Copy SMTP credentials

3. **Configure backend/.env**
   ```bash
   SMTP_HOST=smtp.mailgun.org
   SMTP_PORT=587
   SMTP_USER=postmaster@sandboxXXX.mailgun.org  # From dashboard
   SMTP_PASSWORD=your_smtp_password              # From dashboard
   SMTP_FROM_ADDRESS=noreply@yourdomain.com
   SMTP_FROM_NAME=OmniNudge
   ```

4. **Test**
   ```bash
   ./scripts/verify_smtp.sh your-email@example.com
   ```

**Done!** ✅ Production email with higher free tier.

---

## Option 4: AWS SES (Advanced - Highest Volume)

**When to use:** Very high volume, already using AWS

**Pros:**
- 62,000 emails/month free (if using EC2)
- $0.10 per 1,000 emails after
- Unlimited scale

**Cons:**
- Complex setup (15-30 minutes)
- Requires AWS account
- Must request production access (starts in sandbox)

### Setup Steps

1. **AWS Account**
   - Create AWS account if needed
   - Sign in to AWS Console

2. **Create SMTP Credentials**
   - Go to SES Console
   - SMTP Settings → Create SMTP Credentials
   - Download credentials

3. **Verify Domain/Email**
   - SES → Verified Identities
   - Add domain or email
   - Verify via DNS or email

4. **Request Production Access**
   - SES → Account Dashboard
   - "Request production access"
   - Fill out form (approved in 24-48 hours)

5. **Configure backend/.env**
   ```bash
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=your_aws_access_key
   SMTP_PASSWORD=your_aws_secret_key
   SMTP_FROM_ADDRESS=noreply@yourdomain.com
   SMTP_FROM_NAME=OmniNudge
   ```

6. **Test**
   ```bash
   ./scripts/verify_smtp.sh your-email@example.com
   ```

**Done!** ✅ Enterprise-scale email infrastructure.

---

## After Configuration

### Verify SMTP Works

Run the verification script:
```bash
./scripts/verify_smtp.sh your-test-email@example.com
```

**Expected output:**
```
✅ SMTP_HOST configured: smtp.example.com
✅ SMTP_PORT configured: 587
✅ SMTP_USER configured: your-user
✅ SMTP_PASSWORD configured: ****
✅ Test email sent successfully!

Check your inbox at: your-test-email@example.com
```

### Check Your Email

Look for subject: "OmniNudge SMTP Test - Success!"

If you received it, SMTP is working! ✅

---

## What Gets Enabled

Once SMTP is configured:

✅ **P0-036: Email/SMTP** → 100% COMPLETE
✅ **P0-017: Account Deletion** → 100% COMPLETE
✅ **P0-016: Data Export** → 100% COMPLETE

**Phase 0 Completion:** 60% → 67-70%

---

## Email Types That Will Work

- ✅ Account deletion confirmations (30-day grace period)
- ✅ Data export download links (7-day expiry)
- ✅ Password reset emails (1-hour expiry)
- ✅ Email verification
- ✅ Mod mail notifications

---

## Troubleshooting

### Gmail: "Username and Password not accepted"
- **Cause:** Using regular password instead of app password
- **Fix:** Generate app password at https://myaccount.google.com/apppasswords

### SendGrid: "Authentication failed"
- **Cause:** SMTP_USER is not "apikey" (literal string)
- **Fix:** Set `SMTP_USER=apikey` exactly

### Connection timeout
- **Cause:** Firewall blocking port 587
- **Fix:** Check firewall allows outbound SMTP (port 587)

### SendGrid: "Sender not verified"
- **Cause:** FROM address not verified in SendGrid
- **Fix:** SendGrid → Sender Authentication → Verify email

---

## Security Best Practices

✅ **Never commit .env to git** - Already in .gitignore
✅ **Use app passwords** - Not your real password
✅ **Rotate credentials** - Every 90 days
✅ **Use dedicated send address** - Not your personal email
✅ **Set up SPF/DKIM** - For production, configure your DNS records with your provider

---

## Comparison Summary

| | Gmail | SendGrid | Mailgun | AWS SES |
|---|---|---|---|---|
| **Setup Time** | 2 min | 3 min | 5 min | 15 min |
| **Free Tier** | 500/day | 100/day | 5k/mo (3mo) | 62k/mo |
| **Difficulty** | Easy | Easy | Medium | Hard |
| **Best For** | Dev/Test | Production | Production | Enterprise |
| **Scalability** | Low | High | High | Unlimited |
| **Reliability** | Medium | High | High | Highest |
| **Cost (after free)** | N/A | $19.95/mo | $0.80/1k | $0.10/1k |

---

## Recommendation

- **For Development:** Use Gmail (fastest setup)
- **For Production:** Use SendGrid (best balance of ease + reliability)
- **For High Volume:** Use AWS SES (cheapest at scale)

---

## Next Steps

1. Choose your provider (see comparison above)
2. Follow setup steps for that provider
3. Run `./scripts/verify_smtp.sh` to test
4. Check email inbox for test message
5. ✅ Done! Emails will now send

**Time Required:** 2-10 minutes depending on provider

---

**Need More Help?**
Use this guide together with the provider's official documentation for advanced troubleshooting.

---

**Document Version:** 1.0
**Last Updated:** 2026-02-08
**Estimated Time:** 5 minutes
