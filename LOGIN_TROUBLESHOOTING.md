# 🔐 Login Troubleshooting Guide

**Issue:** Login attempt resulted in 404 page (broken experience)  
**Fix Applied:** Better error handling, proper error pages, fallback redirects

---

## ✅ What Was Fixed

1. **Created proper error handling page** (`/error.tsx`)
   - Shows actual error message instead of 404
   - Provides "Try again" button
   - Shows "Return to login" option

2. **Created proper 404 page** (`/not-found.tsx`)
   - Helps users understand what happened
   - Provides navigation options
   - Explains common reasons for 404s

3. **Improved login page error handling**
   - Better error messages
   - Fallback redirect if router.push fails
   - Validates role before redirecting
   - Timeout protection

4. **Added middleware** (`middleware.ts`)
   - Allows protected routes to render
   - Auth checked in pages, not middleware
   - Prevents unnecessary 404s

---

## 🔍 Debugging: How to Find the Real Error

If login still fails, we need to see the ACTUAL error, not a 404. Follow these steps:

### Step 1: Open Browser Console
```
Press: F12 (or Cmd+Option+I on Mac)
Click: "Console" tab
Look for: Red error messages
```

### Step 2: Check Network Tab
```
Press: F12
Click: "Network" tab
Try to login
Look for: Failed requests (red text)
Click on failed request: Check "Response" tab for error
```

### Step 3: Try Login and Report
```
1. Go to http://192.168.1.125:3002/login
2. Enter: harry@capitalrooms.co.uk / TestPassword123!
3. Click "Sign in"
4. Look at console (F12)
5. Tell me what error message appears
```

---

## 🐛 Common Login Errors & Solutions

### Error: "Invalid email or password"
**Solution:**
- ✅ Double-check email is exactly: `harry@capitalrooms.co.uk`
- ✅ Double-check password is exactly: `TestPassword123!`
- ✅ Make sure Caps Lock is OFF
- ✅ Try copying/pasting credentials from this guide

### Error: "This email is not recognized"
**Solution:**
- ✅ User email must be in the `people` table in Supabase
- ✅ Check Supabase console: Table `people` → Look for the email
- ✅ If not there, add user via admin UI or database

### Error: "Your account is not properly set up"
**Solution:**
- ✅ User exists in `people` table but no `role` field
- ✅ Check Supabase: `people` table → Make sure `role` column has value
- ✅ Valid roles: admin, tenant, contractor, cleaner, agent, landlord

### Error: "An unexpected error occurred"
**Solution:**
- ✅ Check browser console (F12) for detailed error
- ✅ Check if Supabase is running
- ✅ Check if auth service is accessible
- ✅ Try clearing browser cache (Ctrl+Shift+Delete)

---

## 📋 Pre-Login Checklist

Before trying to login, verify:

- [ ] You're at: `http://192.168.1.125:3002/login`
- [ ] Page loads without 404 error
- [ ] Login form displays with email/password fields
- [ ] "Sign in" button is clickable
- [ ] Browser console open (F12) to catch errors

---

## 🔐 Credentials to Test

### Admin Account
```
Email:    harry@capitalrooms.co.uk
Password: TestPassword123!
Expected: Redirects to /admin dashboard
```

### Tenant Account
```
Email:    itsharryb@protonmail.com
Password: password
Expected: Redirects to /tenant dashboard
```

### Contractor Account
```
Email:    contractor@example.com
Password: password
Expected: Redirects to /contractor dashboard
```

---

## 🔗 Debugging Checklist

If login fails, go through this:

1. **Check page loads:**
   - [ ] No 404 error on login page
   - [ ] Login form visible
   - [ ] All fields render

2. **Check console errors (F12):**
   - [ ] No red errors in console
   - [ ] No network failures
   - [ ] No JavaScript errors

3. **Check credentials:**
   - [ ] Email matches exactly
   - [ ] Password matches exactly
   - [ ] No extra spaces

4. **Check backend:**
   - [ ] Supabase running
   - [ ] Email exists in `people` table
   - [ ] User has a `role` value
   - [ ] `role` is valid (admin, tenant, etc.)

5. **Check redirect:**
   - [ ] After login, page attempts to go to `/{role}`
   - [ ] That page exists and loads
   - [ ] No 404 on redirect

---

## 📱 What Should Happen (Correct Flow)

```
1. User at /login
2. Enters credentials
3. Clicks "Sign in"
4. Button shows "Signing in…"
5. System checks Supabase auth
6. System checks person's role
7. Page redirects to /{role}
8. Dashboard loads with data
✓ User logged in successfully
```

## ❌ What's Broken (If 404 Shows)

```
1. User at /login
2. Enters credentials
3. Clicks "Sign in"
4. One of these happens:
   ❌ Auth fails silently → shows 404
   ❌ Role lookup fails → shows 404
   ❌ Redirect fails → shows 404
   ❌ Destination page blocked → shows 404
✗ User sees broken 404 page (what happened today)
```

---

## ✅ The Fix (Now Applied)

```
✓ Better error messages (not 404s)
✓ Proper error page if something fails
✓ Fallback redirect mechanism
✓ Timeout protection
✓ Role validation before redirect
✓ Middleware to allow pages to load
✓ Comprehensive error logging
```

---

## 🚀 Next Steps

1. **Clear browser cache:** Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
2. **Refresh page:** Ctrl+F5 (or Cmd+Shift+R on Mac)
3. **Try login again:** With harry@capitalrooms.co.uk
4. **Open console (F12):** Watch for any errors
5. **Report any errors:** Copy/paste them here

---

## 💡 If Still Broken

If you still see a 404 or error, please provide:

1. **Exact URL** you're trying to access
2. **Exact error message** from browser console (F12)
3. **Screenshot** of what you see
4. **Steps to reproduce** exactly what you did

This will help me pinpoint the exact issue.

---

## ✨ What You Should See Now

After the fix, you should see:
- ✅ Clear error messages (not 404s)
- ✅ "Try again" button option
- ✅ "Return to login" option
- ✅ Helpful explanations of what went wrong
- ✅ Professional error pages (not blank 404s)

**Try login again and tell me what happens!**
