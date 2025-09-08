# Next.js Implementation Plan for TradeMind Marketing Site

## Overview

This document outlines the implementation plan for achieving a Lighthouse score of 100 using Next.js 15 for the TradeMind marketing site, including landing pages, blog, and documentation.

## Architecture

### Dual-App Structure

```
trademind/
├── apps/
│   ├── marketing/          # Next.js - Landing, blog, docs (SSG)
│   │   ├── pages/
│   │   ├── content/        # MDX blog posts & docs
│   │   └── public/
│   └── app/               # Current React app (SPA)
│       └── (existing code)
├── packages/
│   ├── ui/                # Shared UI components
│   ├── types/             # Shared TypeScript types
│   └── utils/             # Shared utilities
└── pnpm-workspace.yaml    # Monorepo config
```

### Why This Approach?
- Marketing site needs SSG for SEO/performance
- Trading app needs real-time updates (SPA is fine)
- Different optimization strategies for each
- Easier to achieve Lighthouse 100 on static pages

## Technology Stack

```json
{
  "framework": "Next.js 15 with App Router",
  "styling": "Tailwind CSS (compiled, not CDN)",
  "content": "MDX for blog/docs",
  "deployment": "Vercel (best for Next.js)",
  "analytics": "Vercel Analytics + Web Vitals"
}
```

### Key Features
- **Static Site Generation (SSG)** for all marketing pages
- **Incremental Static Regeneration (ISR)** for blog posts
- **Image Optimization** with next/image
- **Font Optimization** with next/font
- **Automatic Code Splitting**
- **Built-in Web Vitals monitoring**

## Performance Optimization Strategy

### Core Web Vitals Targets
- **First Contentful Paint (FCP)**: < 1.8s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **Total Blocking Time (TBT)**: < 300ms
- **Cumulative Layout Shift (CLS)**: < 0.1
- **Speed Index**: < 3.4s

### Implementation Checklist

#### 1. Initial HTML Optimization

```tsx
// app/layout.tsx
export default function RootLayout() {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to critical domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.trademind.ai" />
        
        {/* Inline critical CSS */}
        <style dangerouslySetInnerHTML={{ __html: criticalCSS }} />
      </head>
      <body>
        {/* Content */}
      </body>
    </html>
  );
}
```

#### 2. Image Optimization

```tsx
// Use Next.js Image component with blur placeholders
import Image from 'next/image';

<Image
  src="/hero-screenshot.png"
  alt="TradeMind Dashboard"
  width={1200}
  height={675}
  placeholder="blur"
  blurDataURL={blurDataUrl}
  priority={true} // For above-fold images
  quality={85}
/>
```

#### 3. Font Optimization

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'arial'],
});
```

#### 4. JavaScript Optimization

```tsx
// Lazy load non-critical components
const DemoVideo = dynamic(() => import('./DemoVideo'), {
  loading: () => <div>Loading demo...</div>,
  ssr: false,
});

// Use React 19's native lazy loading
const PricingSection = lazy(() => import('./PricingSection'));
```

#### 5. Critical CSS Strategy

```tsx
// Extract and inline critical CSS
// next.config.js
module.exports = {
  experimental: {
    optimizeCss: true,
  },
};
```

### Bundle Size Optimization

#### Waitlist Form (Minimal Bundle)

```tsx
// Only load what's needed for initial interaction
// components/WaitlistForm.tsx
'use client';

import { useState } from 'react';
// NO heavy libraries for simple form

export default function WaitlistForm() {
  // Vanilla implementation, no heavy form libraries
  // Total bundle: < 10KB
}
```

#### Progressive Enhancement

```tsx
// Load features as needed
const loadAnalytics = () => import('./analytics');
const loadChat = () => import('./chat');

// Only load after user interaction
button.addEventListener('click', async () => {
  const { trackEvent } = await loadAnalytics();
  trackEvent('waitlist_signup');
});
```

## SEO Implementation

### Technical SEO Foundation

#### 1. Meta Tags & SEO Component

```tsx
// app/seo.tsx
export function SEO({
  title,
  description,
  image,
  article,
}: SEOProps) {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content={article ? 'article' : 'website'} />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      
      {/* Canonical */}
      <link rel="canonical" href={canonicalUrl} />
    </>
  );
}
```

#### 2. Structured Data (JSON-LD)

```tsx
// components/StructuredData.tsx
export function StructuredData() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "TradeMind AI",
    "applicationCategory": "FinanceApplication",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "127"
    }
  };
  
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

#### 3. Dynamic Sitemap Generation

```tsx
// app/sitemap.ts
export default async function sitemap() {
  const posts = await getBlogPosts();
  const docs = await getDocPages();
  
  return [
    {
      url: 'https://trademind.ai',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://trademind.ai/pricing',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...posts.map((post) => ({
      url: `https://trademind.ai/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'monthly',
      priority: 0.6,
    })),
    ...docs.map((doc) => ({
      url: `https://trademind.ai/docs/${doc.slug}`,
      lastModified: doc.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
    })),
  ];
}
```

#### 4. Robots.txt

```txt
# public/robots.txt
User-agent: *
Allow: /

Sitemap: https://trademind.ai/sitemap.xml

