# Ocobo Posts Repository

Content repository for Ocobo blog posts, client stories, and assets.

## Asset Management

This repository includes tools for managing assets independently from the main website deployment.

### Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Vercel Blob token
   ```

3. **Get Vercel Blob Token:**
   - Go to [Vercel Dashboard > Storage](https://vercel.com/dashboard/stores)
   - Create or access your Blob store
   - Copy the `BLOB_READ_WRITE_TOKEN`

### Commands

```bash
# Upload only changed/new assets (recommended - default behavior)
pnpm upload-assets

# Upload all assets (ignore git status)
pnpm upload-assets:all

# Update markdown URLs to use Blob storage
pnpm update-urls  

# Upload changed assets AND update URLs in one command
pnpm sync-assets

# Upload all assets AND update URLs in one command  
pnpm sync-assets:all

# Choose branch for content fetching (advanced)
pnpm upload-assets:branch
```

### Asset Structure

```
assets/
├── posts/                  # Blog post assets
│   ├── my-post-slug/
│   │   ├── cover.png
│   │   └── diagram.svg
│   └── another-post/
│       └── chart.png
├── clients/                # Client logos & avatars
│   ├── company-logo.png
│   └── company-avatar.png
└── stories/                # Story assets
    └── story-image.jpg
```

### Workflow

#### Quick Workflow (Recommended)
1. **Add/modify assets:**
   ```bash
   mkdir -p assets/posts/my-new-post
   cp my-image.png assets/posts/my-new-post/
   ```

2. **Upload changed assets and update URLs:**
   ```bash
   pnpm sync-assets  # Only uploads changed/new files
   ```

3. **Commit changes:**
   ```bash
   git add .
   git commit -m "Add assets for new post"
   git push
   ```

#### Detailed Workflow  
1. **Check what will be uploaded:**
   ```bash
   git status assets/  # See changed files
   pnpm upload-assets  # Will only upload changed files
   ```

2. **Upload specific changes:**
   ```bash
   pnpm upload-assets     # Changed files only (default)
   pnpm upload-assets:all # All files (if needed)
   ```

3. **Update markdown references:**
   ```bash
   pnpm update-urls
   ```

### How It Works

- **Upload**: Assets are uploaded to Vercel Blob with paths like `content/posts/my-post/image.png`
- **URLs**: Markdown files are updated to use Blob URLs: `https://[blob-id].vercel.app/content/posts/my-post/image.png`
- **Website**: Main website fetches markdown from this repo and images are served from CDN
- **Performance**: No website rebuilds needed when adding/changing assets

### Benefits

✅ **No website rebuilds** when adding content assets  
✅ **CDN performance** for all images  
✅ **Independent workflows** for content and code  
✅ **Automatic asset optimization** via Vercel Blob  
✅ **Version control** for content and assets separately  

### Troubleshooting

- **Token issues**: Make sure `BLOB_READ_WRITE_TOKEN` is set correctly
- **Upload failures**: Check network connection and token permissions  
- **URL updates**: Run `pnpm update-urls` after uploading new assets
- **Large files**: Blob storage supports files up to 500MB

### GitHub Actions

The repository includes automated asset upload on push to `assets/` directory. See `.github/workflows/upload-assets.yml` for configuration.