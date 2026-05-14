#!/usr/bin/env python3
"""
LaunchDarkly SE Content Scraper
================================
Scrapes and downloads 50 public LaunchDarkly SE resources — 10 per content type —
organized to match the SE Content Hub database schema (deck, video, demo, doc, code).

Output:
  scraped_content/
  ├── manifest.json          ← Full dataset, ready to seed into the app
  ├── decks/                 ← Real LaunchDarkly PDFs (downloaded)
  ├── videos/                ← YouTube metadata + thumbnails (via oEmbed)
  ├── demos/                 ← LaunchDarkly blog walkthroughs (HTML + text)
  ├── docs/                  ← LaunchDarkly documentation pages (HTML + text)
  └── codes/                 ← GitHub repo README + metadata

Dependencies:
    pip install -r requirements.txt

Usage:
    python scraper.py
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ── Configuration ─────────────────────────────────────────────────────────────

OUTPUT_DIR    = Path(__file__).parent / "scraped_content"
REQUEST_DELAY = 1.0   # polite pause between requests (seconds)
HTTP_TIMEOUT  = 30    # seconds before giving up on a slow page

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# ── Resource Manifest ─────────────────────────────────────────────────────────
# 50 items total: 10 per content_type (deck, video, demo, doc, code)

RESOURCES = [

    # ══════════════════════════════════════════════════════════════════════════
    # DECKS — 10 official LaunchDarkly PDFs (direct download from their CDN)
    # ══════════════════════════════════════════════════════════════════════════
    {
        "content_type": "deck",
        "title": "Effective Feature Management — O'Reilly Guide",
        "description": (
            "O'Reilly guide by John Kodumal: releasing and operating software in the "
            "age of continuous delivery. Covers flag patterns, lifecycle, and org design."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/launchdarkly-oreilly-effective-feature-management.pdf?version=0",
        "tags": ["feature-flags", "oreilly", "continuous-delivery", "patterns", "guide"],
        "scrape_type": "pdf_direct",
        "slug": "deck_01_effective_feature_management",
        "filename": "01-effective-feature-management-oreilly.pdf",
    },
    {
        "content_type": "deck",
        "title": "Optimizing Software Delivery with Feature Flags — IDC Whitepaper",
        "description": (
            "IDC analyst whitepaper: how progressive delivery with feature flags "
            "accelerates enterprise software delivery and reduces deployment risk."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/Optimizing-Software-Delivery-By-Harnessing-the-Full-Potential-of-Feature-Flags-IDC.pdf?version=0",
        "tags": ["idc", "whitepaper", "enterprise", "progressive-delivery", "research"],
        "scrape_type": "pdf_direct",
        "slug": "deck_02_idc_whitepaper",
        "filename": "02-idc-whitepaper-optimizing-delivery.pdf",
    },
    {
        "content_type": "deck",
        "title": "LaunchDarkly Security Overview",
        "description": (
            "Official security overview: data handling, infrastructure, "
            "compliance posture, SSO/SCIM, and enterprise security controls."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/launchdarkly-security-overview.pdf?version=0",
        "tags": ["security", "compliance", "enterprise", "sso", "overview"],
        "scrape_type": "pdf_direct",
        "slug": "deck_03_security_overview",
        "filename": "03-launchdarkly-security-overview.pdf",
    },
    {
        "content_type": "deck",
        "title": "Feature Flags for Beginners",
        "description": (
            "Introductory guide covering what feature flags are, why teams use them, "
            "and a practical framework for getting started with feature management."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/feature-flags-for-beginners-launchdarkly.pdf?version=0",
        "tags": ["feature-flags", "beginners", "onboarding", "intro"],
        "scrape_type": "pdf_direct",
        "slug": "deck_04_feature_flags_beginners",
        "filename": "04-feature-flags-for-beginners.pdf",
    },
    {
        "content_type": "deck",
        "title": "30 Feature Flagging Best Practices — Mega Guide",
        "description": (
            "Comprehensive 30-practice guide covering flag naming, lifecycle management, "
            "targeting, cleanup, organizational patterns, and common pitfalls to avoid."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/30-feature-flagging-best-practices-mega-guide.pdf?version=0",
        "tags": ["best-practices", "feature-flags", "naming", "lifecycle", "patterns"],
        "scrape_type": "pdf_direct",
        "slug": "deck_05_30_best_practices",
        "filename": "05-30-feature-flagging-best-practices.pdf",
    },
    {
        "content_type": "deck",
        "title": "Use Case Ebook: Safe Software Releases",
        "description": (
            "Practical ebook on using LaunchDarkly for safe releases: progressive "
            "rollouts, canary deployments, kill switches, and incident response."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/UC1_Release_Ebook.pdf?version=0",
        "tags": ["release", "canary", "rollout", "kill-switch", "ebook"],
        "scrape_type": "pdf_direct",
        "slug": "deck_06_uc_release_ebook",
        "filename": "06-use-case-release-ebook.pdf",
    },
    {
        "content_type": "deck",
        "title": "Use Case Ebook: Database Migrations with Feature Flags",
        "description": (
            "How to use feature flags to safely manage database schema migrations: "
            "shadow reads, dual writes, and zero-downtime cutover patterns."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/UC2_Migration_Ebook.pdf?version=0",
        "tags": ["database", "migration", "zero-downtime", "dual-write", "ebook"],
        "scrape_type": "pdf_direct",
        "slug": "deck_07_uc_migration_ebook",
        "filename": "07-use-case-migration-ebook.pdf",
    },
    {
        "content_type": "deck",
        "title": "Use Case Ebook: Targeted Feature Delivery",
        "description": (
            "Deep dive into LaunchDarkly targeting: user segments, percentage rollouts, "
            "attribute-based rules, and personalisation patterns at scale."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/UC3_Targeting_Ebook.pdf?version=0",
        "tags": ["targeting", "segments", "personalisation", "rollout", "ebook"],
        "scrape_type": "pdf_direct",
        "slug": "deck_08_uc_targeting_ebook",
        "filename": "08-use-case-targeting-ebook.pdf",
    },
    {
        "content_type": "deck",
        "title": "Use Case Ebook: Experimentation with Feature Flags",
        "description": (
            "How to run A/B tests and multivariate experiments using LaunchDarkly: "
            "metric selection, stats engine, result interpretation, and iteration."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/UC4_Experimentation_Ebook.pdf",
        "tags": ["experimentation", "ab-testing", "metrics", "stats-engine", "ebook"],
        "scrape_type": "pdf_direct",
        "slug": "deck_09_uc_experimentation_ebook",
        "filename": "09-use-case-experimentation-ebook.pdf",
    },
    {
        "content_type": "deck",
        "title": "Continuous Integration, Delivery & Deployment — O'Reilly Guide",
        "description": (
            "O'Reilly guide on CI/CD/CD practices with LaunchDarkly: how feature flags "
            "fit into modern pipelines, trunk-based development, and deployment automation."
        ),
        "source_url": "https://go.launchdarkly.com/rs/850-KKH-319/images/LaunchDarkly_OReilly_ContinuousIntegrationDeliveryDeployment.pdf?version=1",
        "tags": ["ci-cd", "oreilly", "pipelines", "trunk-based", "devops"],
        "scrape_type": "pdf_direct",
        "slug": "deck_10_cicd_oreilly",
        "filename": "10-cicd-oreilly-guide.pdf",
    },

    # ══════════════════════════════════════════════════════════════════════════
    # VIDEOS — 10 YouTube videos (oEmbed metadata + thumbnail download)
    # ══════════════════════════════════════════════════════════════════════════
    {
        "content_type": "video",
        "title": "Hands-On with Feature Flags in LaunchDarkly and Replit",
        "description": (
            "Explore feature flags hands-on using LaunchDarkly templates in Replit — "
            "no pre-existing application required."
        ),
        "source_url": "https://www.youtube.com/watch?v=NGomToVLMuA",
        "tags": ["feature-flags", "replit", "hands-on", "tutorial"],
        "scrape_type": "youtube",
        "slug": "video_01_feature_flags_replit",
    },
    {
        "content_type": "video",
        "title": "First Feature Flags in Under 5 Minutes with LaunchDarkly",
        "description": (
            "Cody from LaunchDarkly demos setting up a React app with the SDK, "
            "configuring flags, and using release targeting with segments."
        ),
        "source_url": "https://www.youtube.com/watch?v=nbafNpnLsJ8",
        "tags": ["quickstart", "react", "sdk", "5-minute", "tutorial"],
        "scrape_type": "youtube",
        "slug": "video_02_first_flags_5_minutes",
    },
    {
        "content_type": "video",
        "title": "LaunchDarkly Core Capabilities Demo",
        "description": (
            "A solutions engineer walks through core features: decoupling deploys "
            "from releases, targeted rollouts, A/B testing, and instant rollbacks."
        ),
        "source_url": "https://www.youtube.com/watch?v=f2MZphogltQ",
        "tags": ["demo", "core-capabilities", "rollout", "ab-testing", "se"],
        "scrape_type": "youtube",
        "slug": "video_03_core_capabilities_demo",
    },
    {
        "content_type": "video",
        "title": "How LaunchDarkly Helps You Release Features Confidently",
        "description": (
            "Peter McCarron walks through Release Pipelines, Release Guardian, and "
            "migration flag types for zero-downtime database changes."
        ),
        "source_url": "https://www.youtube.com/watch?v=KvAJ6t7TPlA",
        "tags": ["release", "release-guardian", "pipelines", "migration", "demo"],
        "scrape_type": "youtube",
        "slug": "video_04_release_confidently",
    },
    {
        "content_type": "video",
        "title": "Using LaunchDarkly Feature Flags in AWS Serverless",
        "description": (
            "Webinar with Brian Rinaldi (LaunchDarkly) and Welly Siauw (AWS): "
            "integrating feature flags into AWS Lambda and serverless architectures."
        ),
        "source_url": "https://www.youtube.com/watch?v=bsAvijDLO7I",
        "tags": ["aws", "serverless", "lambda", "integration", "webinar"],
        "scrape_type": "youtube",
        "slug": "video_05_aws_serverless",
    },
    {
        "content_type": "video",
        "title": "Understanding Feature Flags with LaunchDarkly",
        "description": (
            "Foundational overview of feature flags: what they are, why they matter, "
            "and how LaunchDarkly makes feature management scalable."
        ),
        "source_url": "https://www.youtube.com/watch?v=uPCSrWi9IV8",
        "tags": ["feature-flags", "overview", "foundational", "explainer"],
        "scrape_type": "youtube",
        "slug": "video_06_understanding_feature_flags",
    },
    {
        "content_type": "video",
        "title": "Feature Flagging with LaunchDarkly and Visual Studio Code",
        "description": (
            "Brian Rinaldi demos the LaunchDarkly VS Code extension: managing flags "
            "directly from the editor, both server-side and client-side."
        ),
        "source_url": "https://www.youtube.com/watch?v=S06fs9O9lvI",
        "tags": ["vs-code", "ide", "developer-tooling", "extension", "demo"],
        "scrape_type": "youtube",
        "slug": "video_07_vscode_extension",
    },
    {
        "content_type": "video",
        "title": "How to Build an A/B Test with LaunchDarkly",
        "description": (
            "Step-by-step guide to creating A/B tests in LaunchDarkly: segments, "
            "variations, metric selection, randomisation units, and audience controls."
        ),
        "source_url": "https://www.youtube.com/watch?v=O9aaugDTGD0",
        "tags": ["ab-testing", "experimentation", "metrics", "tutorial", "2025"],
        "scrape_type": "youtube",
        "slug": "video_08_ab_test_tutorial",
    },
    {
        "content_type": "video",
        "title": "Your First Feature Flag in React with LaunchDarkly",
        "description": (
            "Full walkthrough of building a React app from scratch with LaunchDarkly: "
            "boolean flags, component swapping, and context setup."
        ),
        "source_url": "https://www.youtube.com/watch?v=CacXKjYURdo",
        "tags": ["react", "tutorial", "boolean-flags", "sdk", "beginner"],
        "scrape_type": "youtube",
        "slug": "video_09_react_first_flag",
    },
    {
        "content_type": "video",
        "title": "Feature Flag Automation in LaunchDarkly",
        "description": (
            "How to use LaunchDarkly automation: scheduling flag changes, building "
            "multi-step workflows, Flag Triggers, and Zapier integrations."
        ),
        "source_url": "https://www.youtube.com/watch?v=2-TKWm0s9gs",
        "tags": ["automation", "scheduling", "workflows", "triggers", "zapier"],
        "scrape_type": "youtube",
        "slug": "video_10_flag_automation",
    },

    # ══════════════════════════════════════════════════════════════════════════
    # DEMOS — 10 LaunchDarkly blog walkthroughs & product posts
    # ══════════════════════════════════════════════════════════════════════════
    {
        "content_type": "demo",
        "title": "7 Mistakes You're Making with Feature Flags",
        "description": (
            "Common feature flag anti-patterns: bad naming, scope creep, missing "
            "cleanup, and over-concentration of flag ownership — and how to fix them."
        ),
        "source_url": "https://launchdarkly.com/blog/feature-flag-mistakes",
        "tags": ["best-practices", "anti-patterns", "tips", "blog"],
        "scrape_type": "webpage",
        "slug": "demo_01_feature_flag_mistakes",
    },
    {
        "content_type": "demo",
        "title": "Release Management Best Practices with Feature Flags",
        "description": (
            "Ring deployments and percentage-based rollouts for risk-managed releases, "
            "with step-by-step LaunchDarkly walkthroughs."
        ),
        "source_url": "https://launchdarkly.com/blog/release-management-flags-best-practices",
        "tags": ["release-management", "rollout", "ring-deployment", "blog"],
        "scrape_type": "webpage",
        "slug": "demo_02_release_management",
    },
    {
        "content_type": "demo",
        "title": "Testing in Production for Safety and Sanity",
        "description": (
            "Why and how to safely test in production using feature flags: "
            "targeting, kill switches, and observability best practices."
        ),
        "source_url": "https://launchdarkly.com/blog/testing-in-production-for-safety-and-sanity/",
        "tags": ["testing", "production", "safety", "observability", "blog"],
        "scrape_type": "webpage",
        "slug": "demo_03_testing_in_production",
    },
    {
        "content_type": "demo",
        "title": "7 Feature Flag Best Practices for Short-Term and Permanent Flags",
        "description": (
            "How to distinguish short-lived release flags from permanent operational "
            "flags — and how to manage each type through its full lifecycle."
        ),
        "source_url": "https://launchdarkly.com/blog/best-practices-short-term-permanent-flags",
        "tags": ["best-practices", "lifecycle", "permanent-flags", "release-flags"],
        "scrape_type": "webpage",
        "slug": "demo_04_short_term_permanent_flags",
    },
    {
        "content_type": "demo",
        "title": "Best Practices for Flag Targeting Rules in Experiments",
        "description": (
            "How to define experiment audiences using targeting rules: technology "
            "factors, product tiers, and risk-mitigation scope controls."
        ),
        "source_url": "https://launchdarkly.com/blog/best-practices-for-using-flag-targeting-rules-in-an-experiment",
        "tags": ["experimentation", "targeting", "audience", "best-practices"],
        "scrape_type": "webpage",
        "slug": "demo_05_targeting_rules_experiments",
    },
    {
        "content_type": "demo",
        "title": "Operational Feature Flags Best Practices",
        "description": (
            "Patterns for using flags as operational circuit breakers: kill switches, "
            "rate limiters, maintenance modes, and dark launches."
        ),
        "source_url": "https://launchdarkly.com/blog/operational-flags-best-practices",
        "tags": ["operational", "circuit-breaker", "kill-switch", "dark-launch"],
        "scrape_type": "webpage",
        "slug": "demo_06_operational_flags",
    },
    {
        "content_type": "demo",
        "title": "Launch Week 2024: New Insights, Integrations & Release Management",
        "description": (
            "LaunchDarkly Launch Week 2024 recap: Launch Insights Dashboard, "
            "automated archival, Release Pipelines, and scale-management features."
        ),
        "source_url": "https://launchdarkly.com/blog/launch-week-2024-feature-management-releases",
        "tags": ["launch-week", "2024", "release-pipelines", "insights", "new-features"],
        "scrape_type": "webpage",
        "slug": "demo_07_launch_week_2024",
    },
    {
        "content_type": "demo",
        "title": "Introducing Enriched Experiment Results",
        "description": (
            "New experiment analytics in LaunchDarkly: conversion and exposure "
            "visibility, enhanced statistical calculations, and expected loss metrics."
        ),
        "source_url": "https://launchdarkly.com/blog/introducing-enriched-experiment-results",
        "tags": ["experimentation", "analytics", "statistics", "metrics", "2024"],
        "scrape_type": "webpage",
        "slug": "demo_08_enriched_experiment_results",
    },
    {
        "content_type": "demo",
        "title": "Embed Powerful Experiments into Every Feature Release",
        "description": (
            "How to shift left on experimentation: treating A/B tests as part of the "
            "development workflow by designing multi-variant features from the start."
        ),
        "source_url": "https://launchdarkly.com/blog/embedding-powerful-experiments-into-every-release",
        "tags": ["experimentation", "release", "shift-left", "multi-variant", "blog"],
        "scrape_type": "webpage",
        "slug": "demo_09_experiments_in_releases",
    },
    {
        "content_type": "demo",
        "title": "How to Learn More from the Features You Ship",
        "description": (
            "Using LaunchDarkly to build a culture of measurement: attaching metrics "
            "to every release, interpreting results, and iterating faster."
        ),
        "source_url": "https://launchdarkly.com/blog/learn-more-from-the-features-you-ship/",
        "tags": ["metrics", "measurement", "culture", "iteration", "blog"],
        "scrape_type": "webpage",
        "slug": "demo_10_learn_from_features",
    },

    # ══════════════════════════════════════════════════════════════════════════
    # DOCS — 10 LaunchDarkly documentation pages (raw MDX from GitHub)
    #
    # Source repo: github.com/launchdarkly/LaunchDarkly-Docs
    # The docs site blocks scraper requests; raw MDX is identical content.
    # ══════════════════════════════════════════════════════════════════════════
    {
        "content_type": "doc",
        "title": "LaunchDarkly Getting Started Guide",
        "description": (
            "Official getting-started: account setup, first flag, SDK initialisation, "
            "and key concepts for new users."
        ),
        "source_url": "https://docs.launchdarkly.com/home/getting-started",
        "tags": ["docs", "getting-started", "onboarding", "sdk"],
        "scrape_type": "github_mdx",
        "slug": "doc_01_getting_started",
        "mdx_path": "src/content/topics/home/getting-started/index.mdx",
    },
    {
        "content_type": "doc",
        "title": "React Web SDK Reference",
        "description": (
            "SDK reference for the LaunchDarkly React SDK: LDProvider, context setup, "
            "useFlags and useLDClient hooks, and bootstrap patterns."
        ),
        "source_url": "https://docs.launchdarkly.com/sdk/client-side/react/react-web",
        "tags": ["docs", "react", "sdk", "client-side", "hooks"],
        "scrape_type": "github_mdx",
        "slug": "doc_02_react_sdk",
        "mdx_path": "src/content/topics/sdk/client-side/react/index.mdx",
    },
    {
        "content_type": "doc",
        "title": "Experimentation — Overview",
        "description": (
            "Overview of the LaunchDarkly experimentation platform: A/B testing, "
            "metric types, stats engine, and experiment lifecycle management."
        ),
        "source_url": "https://docs.launchdarkly.com/home/experimentation",
        "tags": ["docs", "experimentation", "ab-testing", "stats", "metrics"],
        "scrape_type": "github_mdx",
        "slug": "doc_03_experimentation",
        "mdx_path": "src/content/topics/home/experimentation-about/index.mdx",
    },
    {
        "content_type": "doc",
        "title": "Node.js Server-Side SDK Reference",
        "description": (
            "Complete reference for the LaunchDarkly Node.js server SDK: "
            "initialization, context creation, variation evaluation, and streaming."
        ),
        "source_url": "https://docs.launchdarkly.com/sdk/server-side/node-js",
        "tags": ["docs", "nodejs", "server-side", "sdk", "reference"],
        "scrape_type": "github_mdx",
        "slug": "doc_04_nodejs_sdk",
        "mdx_path": "src/content/topics/sdk/server-side/node/index.mdx",
    },
    {
        "content_type": "doc",
        "title": "Feature Flags — Core Concepts",
        "description": (
            "Core concepts behind LaunchDarkly feature flags: variations, targeting "
            "rules, default values, prerequisites, and flag state."
        ),
        "source_url": "https://docs.launchdarkly.com/home/flags",
        "tags": ["docs", "feature-flags", "core-concepts", "variations", "targeting"],
        "scrape_type": "github_mdx",
        "slug": "doc_05_feature_flags_core",
        "mdx_path": "src/content/topics/home/using-flags/feature-flags.mdx",
    },
    {
        "content_type": "doc",
        "title": "Contexts — User & Multi-Context Targeting",
        "description": (
            "How LaunchDarkly contexts replace users: multi-context architecture, "
            "context kinds, attributes, and upgrading from the user model."
        ),
        "source_url": "https://docs.launchdarkly.com/home/contexts",
        "tags": ["docs", "contexts", "targeting", "multi-context", "migration"],
        "scrape_type": "github_mdx",
        "slug": "doc_06_contexts",
        "mdx_path": "src/content/topics/home/contexts-and-segments/index.mdx",
    },
    {
        "content_type": "doc",
        "title": "Feature Workflows — Approvals & Change Management",
        "description": (
            "How to use LaunchDarkly approval workflows: requesting, reviewing, and "
            "applying flag changes with audit trails and environment controls."
        ),
        "source_url": "https://docs.launchdarkly.com/home/feature-workflows",
        "tags": ["docs", "approvals", "workflows", "change-management", "environments"],
        "scrape_type": "github_mdx",
        "slug": "doc_07_feature_workflows",
        "mdx_path": "src/content/topics/home/feature-workflows/approvals.mdx",
    },
    {
        "content_type": "doc",
        "title": "JavaScript Client-Side SDK Reference",
        "description": (
            "Reference for the LaunchDarkly JavaScript browser SDK: initialization, "
            "variation calls, event tracking, and bootstrapping."
        ),
        "source_url": "https://docs.launchdarkly.com/sdk/client-side/javascript",
        "tags": ["docs", "javascript", "browser", "sdk", "client-side"],
        "scrape_type": "github_mdx",
        "slug": "doc_08_javascript_sdk",
        "mdx_path": "src/content/topics/sdk/client-side/javascript/index.mdx",
    },
    {
        "content_type": "doc",
        "title": "Experiment Metrics — Creating Custom Metrics",
        "description": (
            "How to create custom metrics in LaunchDarkly: click metrics, custom "
            "conversion, custom numeric, and attaching them to experiments."
        ),
        "source_url": "https://docs.launchdarkly.com/home/experimentation/metrics",
        "tags": ["docs", "metrics", "events", "conversion", "experimentation"],
        "scrape_type": "github_mdx",
        "slug": "doc_09_metrics",
        "mdx_path": "src/content/topics/home/experimentation-creating/metrics/index.mdx",
    },
    {
        "content_type": "doc",
        "title": "Datadog Integration — Observability & Flag Events",
        "description": (
            "How to connect LaunchDarkly to Datadog: streaming flag change events "
            "to dashboards, correlating deploys with metrics, and alerting."
        ),
        "source_url": "https://docs.launchdarkly.com/integrations/datadog",
        "tags": ["docs", "datadog", "observability", "monitoring", "integrations"],
        "scrape_type": "github_mdx",
        "slug": "doc_10_datadog_integration",
        "mdx_path": "src/content/topics/integrations/observability/datadog/index.mdx",
    },

    # ══════════════════════════════════════════════════════════════════════════
    # CODE — 10 LaunchDarkly GitHub sample repositories
    # ══════════════════════════════════════════════════════════════════════════
    {
        "content_type": "code",
        "title": "Hello JavaScript — Client-Side SDK Sample",
        "description": (
            "Minimal JavaScript app demonstrating the LaunchDarkly browser SDK: "
            "initialisation, context setup, and flag evaluation."
        ),
        "source_url": "https://github.com/launchdarkly/hello-js",
        "tags": ["code", "javascript", "client-side", "browser", "sample"],
        "scrape_type": "github",
        "slug": "code_01_hello_js",
        "github_repo": "launchdarkly/hello-js",
    },
    {
        "content_type": "code",
        "title": "Hello Node.js Server — LaunchDarkly Sample",
        "description": (
            "Minimal Node.js app showing server-side SDK integration: "
            "initialisation, context, and variation evaluation."
        ),
        "source_url": "https://github.com/launchdarkly/hello-node-server",
        "tags": ["code", "nodejs", "server-side", "sample", "sdk"],
        "scrape_type": "github",
        "slug": "code_02_hello_node_server",
        "github_repo": "launchdarkly/hello-node-server",
    },
    {
        "content_type": "code",
        "title": "Hello Node.js TypeScript — LaunchDarkly Sample",
        "description": (
            "Minimal TypeScript + Node.js app showing typed server-side SDK "
            "integration with context creation and variation evaluation."
        ),
        "source_url": "https://github.com/launchdarkly/hello-node-typescript",
        "tags": ["code", "typescript", "nodejs", "server-side", "sample"],
        "scrape_type": "github",
        "slug": "code_03_hello_node_typescript",
        "github_repo": "launchdarkly/hello-node-typescript",
    },
    {
        "content_type": "code",
        "title": "Hello Python — Server-Side SDK Sample",
        "description": (
            "Minimal Python app demonstrating server-side SDK integration: "
            "LDClient setup, context creation, and variation calls."
        ),
        "source_url": "https://github.com/launchdarkly/hello-python",
        "tags": ["code", "python", "server-side", "sample", "sdk"],
        "scrape_type": "github",
        "slug": "code_04_hello_python",
        "github_repo": "launchdarkly/hello-python",
    },
    {
        "content_type": "code",
        "title": "Hello Go — Server-Side SDK Sample",
        "description": (
            "Minimal Go application showing LaunchDarkly server-side SDK integration "
            "with context creation, flag evaluation, and graceful shutdown."
        ),
        "source_url": "https://github.com/launchdarkly/hello-go",
        "tags": ["code", "go", "golang", "server-side", "sample"],
        "scrape_type": "github",
        "slug": "code_05_hello_go",
        "github_repo": "launchdarkly/hello-go",
    },
    {
        "content_type": "code",
        "title": "Hello Java — Server-Side SDK Sample",
        "description": (
            "Minimal Java application demonstrating the LaunchDarkly server-side SDK: "
            "LDClient initialisation, LDContext builder, and variation evaluation."
        ),
        "source_url": "https://github.com/launchdarkly/hello-java",
        "tags": ["code", "java", "server-side", "sample", "sdk"],
        "scrape_type": "github",
        "slug": "code_06_hello_java",
        "github_repo": "launchdarkly/hello-java",
    },
    {
        "content_type": "code",
        "title": "Hello iOS Swift — Client-Side SDK Sample",
        "description": (
            "Minimal Swift/iOS app showing the LaunchDarkly mobile SDK: "
            "LDClient setup, context, variation evaluation, and change observation."
        ),
        "source_url": "https://github.com/launchdarkly/hello-ios-swift",
        "tags": ["code", "swift", "ios", "mobile", "client-side"],
        "scrape_type": "github",
        "slug": "code_07_hello_ios_swift",
        "github_repo": "launchdarkly/hello-ios-swift",
    },
    {
        "content_type": "code",
        "title": "Hello Ruby — Server-Side SDK Sample",
        "description": (
            "Minimal Ruby application demonstrating the LaunchDarkly server-side SDK: "
            "client initialisation, context, and variation evaluation."
        ),
        "source_url": "https://github.com/launchdarkly/hello-ruby",
        "tags": ["code", "ruby", "server-side", "sample", "sdk"],
        "scrape_type": "github",
        "slug": "code_08_hello_ruby",
        "github_repo": "launchdarkly/hello-ruby",
    },
    {
        "content_type": "code",
        "title": "Hello .NET Server — LaunchDarkly Sample",
        "description": (
            "Minimal .NET/C# server-side application showing LaunchDarkly SDK "
            "integration: LdClient setup, context, and variation calls."
        ),
        "source_url": "https://github.com/launchdarkly/hello-dotnet-server",
        "tags": ["code", "dotnet", "csharp", "server-side", "sample"],
        "scrape_type": "github",
        "slug": "code_09_hello_dotnet_server",
        "github_repo": "launchdarkly/hello-dotnet-server",
    },
    {
        "content_type": "code",
        "title": "Hello Android — Mobile SDK Sample",
        "description": (
            "Minimal Android application demonstrating the LaunchDarkly mobile SDK: "
            "LDClient setup, context creation, and flag evaluation on Android."
        ),
        "source_url": "https://github.com/launchdarkly/hello-android",
        "tags": ["code", "android", "mobile", "kotlin", "client-side"],
        "scrape_type": "github",
        "slug": "code_10_hello_android",
        "github_repo": "launchdarkly/hello-android",
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg, level="INFO"):
    prefix = {"INFO": "  ·", "OK": "  ✓", "WARN": "  !", "ERR": "  ✗", "HEAD": "\n▶"}
    print(f"{prefix.get(level, '  ·')} {msg}", flush=True)


def safe_get(url, timeout=None):
    """GET with error handling; returns None on failure."""
    t = timeout or HTTP_TIMEOUT
    try:
        resp = requests.get(url, headers=HEADERS, timeout=t)
        resp.raise_for_status()
        return resp
    except requests.RequestException as exc:
        log(f"GET failed: {url[:80]}  ({exc})", "WARN")
        return None


def save_file(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = "wb" if isinstance(content, bytes) else "w"
    enc = {} if isinstance(content, bytes) else {"encoding": "utf-8"}
    with open(path, mode, **enc) as fh:
        fh.write(content)


def extract_og_meta(html):
    """Return Open Graph / standard meta tags from an HTML string."""
    soup = BeautifulSoup(html, "lxml")
    meta = {}
    for tag in soup.find_all("meta"):
        prop = tag.get("property") or tag.get("name") or ""
        content = tag.get("content") or ""
        if prop and content:
            meta[prop] = content
    return meta


def extract_readable_text(html, max_chars=10000):
    """Strip tags and return readable body text (capped)."""
    soup = BeautifulSoup(html, "lxml")
    for el in soup(["script", "style", "nav", "header", "footer", "aside"]):
        el.decompose()
    text = soup.get_text(separator="\n", strip=True)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return "\n".join(lines)[:max_chars]


# ── Scrapers ──────────────────────────────────────────────────────────────────

def scrape_pdf_direct(resource, folder):
    """Stream-download a direct PDF URL and save it to disk."""
    url      = resource["source_url"]
    filename = resource.get("filename", "presentation.pdf")
    log(f"Downloading PDF: {filename}")

    resp = safe_get(url, timeout=60)
    if not resp:
        return {"status": "failed", "error": "HTTP request failed"}

    content_type = resp.headers.get("content-type", "")
    if "pdf" not in content_type.lower():
        return {"status": "failed", "error": f"Unexpected content-type: {content_type}"}

    pdf_path = folder / filename
    save_file(pdf_path, resp.content)
    size_kb = len(resp.content) // 1024
    log(f"Saved {filename}  ({size_kb:,} KB)", "OK")

    return {
        "status": "ok",
        "scraped_title":       resource["title"],
        "scraped_description": resource["description"],
        "local_pdf":           str(pdf_path.relative_to(OUTPUT_DIR.parent)),
        "file_size_bytes":     len(resp.content),
        "file_mime_type":      "application/pdf",
        "filename":            filename,
    }


def scrape_youtube(resource, folder):
    """
    Use YouTube's free oEmbed endpoint to retrieve title, author, and
    thumbnail URL, then download the thumbnail image.
    """
    url = resource["source_url"]
    log(f"Fetching YouTube oEmbed: {url}")
    oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
    resp = safe_get(oembed_url)
    if not resp:
        return {"status": "failed", "error": "oEmbed request failed"}

    data          = resp.json()
    thumbnail_url = data.get("thumbnail_url", "")

    thumbnail_path = ""
    if thumbnail_url:
        time.sleep(REQUEST_DELAY)
        img_resp = safe_get(thumbnail_url)
        if img_resp:
            img_file = folder / "thumbnail.jpg"
            save_file(img_file, img_resp.content)
            thumbnail_path = str(img_file.relative_to(OUTPUT_DIR.parent))
            log(f"Saved thumbnail.jpg", "OK")

    save_file(folder / "oembed.json", json.dumps(data, indent=2))

    return {
        "status":        "ok",
        "scraped_title": data.get("title", resource["title"]),
        "author":        data.get("author_name", ""),
        "thumbnail_url": thumbnail_url,
        "local_thumbnail": thumbnail_path,
        "width":         data.get("width"),
        "height":        data.get("height"),
    }


def scrape_webpage(resource, folder):
    """
    Fetch a standard webpage (blog post, docs page), extract OG meta,
    save full HTML, and write a cleaned plain-text version.
    """
    url = resource["source_url"]
    log(f"Fetching webpage: {url}")
    resp = safe_get(url)
    if not resp:
        return {"status": "failed", "error": "HTTP request failed"}

    meta          = extract_og_meta(resp.text)
    scraped_title = meta.get("og:title", resource["title"])
    scraped_desc  = meta.get("og:description", resource["description"])
    image_url     = meta.get("og:image", "")

    save_file(folder / "page.html", resp.text)
    text = extract_readable_text(resp.text)
    save_file(folder / "content.txt", text)

    image_path = ""
    if image_url:
        time.sleep(REQUEST_DELAY)
        img_resp = safe_get(image_url)
        if img_resp:
            ext = image_url.split("?")[0].rsplit(".", 1)[-1] or "jpg"
            ext = ext if ext in ("jpg", "jpeg", "png", "webp", "gif") else "jpg"
            img_file = folder / f"preview.{ext}"
            save_file(img_file, img_resp.content)
            image_path = str(img_file.relative_to(OUTPUT_DIR.parent))
            log(f"Saved preview image → {img_file.name}", "OK")

    return {
        "status":              "ok",
        "scraped_title":       scraped_title,
        "scraped_description": scraped_desc,
        "image_url":           image_url,
        "local_image":         image_path,
        "local_html":          str((folder / "page.html").relative_to(OUTPUT_DIR.parent)),
        "local_text":          str((folder / "content.txt").relative_to(OUTPUT_DIR.parent)),
        "text_length":         len(text),
    }


def scrape_github_mdx(resource, folder):
    """
    Download a specific MDX documentation file from the public
    LaunchDarkly-Docs GitHub repository (raw.githubusercontent.com).
    Saves the MDX source and extracts a plain-text preview.
    """
    repo      = "launchdarkly/LaunchDarkly-Docs"
    branch    = "main"
    mdx_path  = resource["mdx_path"]
    raw_url   = f"https://raw.githubusercontent.com/{repo}/{branch}/{mdx_path}"
    filename  = mdx_path.rsplit("/", 1)[-1]

    log(f"Fetching MDX: {mdx_path.split('topics/')[-1]}")
    resp = safe_get(raw_url)
    if not resp:
        return {"status": "failed", "error": "GitHub raw fetch failed"}

    mdx_content = resp.text
    save_file(folder / filename, mdx_content)
    log(f"Saved {filename}  ({len(mdx_content):,} chars)", "OK")

    # Extract a plain-text preview by stripping MDX/JSX tags
    text = re.sub(r"<[^>]+>", "", mdx_content)            # strip HTML/JSX tags
    text = re.sub(r"import\s+.*\n", "", text)              # strip import lines
    text = re.sub(r"export\s+.*\n", "", text)              # strip export lines
    text = re.sub(r"\{/\*.*?\*/\}", "", text, flags=re.S)  # strip MDX comments
    text = "\n".join(ln for ln in text.splitlines() if ln.strip())
    text = text[:10000]
    save_file(folder / "content.txt", text)

    # Extract frontmatter title if present
    title_match = re.search(r"^title:\s*[\"']?(.+?)[\"']?\s*$", mdx_content, re.M)
    scraped_title = title_match.group(1) if title_match else resource["title"]

    return {
        "status":              "ok",
        "scraped_title":       scraped_title,
        "scraped_description": resource["description"],
        "raw_url":             raw_url,
        "local_mdx":           str((folder / filename).relative_to(OUTPUT_DIR.parent)),
        "local_text":          str((folder / "content.txt").relative_to(OUTPUT_DIR.parent)),
        "char_count":          len(mdx_content),
    }


def scrape_github(resource, folder):
    """
    Use the GitHub public REST API (no auth required for public repos) to
    fetch repo metadata, then download the README and file tree.
    """
    repo = resource["github_repo"]
    log(f"Fetching GitHub repo: {repo}")

    api_resp = safe_get(f"https://api.github.com/repos/{repo}")
    if not api_resp:
        return {"status": "failed", "error": "GitHub API request failed"}

    repo_data      = api_resp.json()
    default_branch = repo_data.get("default_branch", "main")

    save_file(folder / "repo_meta.json", json.dumps(repo_data, indent=2))

    readme_path = ""
    for readme_name in ("README.md", "readme.md", "README.rst", "README"):
        time.sleep(REQUEST_DELAY)
        raw_url = (
            f"https://raw.githubusercontent.com/{repo}/"
            f"{default_branch}/{readme_name}"
        )
        readme_resp = safe_get(raw_url)
        if readme_resp and readme_resp.status_code == 200:
            readme_file = folder / readme_name
            save_file(readme_file, readme_resp.text)
            readme_path = str(readme_file.relative_to(OUTPUT_DIR.parent))
            log(f"Saved {readme_name}", "OK")
            break

    time.sleep(REQUEST_DELAY)
    tree_resp  = safe_get(f"https://api.github.com/repos/{repo}/git/trees/{default_branch}")
    file_tree  = []
    if tree_resp:
        file_tree = [item["path"] for item in tree_resp.json().get("tree", [])]
        save_file(folder / "file_tree.json", json.dumps(file_tree, indent=2))

    return {
        "status":              "ok",
        "scraped_title":       repo_data.get("name", resource["title"]),
        "scraped_description": repo_data.get("description") or resource["description"],
        "stars":               repo_data.get("stargazers_count", 0),
        "forks":               repo_data.get("forks_count", 0),
        "language":            repo_data.get("language", ""),
        "default_branch":      default_branch,
        "local_readme":        readme_path,
        "file_tree":           file_tree[:50],
    }


# ── Dispatch ──────────────────────────────────────────────────────────────────

SCRAPER_MAP = {
    "pdf_direct": scrape_pdf_direct,
    "youtube":    scrape_youtube,
    "webpage":    scrape_webpage,
    "github_mdx": scrape_github_mdx,
    "github":     scrape_github,
}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest_items = []
    errors         = []
    scraped_at     = datetime.now(timezone.utc).isoformat()

    for i, resource in enumerate(RESOURCES, start=1):
        ctype = resource["content_type"]
        log(
            f"[{i:02d}/{len(RESOURCES)}] {ctype.upper()} — {resource['title']}",
            "HEAD",
        )

        folder     = OUTPUT_DIR / f"{ctype}s" / resource["slug"]
        folder.mkdir(parents=True, exist_ok=True)

        scraper_fn = SCRAPER_MAP.get(resource["scrape_type"])
        if not scraper_fn:
            log(f"Unknown scrape_type '{resource['scrape_type']}' — skipping", "ERR")
            errors.append(resource["slug"])
            continue

        result = scraper_fn(resource, folder)

        record = {
            "slug":          resource["slug"],
            "content_type":  ctype,
            "title":         result.get("scraped_title") or resource["title"],
            "description":   result.get("scraped_description") or resource["description"],
            "source_url":    resource["source_url"],
            "tags":          resource["tags"],
            "scrape_status": result.get("status", "unknown"),
            "scraped_at":    scraped_at,
            "scrape_detail": {k: v for k, v in result.items() if k != "status"},
            # Fields matching content_items schema
            "file_url":        resource["source_url"],
            "is_external_url": True,
        }
        manifest_items.append(record)

        save_file(folder / "metadata.json", json.dumps(record, indent=2))
        log("Saved metadata.json", "OK")

        if result.get("status") != "ok":
            errors.append(resource["slug"])
            log("Scrape may be incomplete", "WARN")

        time.sleep(REQUEST_DELAY)

    # ── Manifest ──────────────────────────────────────────────────────────────
    manifest = {
        "generated_at": scraped_at,
        "total":        len(manifest_items),
        "by_type": {
            ctype: [r for r in manifest_items if r["content_type"] == ctype]
            for ctype in ["deck", "video", "demo", "doc", "code"]
        },
        "errors": errors,
        "items":  manifest_items,
    }
    manifest_path = OUTPUT_DIR / "manifest.json"
    save_file(manifest_path, json.dumps(manifest, indent=2))

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "─" * 60)
    print(f"  Scrape complete — {len(manifest_items)} items processed")
    for ctype in ["deck", "video", "demo", "doc", "code"]:
        ok = sum(
            1 for r in manifest_items
            if r["content_type"] == ctype and r["scrape_status"] == "ok"
        )
        total = sum(1 for r in RESOURCES if r["content_type"] == ctype)
        print(f"    {ctype:<8}  {ok}/{total} ok")
    if errors:
        print(f"\n  Partial failures ({len(errors)}): {', '.join(errors)}")
    print(f"\n  Output   → {OUTPUT_DIR}")
    print(f"  Manifest → {manifest_path}")
    print("─" * 60 + "\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