# Block app routes from indexing
Disallow: /app/*
Disallow: /api/*
Disallow: /admin/*
```

### Content SEO Strategy

#### URL Structure
```
/                    → Landing page
/features           → Feature showcase
/pricing            → Pricing page
/blog              → Blog index
/blog/[slug]       → Blog posts
/docs              → Documentation
/docs/[...slug]    → Nested docs
```

#### Blog Post Optimization

```mdx
---
title: "How AI is Revolutionizing Crypto Trading"
description: "Discover how natural language processing..."
publishedAt: "2025-01-09"
author: "Trading Team"
tags: ["AI", "crypto", "trading"]
image: "/blog/ai-crypto-hero.jpg"
---

# How AI is Revolutionizing Crypto Trading

<TableOfContents />

## Introduction
{/* Auto-generate meta description from first paragraph */}

## Key Takeaways
- Point 1
- Point 2
- Point 3

{/* Content with proper heading hierarchy */}
```

## Content Management

### MDX-Based Content System

#### Directory Structure
```
content/
├── blog/
│   ├── 2025-01-09-ai-crypto-trading.mdx
│   ├── 2025-01-15-rsi-strategy-guide.mdx
│   └── _drafts/
├── docs/
│   ├── getting-started/
│   │   ├── index.mdx
│   │   ├── installation.mdx
│   │   └── first-signal.mdx
│   ├── api-reference/
│   └── tutorials/
└── changelog/
    └── 2025-01.mdx
```

#### Content Configuration

```tsx
// contentlayer.config.ts
export default makeSource({
  contentDirPath: 'content',
  documentTypes: [
    {
      name: 'Post',
      filePathPattern: 'blog/*.mdx',
      fields: {
        title: { type: 'string', required: true },
        publishedAt: { type: 'date', required: true },
        description: { type: 'string', required: true },
        image: { type: 'string', required: true },
        tags: { type: 'list', of: { type: 'string' } },
      },
      computedFields: {
        slug: {
          type: 'string',
          resolve: (post) => post._raw.flattenedPath.replace('blog/', ''),
        },
        readingTime: {
          type: 'string',
          resolve: (post) => calculateReadingTime(post.body.raw),
        },
      },
    },
  ],
});
```

### Performance-Optimized Content Loading

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await allPosts;
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  return {
    title: post.title,
    description: post.description,
    openGraph: {
      images: [post.image],
    },
  };
}
```

## Lighthouse 100 Checklist

### Performance (100)
- [ ] < 1s First Contentful Paint
- [ ] < 2.5s Largest Contentful Paint  
- [ ] < 100ms Total Blocking Time
- [ ] < 0.1 Cumulative Layout Shift
- [ ] Preload critical resources
- [ ] Lazy load below-fold content
- [ ] Optimize all images (WebP/AVIF)
- [ ] Inline critical CSS
- [ ] Remove render-blocking resources

### Accessibility (100)
- [ ] Proper heading hierarchy
- [ ] Alt text for all images
- [ ] ARIA labels where needed
- [ ] Keyboard navigation
- [ ] Color contrast ratios
- [ ] Focus indicators

### Best Practices (100)
- [ ] HTTPS everywhere
- [ ] No console errors
- [ ] Modern image formats
- [ ] Correct meta viewport
- [ ] No vulnerable libraries

### SEO (100)
- [ ] Meta descriptions
- [ ] Proper title tags
- [ ] Canonical URLs
- [ ] Structured data
- [ ] Mobile-friendly
- [ ] Crawlable links

## Implementation Timeline

### Week 1
- Set up Next.js marketing site
- Implement landing page with waitlist
- Configure performance optimizations

### Week 2
- Add blog infrastructure
- Create initial blog posts
- Set up documentation structure

### Week 3
- Performance testing & optimization
- SEO implementation
- Analytics setup

### Week 4
- Content creation
- A/B testing setup
- Launch preparation

## Monitoring & Maintenance

```tsx
// Monitor Core Web Vitals
import { getCLS, getFID, getLCP } from 'web-vitals';

export function reportWebVitals(metric) {
  // Send to analytics
  analytics.track('web-vitals', {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
  });
}
```

## Project Setup Commands

```bash
# Create Next.js app with App Router
pnpm create next-app@latest apps/marketing --typescript --tailwind --app

# Install additional dependencies
cd apps/marketing
pnpm add contentlayer next-contentlayer
pnpm add @next/mdx @mdx-js/loader
pnpm add web-vitals
pnpm add sharp # For image optimization

# Development
pnpm dev

# Build for production
pnpm build

# Analyze bundle
pnpm add -D @next/bundle-analyzer
```

## Next.js Configuration

```js
// next.config.js
const { withContentlayer } = require('next-contentlayer');

module.exports = withContentlayer({
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    optimizeCss: true,
  },
});
```

## Deployment Configuration

```json
// vercel.json
{
  "functions": {
    "app/api/waitlist.ts": {
      "maxDuration": 10
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

## Quick Wins for Current App

While building the new marketing site, optimize your current app:
1. **Code splitting** by route (especially admin routes)
2. **Lazy load** heavy components (charts, modals)
3. **Tree shake** Firebase imports
4. **Move to CDN** for static assets
5. **Implement caching** headers

## Summary

This dual-app approach gives you the best of both worlds: blazing-fast marketing pages that rank well in search engines, and a powerful trading app that prioritizes real-time functionality.