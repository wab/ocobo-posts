#!/usr/bin/env node

/**
 * Upload assets from /assets directory to Vercel Blob
 * Prerequisites: pnpm add @vercel/blob
 * 
 * Usage:
 *   pnpm upload-assets                    # Upload only changed/new assets (default)
 *   pnpm upload-assets:branch             # Choose branch for content fetching
 *   node scripts/upload-assets.js --all   # Upload all assets
 *   node scripts/upload-assets.js --help  # Show help
 */

import { put } from '@vercel/blob';
import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const assetsDir = join(rootDir, 'assets');

// Environment variables
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;

async function showUsage() {
  console.log(`
🚀 Ocobo Posts - Asset Upload Tool

Upload assets from /assets directory to Vercel Blob storage.

Usage:
  pnpm upload-assets                    Upload only changed/new assets (default)
  pnpm upload-assets:branch             Choose branch for content fetching  
  node scripts/upload-assets.js        Direct script execution
  node scripts/upload-assets.js --all  Upload all assets (ignore git diff)

Options:
  --help, -h                           Show this help message
  --all, -a                           Upload all assets (ignore git diff)
  --branch, -b                         Allow branch selection for content
  --force                             Force upload even if no changes detected

Default Behavior:
  By default, only uploads assets that are:
  - New (untracked by git)
  - Modified (changed since last commit)  
  - Staged for commit

Environment Variables:
  BLOB_READ_WRITE_TOKEN                Vercel Blob read/write token
  VERCEL_BLOB_READ_WRITE_TOKEN         Alternative token variable

Asset Structure:
  assets/
  ├── posts/                          Blog post assets
  │   └── post-slug/
  │       └── image.png
  ├── clients/                        Client logos & avatars
  │   └── client-logo.png
  └── stories/                        Story assets
      └── story-assets.png

Examples:
  # Upload only new/changed assets (recommended)
  mkdir -p assets/posts/my-new-post
  cp image.png assets/posts/my-new-post/
  pnpm upload-assets

  # Upload all assets regardless of git status
  pnpm upload-assets -- --all

  # Check what would be uploaded
  git status assets/
`);
}

function isImageFile(filename) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const contentTypes = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'gif': 'image/gif'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getChangedAssets() {
  const changedFiles = new Set();
  
  try {
    // Check if we're in a git repository
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    
    // Get untracked files in assets directory
    const untrackedOutput = execSync('git ls-files --others --exclude-standard assets/', { 
      encoding: 'utf8', 
      cwd: rootDir 
    }).trim();
    
    if (untrackedOutput) {
      untrackedOutput.split('\n').forEach(file => changedFiles.add(file));
    }
    
    // Get modified files in assets directory
    const modifiedOutput = execSync('git diff --name-only HEAD assets/', { 
      encoding: 'utf8', 
      cwd: rootDir 
    }).trim();
    
    if (modifiedOutput) {
      modifiedOutput.split('\n').forEach(file => changedFiles.add(file));
    }
    
    // Get staged files in assets directory
    const stagedOutput = execSync('git diff --staged --name-only assets/', { 
      encoding: 'utf8', 
      cwd: rootDir 
    }).trim();
    
    if (stagedOutput) {
      stagedOutput.split('\n').forEach(file => changedFiles.add(file));
    }
    
  } catch (error) {
    console.warn('⚠️  Not in a git repository or git command failed, will upload all assets');
    return null; // Return null to indicate we should upload all files
  }
  
  return Array.from(changedFiles).filter(file => file && isImageFile(file));
}

function shouldUploadFile(filePath, changedAssets, uploadAll) {
  if (uploadAll || !changedAssets) {
    return true;
  }
  
  // Convert absolute path to relative path from root
  const relativePath = filePath.replace(rootDir + '/', '');
  return changedAssets.includes(relativePath);
}

