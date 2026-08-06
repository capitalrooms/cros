# 🔐 OAuth Setup Guide – Get Your Credentials

**Goal:** Set up Google & Apple OAuth so users can log in with one click  
**Time:** ~30-45 minutes total  
**Difficulty:** Easy (just clicking through consoles)

---

## 📱 Part 1: Google OAuth Setup (15 minutes)

### Step 1: Create Google Cloud Project
1. Go to **Google Cloud Console**: https://console.cloud.google.com
2. Sign in with your Google account (or create one)
3. Click **"Select a Project"** (top left)
4. Click **"NEW PROJECT"**
5. Enter project name: `Capital Rooms`
6. Click **"CREATE"**
7. Wait for project to be created (1-2 minutes)

### Step 2: Enable Google+ API
1. In Google Cloud Console, search for **"Google+ API"**
2. Click on "Google+ API"
3. Click **"ENABLE"**
4. Wait for it to enable

### Step 3: Create OAuth Credentials
1. Click **"Create Credentials"** (blue button)
2. Choose: **"OAuth client ID"**
3. You'll see: **"Create OAuth client ID"**
4. First, you need to configure the OAuth consent screen
5. Click **"Configure Consent Screen"**

### Step 4: Configure Consent Screen
1. Choose: **"External"** (for testing)
2. Click **"CREATE"**
3. Fill in the form:
   - **App name:** `Capital Rooms`
   - **User support email:** Your email
   - **Developer contact:** Your email
4. Click **"SAVE AND CONTINUE"**
5. Skip "Scopes" → click **"SAVE AND CONTINUE"**
6. Skip "Test users" → click **"SAVE AND CONTINUE"**
7. Review and click **"BACK TO DASHBOARD"**

### Step 5: Get OAuth Credentials
1. Go to **"Credentials"** (left menu)
2. Click **"+ CREATE CREDENTIALS"**
3. Choose: **"OAuth client ID"**
4. Application type: **"Web application"**
5. Name it: `Capital Rooms Web`
6. Under "Authorized redirect URIs", add:
   ```
   http://localhost:3002/api/auth/google/callback
   http://192.168.1.125:3002/api/auth/google/callback
   ```
7. Click **"CREATE"**
8. You'll see a popup with:
   - **Client ID** ← COPY THIS
   - **Client Secret** ← COPY THIS
9. Click **"OK"**

### Step 6: Save Your Credentials
```
Google OAuth Credentials:
CLIENT_ID: [paste here]
CLIENT_SECRET: [paste here]
```

---

## 🍎 Part 2: Apple OAuth Setup (20-30 minutes)

### Step 1: Apple Developer Account
1. Go to **Apple Developer**: https://developer.apple.com
2. Sign in (or create Apple ID if needed)
3. Click **"Account"** (top right)
4. You need an active Apple Developer Program membership ($99/year)
5. If you don't have one, you can set up a free app for testing

### Step 2: Create App ID
1. Go to **"Certificates, Identifiers & Profiles"**: https://developer.apple.com/account/resources
2. Click **"Identifiers"** (left menu)
3. Click **"+"** (top left)
4. Choose: **"App IDs"**
5. Select: **"App"**
6. Click **"Continue"**
7. Fill in:
   - **Description:** `Capital Rooms Web App`
   - **Bundle ID:** `com.capitalrooms.web`
8. Scroll down and check: **"Sign in with Apple"**
9. Click **"Continue"**
10. Review and click **"Register"**

### Step 3: Create Service ID
1. Go to **"Identifiers"** (left menu)
2. Click **"+"** (top left)
3. Choose: **"Service IDs"**
4. Click **"Continue"**
5. Fill in:
   - **Description:** `Capital Rooms Web Service`
   - **Identifier:** `com.capitalrooms.service`
6. Check: **"Sign in with Apple"**
7. Click **"Continue"**
8. Click **"Register"**

### Step 4: Configure Service ID
1. Go back to **"Identifiers"**
2. Click on the Service ID you just created: `com.capitalrooms.service`
3. Check: **"Sign in with Apple"**
4. Click **"Configure"**
5. Under "Web Authentication Configuration":
   - **Primary App ID:** Select `Capital Rooms Web App`
   - **Domains and Subdomains:** Add:
     ```
     localhost
     192.168.1.125
     [your-production-domain.com]
     ```
   - **Return URLs:** Add:
     ```
     http://localhost:3002/api/auth/apple/callback
     http://192.168.1.125:3002/api/auth/apple/callback
     https://[your-production-domain.com]/api/auth/apple/callback
     ```
6. Click **"Save"**
7. Click **"Continue"**
8. Click **"Save"** again

### Step 5: Create Private Key
1. Go to **"Keys"** (left menu)
2. Click **"+"** (top left)
3. Enter **Key Name:** `Capital Rooms`
4. Check: **"Sign in with Apple"**
5. Click **"Configure"**
6. Select **Primary App ID:** `Capital Rooms Web App`
7. Click **"Save"**
8. Click **"Continue"**
9. Click **"Register"**
10. Click **"Download"** to download the private key
11. **SAVE THIS FILE SAFELY** - you'll need it

### Step 6: Get Your Apple Credentials
1. In Apple Developer, click **"Membership"** (top menu)
2. Find your **Team ID** ← COPY THIS

Now you have:
- **Service ID:** `com.capitalrooms.service` (from step 3)
- **Key ID:** Can be found in "Keys" section
- **Team ID:** From membership page
- **Private Key:** Downloaded file (open it to get the content)

---

## 📝 Summary: What to Send Me

Once you have all credentials, send me:

### **Google OAuth:**
```
CLIENT_ID: [your Google client ID]
CLIENT_SECRET: [your Google client secret]
```

### **Apple OAuth:**
```
TEAM_ID: [your Apple team ID]
SERVICE_ID: com.capitalrooms.service
KEY_ID: [from Apple Keys section]
PRIVATE_KEY: [paste the content of the downloaded .p8 file]
```

---

## ⏱️ Timeline

**Google Setup:** 15 minutes
- Create project → Enable API → Create credentials → Done

**Apple Setup:** 20-30 minutes  
- Create app ID → Create service ID → Configure → Create key → Done

**Total:** ~45 minutes to get both

---

## 🚀 What Happens Next

Once you send me these credentials, I'll:
1. Create OAuth API routes (Google & Apple)
2. Update login page to show social login buttons
3. Test everything
4. Deploy

Then users can:
- 🍎 Click "Sign in with Apple" → Face ID → Logged in
- 🔵 Click "Sign in with Google" → Google prompt → Logged in

---

## ⚠️ Important Notes

- **Google Client Secret:** Keep this SECRET! Don't share in messages, use environment variable
- **Apple Private Key:** Same - keep it secret
- **Redirect URIs:** Must match EXACTLY (including protocol and domain)
- **Free Account:** Apple requires Developer Program membership ($99/year)
- **Testing:** Can use localhost for testing before going live

---

## 📞 Support

If you get stuck on any step:
1. Screenshot the issue
2. Send me the screenshot
3. I'll help you troubleshoot

Good luck! 🎉
