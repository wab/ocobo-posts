#!/usr/bin/env node

/**
 * Update asset URLs in markdown files to use Vercel Blob URLs
 * This script looks for assets that have been uploaded and updates references
 * 
 * Usage:
 *   pnpm update-urls                      # Update all asset references
 *   node scripts/update-asset-urls.js     # Direct script execution
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Known blob URL pattern - this should match your actual blob storage URL
const BLOB_BASE_URL = 'https://jr0deqtyc8c5pvr8.public.blob.vercel-storage.com/content/';

async function showUsage() {
  console.log(`
🔄 Ocobo Posts - Asset URL Update Tool

Update markdown files to use Vercel Blob URLs for assets.

Usage:
  pnpm update-urls                      Update all asset references
  node scripts/update-asset-urls.js     Direct script execution

What it does:
- Scans all markdown files in blog/, stories/, legal/
- Finds asset references that should use Blob URLs
- Updates local paths to Blob URLs
- Handles both relative and absolute URL references

Examples of updates:
  /assets/posts/my-post/image.png     → https://blob.../content/posts/my-post/image.png
  assets/clients/logo.png             → https://blob.../content/clients/logo.png
  https://www.ocobo.co/assets/...     → https://blob.../content/...
`);
}

async function findMarkdownFiles(dirPath) {
  const files = [];
  
  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        const subFiles = await findMarkdownFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not read directory ${dirPath}:`, error.message);
    }
  }
  
  return files;
}

async function findAssetPaths() {
  const assetPaths = [];
  const assetsDir = join(rootDir, 'assets');
  
  try {
    await walkDirectory(assetsDir, '');
  } catch (error) {
    console.log('No /assets directory found, checking for existing asset references...');
  }
  
  async function walkDirectory(dirPath, relativePath) {
    try {
      const entries = await readdir(dirPath);
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const relativeFilePath = join(relativePath, entry);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          await walkDirectory(fullPath, relativeFilePath);
        } else if (isImageFile(entry)) {
          assetPaths.push(relativeFilePath.replace(/\\/g, '/'));
        }
      }
    } catch (error) {
      // Skip directories that don't exist
    }
  }
  
  return assetPaths;
}

function isImageFile(filename) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function updateMarkdownContent(content, assetPaths) {
  let updatedContent = content;
  let replacements = 0;
  
  // Pattern 1: /assets/... -> blob URL
  const assetPattern = /\/assets\/([\w\-\/\.]+\.(png|jpg|jpeg|svg|webp|gif))/gi;
  updatedContent = updatedContent.replace(assetPattern, (match, assetPath) => {
    replacements++;
    return `${BLOB_BASE_URL}${assetPath}`;
  });
  
  // Pattern 2: assets/... -> blob URL (relative paths)
  const relativeAssetPattern = /(?<!\/|https:\/\/[^\s]*?)assets\/([\w\-\/\.]+\.(png|jpg|jpeg|svg|webp|gif))/gi;
  updatedContent = updatedContent.replace(relativeAssetPattern, (match, assetPath) => {
    replacements++;
    return `${BLOB_BASE_URL}${assetPath}`;
  });
  
  // Pattern 3: https://www.ocobo.co/assets/... -> blob URL
  const absoluteAssetPattern = /https:\/\/www\.ocobo\.co\/assets\/([\w\-\/\.]+\.(png|jpg|jpeg|svg|webp|gif))/gi;
  updatedContent = updatedContent.replace(absoluteAssetPattern, (match, assetPath) => {
    replacements++;
    return `${BLOB_BASE_URL}${assetPath}`;
  });
  
  // Pattern 4: Fix any double-blob URLs that might have been created
  const doubleBlobPattern = new RegExp(`https://www\\.ocobo\\.co${BLOB_BASE_URL}`, 'gi');
  updatedContent = updatedContent.replace(doubleBlobPattern, BLOB_BASE_URL);
  
  return { content: updatedContent, replacements };
}

async function updateFile(filePath, assetPaths) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { content: updatedContent, replacements } = updateMarkdownContent(content, assetPaths);
    
    if (replacements === 0) {
      return { updated: false, replacements: 0 };
    }
    
    const relativePath = filePath.replace(rootDir, '').replace(/^\//, '');
    console.log(`📝 ${relativePath}: ${replacements} URL(s) updated`);
    
    await writeFile(filePath, updatedContent, 'utf-8');
    
    return { updated: true, replacements };
  } catch (error) {
    console.error(`❌ Failed to update ${filePath}:`, error.message);
    return { updated: false, replacements: 0, error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    await showUsage();
    return;
  }
  
  console.log('🔄 Starting asset URL updates...\n');
  
  try {
    // Find all markdown files
    console.log('🔍 Finding markdown files...');
    const markdownFiles = [];
    
    // Search in common content directories
    const contentDirs = ['blog', 'stories', 'legal'];
    for (const dir of contentDirs) {
      const dirPath = join(rootDir, dir);
      const files = await findMarkdownFiles(dirPath);
      markdownFiles.push(...files);
    }
    
    console.log(`Found ${markdownFiles.length} markdown files\n`);
    
    if (markdownFiles.length === 0) {
      console.log('No markdown files found to process.');
      return;
    }
    
    // Find asset paths for reference
    console.log('🔍 Scanning for asset references...');
    const assetPaths = await findAssetPaths();
    
    // Update files
    let totalUpdated = 0;
    let totalReplacements = 0;
    const errors = [];
    
    for (const file of markdownFiles) {
      const result = await updateFile(file, assetPaths);
      
      if (result.updated) {
        totalUpdated++;
      }
      
      totalReplacements += result.replacements;
      
      if (result.error) {
        errors.push({ file, error: result.error });
      }
    }
    
    // Summary
    console.log('\n✅ URL update completed!');
    console.log(`\n📊 Summary:`);
    console.log(`- Files processed: ${markdownFiles.length}`);
    console.log(`- Files updated: ${totalUpdated}`);
    console.log(`- Total URL replacements: ${totalReplacements}`);
    console.log(`- Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(({ file, error }) => {
        console.log(`  - ${file}: ${error}`);
      });
    }
    
    if (totalUpdated > 0) {
      console.log('\n🎉 Asset URLs have been updated to use Vercel Blob!');
      console.log('\n📝 Next steps:');
      console.log('1. Review changes: git diff');
      console.log('2. Commit changes: git add . && git commit -m "Update asset URLs to Vercel Blob"');
      console.log('3. Push changes: git push');
    }
    
  } catch (error) {
    console.error('\n❌ Update process failed:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();