# ContextIQ Deployment Guide

Complete guide for deploying ContextIQ backend and publishing the Chrome extension.

## Table of Contents

1. [Backend Deployment](#backend-deployment)
2. [Chrome Extension Build](#chrome-extension-build)
3. [Chrome Web Store Submission](#chrome-web-store-submission)
4. [Production Configuration](#production-configuration)

---

## Backend Deployment

### Prerequisites

- Node.js 18+ installed
- Grok API key from X.AI
- Server or cloud platform (AWS, DigitalOcean, Heroku, etc.)

### Option 1: Deploy to Heroku

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Login to Heroku**
   ```bash
   heroku login
   ```

3. **Create Heroku App**
   ```bash
   cd backend
   heroku create contextiq-backend
   ```

4. **Set Environment Variables**
   ```bash
   heroku config:set GROK_API_KEY=your_grok_api_key
   heroku config:set NODE_ENV=production
   heroku config:set PORT=3000
   ```

5. **Deploy**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```

### Option 2: Deploy to DigitalOcean

1. **Create Droplet**
   - Ubuntu 22.04 LTS
   - At least 1GB RAM

2. **SSH into Server**
   ```bash
   ssh root@your_server_ip
   ```

3. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Install PM2**
   ```bash
   npm install -g pm2
   ```

5. **Clone and Setup**
   ```bash
   git clone your_repo_url
   cd contextiq/backend
   npm install
   ```

6. **Create .env File**
   ```bash
   nano .env
   ```
   Add:
   ```
   GROK_API_KEY=your_grok_api_key
   NODE_ENV=production
   PORT=3000
   ```

7. **Build and Start**
   ```bash
   npm run build
   pm2 start dist/main.js --name contextiq-backend
   pm2 save
   pm2 startup
   ```

8. **Setup Nginx (Optional)**
   ```bash
   sudo apt install nginx
   sudo nano /etc/nginx/sites-available/contextiq
   ```
   
   Add:
   ```nginx
   server {
       listen 80;
       server_name your_domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   ```bash
   sudo ln -s /etc/nginx/sites-available/contextiq /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

### Option 3: Deploy to AWS EC2

1. **Launch EC2 Instance**
   - Amazon Linux 2 or Ubuntu
   - t2.micro or larger
   - Configure security group (allow port 3000 or 80)

2. **Connect and Setup**
   ```bash
   ssh -i your-key.pem ec2-user@your-instance-ip
   ```

3. **Follow similar steps as DigitalOcean**

---

## Chrome Extension Build

### 1. Update API URL

Edit `extension/src/background/background.ts`:

```typescript
// Change from localhost to your production API
const API_URL = 'https://your-api-domain.com/api/ai';
```

### 2. Build Extension

```bash
cd extension
npm install
npm run build
```

This creates a `dist` folder with the production-ready extension.

### 3. Test Locally

1. Open Chrome: `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` folder
5. Test all features

### 4. Create ZIP for Chrome Web Store

```bash
cd extension/dist
zip -r contextiq-extension.zip .
```

---

## Chrome Web Store Submission

### Prerequisites

- Google Developer Account ($5 one-time fee)
- Extension icons (16x16, 32x32, 48x48, 128x128)
- Screenshots (1280x800 or 640x400)
- Promotional images

### Step 1: Prepare Assets

Create the following in `extension/public/icons/`:

- `icon16.png` - 16x16px
- `icon32.png` - 32x32px
- `icon48.png` - 48x48px
- `icon128.png` - 128x128px

**Screenshots needed:**
- At least 1 screenshot (1280x800 recommended)
- Show the extension in action
- Highlight key features

### Step 2: Chrome Web Store Developer Dashboard

1. **Go to**: https://chrome.google.com/webstore/devconsole
2. **Sign in** with Google account
3. **Pay $5** developer registration fee (one-time)

### Step 3: Upload Extension

1. Click **"New Item"**
2. Upload `contextiq-extension.zip`
3. Fill in details:

**Store Listing:**
- **Name**: ContextIQ
- **Summary**: AI-powered browser assistant that works on any website
- **Description**:
  ```
  ContextIQ brings AI capabilities directly to your browsing experience without switching tabs.

  KEY FEATURES:
  ✨ Summarize - Get concise summaries of any text
  ✍️ Rewrite - Improve clarity and readability
  🌐 Translate - Translate to any language
  💡 Explain - Understand complex concepts
  ❓ Ask Questions - Get answers based on context

  HOW IT WORKS:
  1. Select any text on a webpage
  2. Right-click or use the floating toolbar
  3. Choose an action
  4. View AI-generated results in the side panel

  PRIVACY & SECURITY:
  - Secure API communication
  - No data stored permanently
  - Rate limiting for fair usage

  REQUIREMENTS:
  - Active internet connection
  - Backend API access (see documentation)
  ```

- **Category**: Productivity
- **Language**: English

**Privacy:**
- **Single Purpose**: AI-powered text processing assistant
- **Permission Justification**:
  - `contextMenus`: To add right-click menu options
  - `activeTab`: To read selected text from webpages
  - `sidePanel`: To display AI responses
  - `storage`: To save user preferences
  - `<all_urls>`: To work on any website

**Screenshots:**
- Upload at least 1 screenshot
- Show the extension UI and features

**Icons:**
- Small tile: 128x128
- Upload your icon files

**Promotional Images (Optional but recommended):**
- Marquee: 1400x560
- Small tile: 440x280

### Step 4: Submit for Review

1. Click **"Submit for Review"**
2. Review process typically takes 1-3 days
3. You'll receive email notification

### Step 5: After Approval

- Extension will be live on Chrome Web Store
- Users can install via store link
- Monitor reviews and ratings
- Update as needed

---

## Production Configuration

### Backend Environment Variables

```env
# Production .env
GROK_API_KEY=your_production_grok_api_key
GROK_API_URL=https://api.x.ai/v1/chat/completions
PORT=3000
NODE_ENV=production
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=10
CORS_ORIGIN=chrome-extension://*
```

### Extension Configuration

Update `extension/src/background/background.ts`:

```typescript
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-production-api.com/api/ai'
  : 'http://localhost:3000/api/ai';
```

### Security Checklist

- [ ] API key stored securely (environment variables)
- [ ] CORS configured properly
- [ ] Rate limiting enabled
- [ ] HTTPS enabled for production API
- [ ] Error messages don't expose sensitive info
- [ ] Input validation on all endpoints
- [ ] Content Security Policy configured

### Monitoring

**Backend:**
- Use PM2 for process management
- Setup logging (Winston, Pino)
- Monitor API usage
- Track error rates

**Extension:**
- Monitor Chrome Web Store reviews
- Track user feedback
- Check error reports in Chrome Web Store dashboard

---

## Updating the Extension

### 1. Make Changes

```bash
cd extension
# Make your changes
npm run build
```

### 2. Update Version

Edit `extension/public/manifest.json`:
```json
{
  "version": "1.0.1"  // Increment version
}
```

### 3. Create New ZIP

```bash
cd extension/dist
zip -r contextiq-extension-v1.0.1.zip .
```

### 4. Upload to Chrome Web Store

1. Go to Developer Dashboard
2. Select your extension
3. Click "Upload Updated Package"
4. Upload new ZIP
5. Submit for review

---

## Troubleshooting

### Backend Issues

**API not responding:**
- Check if server is running: `pm2 status`
- Check logs: `pm2 logs contextiq-backend`
- Verify environment variables
- Check firewall settings

**CORS errors:**
- Verify CORS configuration in `main.ts`
- Check if origin matches extension ID

### Extension Issues

**Extension not loading:**
- Check manifest.json syntax
- Verify all file paths
- Check browser console for errors

**API calls failing:**
- Verify API URL is correct
- Check network tab in DevTools
- Ensure backend is accessible

**Side panel not opening:**
- Check Chrome version (requires Chrome 114+)
- Verify sidePanel permission in manifest

---

## Support

For issues or questions:
- GitHub Issues: [your-repo-url]
- Email: support@contextiq.com
- Documentation: [your-docs-url]

---

## License

MIT License - See LICENSE file for details