async function findAssetFiles(dirPath, relativePath = '') {
  const files = [];
  
  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const relativeFilePath = join(relativePath, entry);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        const subFiles = await findAssetFiles(fullPath, relativeFilePath);
        files.push(...subFiles);
      } else if (isImageFile(entry)) {
        files.push({
          localPath: fullPath,
          blobPath: relativeFilePath.replace(/\\/g, '/'), // Normalize path separators
          size: stats.size
        });
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not read directory ${dirPath}:`, error.message);
    }
  }
  
  return files;
}

async function uploadFile(file) {
  try {
    const fileBuffer = await readFile(file.localPath);
    const contentType = getContentType(file.blobPath);
    const blobPath = `content/${file.blobPath}`;
    
    console.log(`📤 Uploading: ${file.blobPath} (${formatBytes(file.size)})`);
    
    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true
    });
    
    console.log(`✅ Uploaded: ${blob.url}`);
    
    return {
      localPath: file.localPath,
      blobPath: file.blobPath,
      url: blob.url,
      size: file.size
    };
    
  } catch (error) {
    console.error(`❌ Failed to upload ${file.blobPath}:`, error.message);
    throw error;
  }
}

async function promptBranchSelection() {
  console.log(`
🌟 Branch Selection Mode

This feature allows you to specify which branch the main website should use 
when fetching content. This is useful for testing content changes before 
they go live.

Current behavior:
- Main website fetches content from the main/master branch
- You can specify a different branch for content fetching
- Assets are always uploaded to the same blob storage

Note: Branch selection for content fetching is configured on the main website,
not in this repository. This is a reminder feature.
`);

  return 'main'; // Default branch
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle help
  if (args.includes('--help') || args.includes('-h')) {
    await showUsage();
    return;
  }
  
  // Parse options
  const uploadAll = args.includes('--all') || args.includes('-a');
  const branchMode = args.includes('--branch') || args.includes('-b');
  const force = args.includes('--force');
  
  if (branchMode) {
    await promptBranchSelection();
  }
  
  if (uploadAll) {
    console.log('🚀 Starting asset upload to Vercel Blob (ALL ASSETS)...\n');
  } else {
    console.log('🚀 Starting asset upload to Vercel Blob (CHANGED ASSETS ONLY)...\n');
  }
  
  // Check for required environment variable
  if (!BLOB_TOKEN) {
    console.error('❌ Blob token is required');
    console.log('Set one of these environment variables:');
    console.log('  BLOB_READ_WRITE_TOKEN');
    console.log('  VERCEL_BLOB_READ_WRITE_TOKEN');
    console.log('');
    console.log('Get your token from: https://vercel.com/dashboard/stores');
    process.exit(1);
  }
  
  // Check if assets directory exists
  try {
    await stat(assetsDir);
  } catch (error) {
    console.log('📁 No /assets directory found. Creating example structure...\n');
    
    console.log(`Please create your assets in the following structure:
    
assets/
├── posts/
│   └── your-post-slug/
│       ├── cover.png
│       └── diagram.svg
├── clients/
│   ├── client-logo.png
│   └── client-avatar.png
└── stories/
    └── story-image.jpg

Then run: pnpm upload-assets`);
    return;
  }
  
  try {
    // Get changed assets (unless uploading all)
    let changedAssets = null;
    if (!uploadAll) {
      console.log('🔍 Checking git status for changed assets...');
      changedAssets = await getChangedAssets();
      
      if (changedAssets && changedAssets.length > 0) {
        console.log(`📝 Found ${changedAssets.length} changed asset(s):`);
        changedAssets.forEach(file => console.log(`  - ${file}`));
        console.log('');
      } else if (changedAssets && changedAssets.length === 0 && !force) {
        console.log('✅ No changed assets found. Nothing to upload.');
        console.log('💡 To upload all assets: pnpm upload-assets -- --all');
        console.log('💡 To force upload: pnpm upload-assets -- --force');
        return;
      }
    }
    
    // Find all asset files
    console.log('🔍 Scanning for asset files...');
    const allFiles = await findAssetFiles(assetsDir);
    
    // Filter files based on git status (unless uploading all)
    const files = allFiles.filter(file => shouldUploadFile(file.localPath, changedAssets, uploadAll));
    
    if (files.length === 0) {
      if (uploadAll) {
        console.log('No image files found in /assets directory.');
        console.log('Supported formats: PNG, JPG, JPEG, SVG, WebP, GIF');
      } else {
        console.log('No changed image files to upload.');
        console.log('💡 To upload all assets: pnpm upload-assets -- --all');
      }
      return;
    }
    
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    console.log(`Found ${files.length} file(s) to upload (${formatBytes(totalSize)})\n`);
    
    // Upload files in batches
    const batchSize = 5;
    const results = [];
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}`);
      
      const promises = batch.map(file => uploadFile(file));
      const batchResults = await Promise.all(promises);
      
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Summary
    console.log('\n✅ Upload completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`- Files uploaded: ${results.length}`);
    console.log(`- Total size: ${formatBytes(totalSize)}`);
    
    console.log('\n🔄 Next steps:');
    console.log('1. Run: pnpm update-urls (to update markdown references)');
    console.log('2. Or use: pnpm sync-assets (upload + update in one command)');
    
  } catch (error) {
    console.error('\n❌ Upload failed:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();